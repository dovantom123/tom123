"use strict";
// Chạy máy chủ thật trên cổng ngẫu nhiên với cấu hình tạm: hook, đăng nhập, Host, từ chối mở không khóa.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SID = "abcdef12-3456-7890-abcd-ef1234567890", KEY8 = "c-" + SID.slice(0, 8);

function setup(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-srv-"));
  const claude = path.join(dir, "claude"), proj = path.join(claude, "projects", "-tmp-proj");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, SID + ".jsonl"), JSON.stringify({ type: "user", timestamp: new Date().toISOString(), message: { content: "xin chào" } }) + "\n");
  const cfg = path.join(dir, "config.json");
  fs.writeFileSync(cfg, JSON.stringify({ projects: [], claudeDir: claude, codexDir: path.join(dir, "codex"), dataDir: path.join(dir, "data"), ...extra }));
  return { dir, cfg };
}
function start(extra, env = {}) {
  const { dir, cfg } = setup(extra);
  const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, VPAO_CONFIG: cfg, PORT: "0", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; proc.stderr.on("data", (d) => (err += d));
  const ep = path.join(dir, "data", ".hook-endpoint.json");
  const ready = new Promise((ok, bad) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      try { const j = JSON.parse(fs.readFileSync(ep, "utf8")); if (j.port) { clearInterval(iv); ok({ ...j }); } } catch {}
      if (Date.now() - t0 > 8000) { clearInterval(iv); bad(new Error("server không lên: " + err)); }
    }, 50);
    proc.on("exit", (c) => { clearInterval(iv); bad(new Error("server thoát sớm (" + c + "): " + err)); });
  });
  const stop = () => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { proc, ready, stop, dir, errText: () => err };
}
// http.request để đặt được header Host / Cookie tùy ý
function req(port, method, p, { headers = {}, body } = {}) {
  return new Promise((ok, bad) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, method, headers: { ...(body ? { "Content-Length": Buffer.byteLength(body), "Content-Type": "application/x-www-form-urlencoded" } : {}), ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on("error", bad); r.end(body);
  });
}
const hook = (s, ev, token = s.token) => req(s.port, "POST", "/hook", { headers: { "X-VP-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ session_id: SID, hook_event_name: ev.e, ...ev.x }) });
const state = async (s) => JSON.parse((await req(s.port, "GET", "/state")).body);
const agentOf = (st) => st.agents.find((a) => a.key === KEY8);

test("hook: token sai bị từ chối, token đúng được nhận, trạng thái đổi theo hook", async () => {
  const srv = start(); const s = await srv.ready;
  try {
    assert.equal((await hook(s, { e: "UserPromptSubmit" }, "sai")).status, 401);
    assert.equal((await req(s.port, "POST", "/hook", { body: "{}" })).status, 401);
    assert.equal((await req(s.port, "GET", "/hook")).status, 405);
    let a = agentOf(await state(s)); assert.ok(a, "phiên Claude được tìm thấy từ nhật ký"); assert.equal(a.nguon, "nhat-ky");

    assert.equal((await hook(s, { e: "UserPromptSubmit" })).status, 204);
    a = agentOf(await state(s)); assert.equal(a.nguon, "hook"); assert.equal(a.status, "active");

    assert.equal((await hook(s, { e: "PermissionRequest", x: { tool_name: "Bash" } })).status, 204);
    let st = await state(s); a = agentOf(st);
    assert.equal(a.hook.phase, "waiting"); assert.equal(a.status, "idle");
    assert.ok(st.asks.some((x) => x.who === KEY8 && x.kind === "hoi" && /Bash/.test(x.text)), "hiện ở Cần anh");

    await hook(s, { e: "PostToolUse", x: { tool_name: "Bash" } });
    st = await state(s); assert.ok(!st.asks.some((x) => x.who === KEY8), "duyệt xong thì hết Cần anh");

    await hook(s, { e: "StopFailure", x: { error: "rate_limit" } });
    a = agentOf(await state(s)); assert.equal(a.flag, "blocked");

    await hook(s, { e: "SessionEnd", x: { reason: "other" } });
    assert.equal(agentOf(await state(s)).status, "away");

    assert.equal((await hook(s, { e: "KhongCoSuKienNay" })).status, 422);
  } finally { srv.stop(); }
});
test("hook: bị từ chối khi đi qua đường hầm/proxy dù có token", async () => {
  const srv = start(); const s = await srv.ready;
  try {
    const r = await req(s.port, "POST", "/hook", { headers: { "X-VP-Token": s.token, "cf-ray": "abc", "Content-Type": "application/json" }, body: JSON.stringify({ session_id: SID, hook_event_name: "Stop" }) });
    assert.equal(r.status, 401);
  } finally { srv.stop(); }
});
test("Host lạ bị chặn khi chỉ nghe trên máy này và chưa có khóa", async () => {
  const srv = start(); const s = await srv.ready;
  try {
    assert.equal((await req(s.port, "GET", "/state", { headers: { Host: "evil.example" } })).status, 421);
    assert.equal((await req(s.port, "GET", "/state", { headers: { Host: `localhost:${s.port}` } })).status, 200);
    const h = await req(s.port, "GET", "/state");
    assert.equal(h.headers["x-content-type-options"], "nosniff"); assert.equal(h.headers["x-frame-options"], "SAMEORIGIN");
  } finally { srv.stop(); }
});
test("không khởi động khi host mở ra mạng mà chưa có accessKey", async () => {
  const { dir, cfg } = setup({ host: "0.0.0.0" });
  try {
    const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: { ...process.env, VPAO_CONFIG: cfg, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    let err = ""; proc.stderr.on("data", (d) => (err += d));
    const code = await new Promise((ok) => proc.on("exit", ok));
    assert.equal(code, 1); assert.match(err, /accessKey/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("accessKey: không nhận ?key=, đăng nhập bằng POST, header cho công cụ, khóa sau 5 lần sai", async () => {
  const srv = start({ accessKey: "khoa-bi-mat-123" }); const s = await srv.ready;
  try {
    assert.equal((await req(s.port, "GET", "/state")).status, 401);
    assert.equal((await req(s.port, "GET", "/state?key=khoa-bi-mat-123")).status, 401, "?key= không còn tác dụng");
    assert.equal((await req(s.port, "GET", "/?key=khoa-bi-mat-123")).status, 401);
    const bad = await req(s.port, "POST", "/login", { body: "key=sai" }); assert.equal(bad.status, 401); assert.ok(!bad.headers["set-cookie"]);
    const ok = await req(s.port, "POST", "/login", { body: "key=khoa-bi-mat-123" });
    assert.equal(ok.status, 303); const cookie = String(ok.headers["set-cookie"]);
    assert.match(cookie, /vpk=[0-9a-f]{32}/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await req(s.port, "GET", "/state", { headers: { Cookie: cookie.split(";")[0] } })).status, 200);
    assert.equal((await req(s.port, "GET", "/state", { headers: { "X-VP-Key": "khoa-bi-mat-123" } })).status, 200);
    assert.equal((await req(s.port, "GET", "/state", { headers: { "X-VP-Key": "sai" } })).status, 401);
    // hook vẫn đi bằng token, không cần khóa xem
    assert.equal((await hook(s, { e: "Stop" })).status, 204);
    // đăng nhập đúng đã xóa bộ đếm; 5 lần sai liên tiếp → lần sau bị khóa kể cả khi đúng
    for (let i = 0; i < 5; i++) await req(s.port, "POST", "/login", { body: "key=sai" });
    assert.equal((await req(s.port, "POST", "/login", { body: "key=khoa-bi-mat-123" })).status, 429);
  } finally { srv.stop(); }
});
test("hooks/emit.js: chỉ gửi trường cần thiết tới máy chủ, thoát 0 khi máy chủ tắt", async () => {
  const srv = start(); const s = await srv.ready;
  try {
    const cfg = path.join(srv.dir, "config.json");
    const run = (input) => new Promise((ok) => { const p = spawn(process.execPath, [path.join(ROOT, "hooks", "emit.js")], { env: { ...process.env, VPAO_CONFIG: cfg }, stdio: ["pipe", "pipe", "pipe"] }); let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("exit", (c) => ok({ code: c, out })); p.stdin.end(input); });
    const r = await run(JSON.stringify({ hook_event_name: "PermissionRequest", session_id: SID, tool_name: "Bash", tool_input: { command: "rm -rf / --secret=abc" }, cwd: "/x" }));
    assert.equal(r.code, 0); assert.equal(r.out, "", "không in gì ra stdout");
    const a = agentOf(await state(s)); assert.equal(a.hook.phase, "waiting");
    assert.ok(!JSON.stringify(await state(s)).includes("rm -rf"), "nội dung lệnh không lên văn phòng");
    assert.equal((await run("không phải json")).code, 0);
    srv.proc.kill(); await new Promise((ok) => srv.proc.on("exit", ok));
    const r2 = await run(JSON.stringify({ hook_event_name: "Stop", session_id: SID })); assert.equal(r2.code, 0);
  } finally { srv.stop(); }
});

test("cảnh báo Telegram: Cần anh từ hook được gửi tới Telegram (giả), không gửi việc có sẵn lúc khởi động", async () => {
  const got = [];
  const tg = http.createServer((rq, rs) => { let b = ""; rq.on("data", (c) => (b += c)); rq.on("end", () => { got.push({ url: rq.url, body: JSON.parse(b || "{}") }); rs.writeHead(200, { "Content-Type": "application/json" }); rs.end(JSON.stringify({ ok: true, result: {} })); }); });
  await new Promise((ok) => tg.listen(0, "127.0.0.1", ok));
  const srv = start({ alerts: { telegram: { botToken: "111:TESTTOKEN", chatId: "42" }, dashboardUrl: "http://localhost:7788" } },
    { VPAO_TELEGRAM_API: `http://127.0.0.1:${tg.address().port}`, VPAO_ALERT_TICK_MS: "100" });
  const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 600)); // lượt đầu ghi nhận hiện trạng
    assert.equal(got.length, 0);
    await hook(s, { e: "PermissionRequest", x: { tool_name: "Bash" } });
    const t0 = Date.now(); while (!got.length && Date.now() - t0 < 5000) await new Promise((ok) => setTimeout(ok, 50));
    assert.equal(got.length, 1, "đúng một tin"); assert.equal(got[0].url, "/bot111:TESTTOKEN/sendMessage");
    assert.equal(got[0].body.chat_id, "42"); assert.match(got[0].body.text, /Chờ bạn duyệt quyền: Bash/); assert.match(got[0].body.text, /http:\/\/localhost:7788$/);
    await new Promise((ok) => setTimeout(ok, 500)); assert.equal(got.length, 1, "không báo lặp");
    assert.ok(!srv.errText().includes("TESTTOKEN"));
  } finally { srv.stop(); tg.close(); }
});
