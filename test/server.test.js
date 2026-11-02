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

// Telegram giả: ghi lại sendMessage, phát lại các update đã xếp hàng cho getUpdates (offset -1 = lấy update cuối).
function fakeTelegram() {
  const sent = [], updates = []; let nextId = 1000;
  const srv = http.createServer((rq, rs) => { let b = ""; rq.on("data", (c) => (b += c)); rq.on("end", () => {
    const body = JSON.parse(b || "{}"), method = rq.url.split("/").pop(); let result = {};
    if (method === "sendMessage") { const m = { message_id: nextId++, ...body }; sent.push(m); result = { message_id: m.message_id }; }
    else if (method === "getUpdates") result = body.offset === -1 ? updates.slice(-1) : updates.filter((u) => u.update_id >= (body.offset || 0));
    rs.writeHead(200, { "Content-Type": "application/json" }); rs.end(JSON.stringify({ ok: true, result })); }); });
  const say = (text, extra = {}, chat = 42) => updates.push({ update_id: updates.length + 1, message: { message_id: 500 + updates.length, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat }, text, ...extra } });
  return { srv, sent, say, listen: () => new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${srv.address().port}`))), texts: () => sent.map((m) => m.text) };
}
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((ok) => setTimeout(ok, 50)); } return fn(); };
const TG = (base) => ({ alerts: { telegram: { botToken: "111:TESTTOKEN", chatId: "42" }, dashboardUrl: "http://localhost:7788", reportGapSec: 0 } });
const TGENV = (base) => ({ VPAO_TELEGRAM_API: base, VPAO_ALERT_TICK_MS: "100", VPAO_TG_POLL_MS: "50" });

test("cảnh báo Telegram: Cần anh từ hook được gửi tới Telegram (giả), không gửi việc có sẵn lúc khởi động", async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const srv = start(TG(base), TGENV(base)); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 600)); // lượt đầu ghi nhận hiện trạng
    assert.equal(tg.sent.length, 0);
    await hook(s, { e: "PermissionRequest", x: { tool_name: "Bash" } });
    await until(() => tg.sent.length);
    assert.equal(tg.sent.length, 1, "đúng một tin"); assert.equal(tg.sent[0].chat_id, "42");
    assert.match(tg.sent[0].text, /Chờ bạn duyệt quyền: Bash/); assert.match(tg.sent[0].text, /http:\/\/localhost:7788$/);
    await new Promise((ok) => setTimeout(ok, 500)); assert.equal(tg.sent.length, 1, "không báo lặp");
    assert.ok(!srv.errText().includes("TESTTOKEN"));
  } finally { srv.stop(); tg.srv.close(); }
});
test("Telegram hai chiều: /ds, giao việc qua hook (Stop → block), báo xong lượt, trả lời vào tin cảnh báo", async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const srv = start(TG(base), TGENV(base)); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 600));
    tg.say("/ds"); await until(() => tg.sent.length >= 1);
    assert.match(tg.texts()[0], /1\. c-?.*Claude|1\. .*\(Claude/, "danh sách có phiên Claude");
    // chưa có hook → hòm thư, nói rõ giới hạn
    tg.say("/viec 1 việc qua hòm thư"); await until(() => tg.sent.length >= 2);
    assert.match(tg.texts()[1], /hòm thư/); assert.match(tg.texts()[1], /chưa có hook/);
    // có hook → xếp hàng, giao khi Stop, đúng một lần
    await hook(s, { e: "UserPromptSubmit" });
    tg.say("/viec 1 sửa lỗi đăng nhập"); await until(() => tg.sent.length >= 3);
    assert.match(tg.texts()[2], /Đã xếp hàng/);
    const r1 = await hook(s, { e: "Stop" });
    assert.equal(r1.status, 200); const d = JSON.parse(r1.body).deliver;
    assert.equal(d.kind, "stop-block"); assert.match(d.text, /^\[Việc từ Mr\. Dang qua Telegram\] sửa lỗi đăng nhập$|^\[Việc từ .* qua Telegram\] sửa lỗi đăng nhập$/);
    assert.equal((await hook(s, { e: "Stop" })).status, 204, "giao một lần thôi");
    await until(() => tg.texts().some((x) => /Đã giao việc cho/.test(x)));
    // /dung → PreToolUse bị chặn
    tg.say("/dung 1"); await until(() => tg.texts().some((x) => /Sẽ chặn lệnh tiếp theo/.test(x)));
    const r2 = await hook(s, { e: "PreToolUse", x: { tool_name: "Bash" } });
    assert.equal(r2.status, 200); assert.equal(JSON.parse(r2.body).deliver.kind, "pretool-deny");
    // báo xong lượt sau khi Stop
    await until(() => tg.texts().some((x) => /xong lượt/.test(x)));
    assert.ok(tg.texts().some((x) => /xong lượt/.test(x)), "có báo xong lượt");
    // trả lời vào một tin cảnh báo → giao đúng phiên
    await hook(s, { e: "PermissionRequest", x: { tool_name: "Bash" } });
    const alertMsg = await until(() => tg.sent.find((m) => /Chờ bạn duyệt quyền/.test(m.text)));
    assert.ok(alertMsg, "có tin cảnh báo");
    await hook(s, { e: "PostToolUse", x: { tool_name: "Bash" } });
    tg.say("làm tiếp phần B", { reply_to_message: { message_id: alertMsg.message_id } });
    await until(() => tg.texts().some((x) => /Đã xếp hàng/.test(x) && tg.texts().indexOf(x) > 4));
    const r3 = await hook(s, { e: "Stop" }); assert.equal(r3.status, 200); assert.match(JSON.parse(r3.body).deliver.text, /làm tiếp phần B$/);
  } finally { srv.stop(); tg.srv.close(); }
});
test("Telegram: người lạ, tin chuyển tiếp và tin cũ không bao giờ được thi hành", async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const srv = start(TG(base), TGENV(base)); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 600));
    await hook(s, { e: "UserPromptSubmit" });
    tg.say("/viec 1 lệnh của người lạ", {}, 999);
    tg.say("/viec 1 tin chuyển tiếp", { forward_date: 1 });
    tg.say("/viec 1 tin cũ", { date: Math.floor(Date.now() / 1000) - 3600 });
    await new Promise((ok) => setTimeout(ok, 800));
    assert.ok(!tg.sent.some((m) => String(m.chat_id) === "999"), "không trả lời người lạ");
    assert.ok(tg.texts().some((x) => /chuyển tiếp/.test(x)));
    assert.equal((await hook(s, { e: "Stop" })).status, 204, "không có việc nào được xếp hàng");
  } finally { srv.stop(); tg.srv.close(); }
});
test("Telegram: tin tồn đọng lúc văn phòng tắt không được thi hành khi khởi động", async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  tg.say("/viec 1 gửi lúc văn phòng đang tắt");
  const srv = start(TG(base), TGENV(base)); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 800));
    await hook(s, { e: "UserPromptSubmit" });
    assert.equal(tg.sent.length, 0, "không trả lời tin cũ"); assert.equal((await hook(s, { e: "Stop" })).status, 204);
  } finally { srv.stop(); tg.srv.close(); }
});
test("hooks/emit.js: in quyết định block ra stdout khi máy chủ có việc giao từ xa, nếu không thì im lặng", async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const srv = start(TG(base), TGENV(base)); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 500));
    const cfg = path.join(srv.dir, "config.json");
    const run = (obj) => new Promise((ok) => { const p = spawn(process.execPath, [path.join(ROOT, "hooks", "emit.js")], { env: { ...process.env, VPAO_CONFIG: cfg }, stdio: ["pipe", "pipe", "pipe"] }); let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("exit", (c) => ok({ code: c, out })); p.stdin.end(JSON.stringify({ session_id: SID, ...obj })); });
    await run({ hook_event_name: "UserPromptSubmit" });
    tg.say("/viec 1 làm việc X"); await until(() => tg.sent.length >= 1);
    const quiet = await run({ hook_event_name: "PostToolUse", tool_name: "Bash" }); assert.equal(quiet.out, "");
    const r = await run({ hook_event_name: "Stop" });
    assert.equal(r.code, 0); assert.deepEqual(Object.keys(JSON.parse(r.out)), ["decision", "reason"]); assert.equal(JSON.parse(r.out).decision, "block"); assert.match(JSON.parse(r.out).reason, /làm việc X$/);
    assert.equal((await run({ hook_event_name: "Stop" })).out, "");
  } finally { srv.stop(); tg.srv.close(); }
});

test("tmuxDelivery: phiên rảnh thì gõ việc vào tmux; đang làm hoặc chờ duyệt thì KHÔNG gõ", { skip: process.platform === "win32" }, async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-fakebin-")), log = path.join(bin, "tmux.log");
  fs.writeFileSync(path.join(bin, "tmux"), `#!/bin/sh\necho "$@" >> "$TMUX_LOG"\ncase "$*" in *display-message*) while [ $# -gt 0 ]; do if [ "$1" = "-t" ]; then echo "$2"; break; fi; shift; done;; esac\n`, { mode: 0o755 });
  const srv = start({ alerts: { ...TG(base).alerts, tmuxDelivery: true } }, { ...TGENV(base), PATH: bin + path.delimiter + process.env.PATH, TMUX_LOG: log }); const s = await srv.ready;
  const lines = () => { try { return fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean); } catch { return []; } };
  const pane = { tmux_pane: "%3", tmux_socket: "/tmp/tmux-1000/default" };
  try {
    await new Promise((ok) => setTimeout(ok, 600));
    await hook(s, { e: "UserPromptSubmit", x: pane });
    tg.say("/viec 1 việc khi đang làm"); await until(() => tg.sent.length >= 1);
    assert.match(tg.texts()[0], /Đã xếp hàng/); assert.equal(lines().length, 0, "đang làm thì không gõ");
    await hook(s, { e: "Stop", x: pane }); // giao việc xếp hàng qua hook, lấy hết hàng
    await hook(s, { e: "PermissionRequest", x: { tool_name: "Bash", ...pane } });
    tg.say("/viec 1 việc khi chờ duyệt"); await until(() => tg.sent.length >= 3);
    assert.equal(lines().length, 0, "đang chờ duyệt quyền thì không gõ (chữ sẽ thành câu trả lời cho hộp thoại)");
    await hook(s, { e: "PostToolUse", x: { tool_name: "Bash", ...pane } }); await hook(s, { e: "Stop", x: pane }); // rảnh, đã xong lượt
    tg.say("/viec 1 làm việc B"); await until(() => tg.texts().some((x) => /Đã gõ việc vào phiên/.test(x)));
    const L = lines(); assert.equal(L.length, 4, L.join("\n"));
    assert.match(L[0], /^-S \/tmp\/tmux-1000\/default display-message -p -t %3/); assert.match(L[1], /send-keys -t %3 C-u$/);
    assert.match(L[2], /send-keys -t %3 -l -- \[Việc từ Mr\. Dang qua Telegram\] làm việc B$|send-keys -t %3 -l -- \[Việc từ .* qua Telegram\] làm việc B$/); assert.match(L[3], /send-keys -t %3 Enter$/);
  } finally { srv.stop(); tg.srv.close(); fs.rmSync(bin, { recursive: true, force: true }); }
});
test("tmuxDelivery tắt (mặc định): phiên rảnh không bao giờ bị gõ vào", { skip: process.platform === "win32" }, async () => {
  const tg = fakeTelegram(), base = await tg.listen();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-fakebin-")), log = path.join(bin, "tmux.log");
  fs.writeFileSync(path.join(bin, "tmux"), `#!/bin/sh\necho "$@" >> "$TMUX_LOG"\n`, { mode: 0o755 });
  const srv = start(TG(base), { ...TGENV(base), PATH: bin + path.delimiter + process.env.PATH, TMUX_LOG: log }); const s = await srv.ready;
  try {
    await new Promise((ok) => setTimeout(ok, 600));
    await hook(s, { e: "UserPromptSubmit", x: { tmux_pane: "%3" } }); await hook(s, { e: "Stop", x: { tmux_pane: "%3" } });
    tg.say("/viec 1 việc"); await until(() => tg.sent.length >= 1);
    assert.match(tg.texts()[0], /đang rảnh\. Việc sẽ được giao/); assert.ok(!fs.existsSync(log), "không gọi tmux");
  } finally { srv.stop(); tg.srv.close(); fs.rmSync(bin, { recursive: true, force: true }); }
});

test("qua Cloudflare Tunnel (tên miền riêng, https): đăng nhập được, cookie Secure, nhưng /hook và PIN nhắn tin vẫn bị chặn", async () => {
  const srv = start({ accessKey: "khoa-tunnel-123" }); const s = await srv.ready;
  const cf = { Host: "office.example.com", "Cf-Ray": "abc123-SIN", "Cf-Connecting-Ip": "203.0.113.7", "X-Forwarded-Proto": "https" };
  try {
    assert.equal((await req(s.port, "GET", "/state", { headers: cf })).status, 401, "chưa đăng nhập");
    const ok = await req(s.port, "POST", "/login", { headers: cf, body: "key=khoa-tunnel-123" });
    assert.equal(ok.status, 303); const cookie = String(ok.headers["set-cookie"]); assert.match(cookie, /; Secure/); assert.match(cookie, /HttpOnly/);
    const authed = { ...cf, Cookie: cookie.split(";")[0] };
    assert.equal((await req(s.port, "GET", "/state", { headers: authed })).status, 200);
    // đã đăng nhập vẫn không được gọi /hook (chỉ máy này + token) và không được nhắn tin cho agent nếu thiếu PIN
    assert.equal((await req(s.port, "POST", "/hook", { headers: { ...authed, "X-VP-Token": s.token, "Content-Type": "application/json" }, body: JSON.stringify({ session_id: SID, hook_event_name: "Stop" }) })).status, 401);
    const st = JSON.parse((await req(s.port, "GET", "/chat/status", { headers: authed })).body);
    assert.equal(st.local, false); assert.equal(st.authorized, false); assert.ok(!("pin" in st), "PIN không bao giờ lộ qua tunnel");
    const send = await req(s.port, "POST", "/chat/send", { headers: { ...authed, "Content-Type": "application/json" }, body: JSON.stringify({ to: KEY8, text: "x" }) });
    assert.equal(send.status, 401);
  } finally { srv.stop(); }
});
