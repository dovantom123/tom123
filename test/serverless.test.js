"use strict";
// Bộ "Telegram → Cloudflare Worker → GitHub Actions": Worker (logic thuần, fetch và KV giả), script phụ, bộ chép.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const W = () => import("../serverless/worker/src/index.mjs");
const ENV = (extra = {}) => ({ TELEGRAM_BOT_TOKEN: "111:SECRETTOKEN", TELEGRAM_WEBHOOK_SECRET: "hook-secret-1234567890", GITHUB_TOKEN: "ghp_FAKE", GITHUB_REPO: "chu/repo", OWNER_CHAT_ID: "42", ...extra });
const NOW = 1_800_000_000_000;
const upd = (text, extra = {}, id = 1) => ({ update_id: id, message: { message_id: 10 + id, date: Math.floor(NOW / 1000), chat: { id: 42, type: "private" }, from: { id: 42 }, text, ...extra } });
function kv() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
function fakeFetch(ghStatus = 204, runs = []) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (url.includes("api.github.com") && url.endsWith("/dispatches")) return { status: ghStatus, ok: ghStatus < 300 };
    if (url.includes("api.github.com") && url.includes("/actions/runs")) return { status: 200, ok: true, json: async () => ({ workflow_runs: runs }) };
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  f.calls = calls; f.said = () => calls.filter((c) => c.url.includes("sendMessage")).map((c) => c.body.text); f.dispatches = () => calls.filter((c) => c.url.endsWith("/dispatches"));
  return f;
}

test("worker: /viec kích hoạt telegram-viec với đúng dữ liệu và trả lời ngay", async () => {
  const { handleUpdate } = await W(), f = fakeFetch();
  const r = await handleUpdate(upd("/viec sửa lỗi đăng nhập"), ENV(), { fetch: f, now: () => NOW });
  assert.equal(r.action, "dispatched"); const d = f.dispatches()[0];
  assert.equal(d.url, "https://api.github.com/repos/chu/repo/dispatches"); assert.equal(d.init.headers.Authorization, "Bearer ghp_FAKE");
  assert.equal(d.body.event_type, "telegram-viec"); assert.equal(d.body.client_payload.task, "sửa lỗi đăng nhập"); assert.equal(d.body.client_payload.chat_id, "42");
  assert.match(f.said()[0], /Đã nhận việc/);
  const h = await handleUpdate(upd("/hoi@vp_bot hàm nào xử lý đăng nhập?", {}, 2), ENV(), { fetch: f, now: () => NOW });
  assert.equal(h.event_type, "telegram-hoi"); assert.equal(f.dispatches()[1].body.client_payload.task, "hàm nào xử lý đăng nhập?");
});
test("worker: người lạ, nhóm không rõ người gửi, tin chuyển tiếp, tin cũ đều không kích hoạt gì", async () => {
  const { handleUpdate } = await W(), f = fakeFetch(), env = ENV();
  const stranger = upd("/viec xóa hết"); stranger.message.chat.id = 999; stranger.message.from.id = 999;
  assert.equal((await handleUpdate(stranger, env, { fetch: f, now: () => NOW })).why, "không phải chủ");
  const imposter = upd("/viec x"); imposter.message.from.id = 7; // cùng chat riêng nhưng người gửi khác
  assert.equal((await handleUpdate(imposter, env, { fetch: f, now: () => NOW })).action, "ignored");
  const grp = upd("/viec x"); grp.message.chat = { id: 42, type: "group" };
  assert.equal((await handleUpdate(grp, env, { fetch: f, now: () => NOW })).action, "ignored", "nhóm mà chưa có OWNER_USER_ID");
  assert.equal((await handleUpdate(grp, ENV({ OWNER_USER_ID: "42" }), { fetch: f, now: () => NOW })).action, "dispatched", "nhóm có OWNER_USER_ID đúng");
  assert.equal((await handleUpdate(upd("/viec x", { forward_date: 1 }, 5), env, { fetch: f, now: () => NOW })).action, "forwarded");
  assert.equal((await handleUpdate(upd("/viec x", { date: Math.floor(NOW / 1000) - 3600 }, 6), env, { fetch: f, now: () => NOW })).why, "tin cũ");
  assert.equal(f.dispatches().length, 1, "chỉ trường hợp nhóm hợp lệ được kích hoạt");
  assert.ok(!f.said().some((t) => /xóa hết/.test(t)), "không trả lời người lạ");
});
test("worker: trùng update_id chỉ xử lý một lần; hạn mức ngày chặn việc thứ N+1", async () => {
  const { handleUpdate } = await W(), f = fakeFetch(), env = ENV({ STATE: kv(), DAILY_CAP: "2" }), deps = { fetch: f, now: () => NOW };
  assert.equal((await handleUpdate(upd("/viec a", {}, 1), env, deps)).action, "dispatched");
  assert.equal((await handleUpdate(upd("/viec a", {}, 1), env, deps)).why, "trùng");
  assert.equal((await handleUpdate(upd("/viec b", {}, 2), env, deps)).action, "dispatched");
  const capped = await handleUpdate(upd("/viec c", {}, 3), env, deps); assert.equal(capped.action, "capped"); assert.match(f.said().at(-1), /đủ 2 việc/);
  assert.equal(f.dispatches().length, 2);
});
test("worker: lệnh thiếu nội dung, quá dài, lạ; GitHub từ chối; /trangthai; không lộ token", async () => {
  const { handleUpdate } = await W(), env = ENV(), f = fakeFetch(), deps = { fetch: f, now: () => NOW };
  assert.equal((await handleUpdate(upd("/viec"), env, deps)).action, "usage");
  assert.equal((await handleUpdate(upd("/viec " + "a".repeat(2100), {}, 2), env, deps)).action, "toolong");
  assert.equal((await handleUpdate(upd("làm gì đó", {}, 3), env, deps)).action, "help");
  assert.equal((await handleUpdate(upd("/lenhla", {}, 4), env, deps)).action, "help");
  assert.equal(f.dispatches().length, 0);
  const bad = fakeFetch(404); const r = await handleUpdate(upd("/viec x", {}, 5), env, { fetch: bad, now: () => NOW });
  assert.equal(r.action, "dispatch_failed"); assert.match(bad.said()[0], /404/); assert.match(bad.said()[0], /GITHUB_REPO/);
  const ok = fakeFetch(204, [{ name: "Telegram - giao việc", status: "completed", conclusion: "success", created_at: "2026-11-02T10:05:00Z", html_url: "https://github.com/chu/repo/actions/runs/1" }, { name: "Telegram - hỏi", status: "in_progress", created_at: "2026-11-02T10:10:00Z", html_url: "https://github.com/chu/repo/actions/runs/2" }]);
  const s = await handleUpdate(upd("/trangthai", {}, 6), env, { fetch: ok, now: () => NOW }); assert.match(s.text, /giao việc: thành công/); assert.match(s.text, /hỏi: đang chạy/);
  const boom = async () => { throw new Error("mạng hỏng 111:SECRETTOKEN"); };
  const e = await handleUpdate(upd("/viec x", {}, 7), env, { fetch: boom, now: () => NOW }); assert.equal(e.action, "error");
});
test("worker: fetch handler kiểm mã bí mật webhook, trả 200 ngay, không nhận GET lạ", async () => {
  const { default: worker, safeEqual } = await W(), f = fakeFetch(), env = ENV(), orig = globalThis.fetch;
  globalThis.fetch = f; const waits = [];
  try {
    const mk = (secret, body = JSON.stringify(upd("/viec x"))) => new Request("https://w.example/telegram", { method: "POST", headers: secret == null ? {} : { "X-Telegram-Bot-Api-Secret-Token": secret }, body });
    assert.equal((await worker.fetch(mk(null), env, { waitUntil: (p) => waits.push(p) })).status, 401);
    assert.equal((await worker.fetch(mk("sai-sai-sai"), env, { waitUntil: () => {} })).status, 401);
    assert.equal((await worker.fetch(mk(env.TELEGRAM_WEBHOOK_SECRET, "không phải json"), env, { waitUntil: () => {} })).status, 400);
    assert.equal(f.calls.length, 0, "sai bí mật hoặc JSON hỏng thì không gọi ai");
    assert.equal((await worker.fetch(mk(env.TELEGRAM_WEBHOOK_SECRET), env, { waitUntil: (p) => waits.push(p) })).status, 200);
    assert.equal((await worker.fetch(new Request("https://w.example/"), env, {})).status, 200);
    assert.equal((await worker.fetch(new Request("https://w.example/telegram"), env, {})).status, 404);
    assert.equal((await worker.fetch(mk(env.TELEGRAM_WEBHOOK_SECRET), { ...env, TELEGRAM_WEBHOOK_SECRET: "" }, {})).status, 401, "chưa đặt bí mật thì từ chối mọi tin");
    await Promise.all(waits);
  } finally { globalThis.fetch = orig; }
  assert.ok(safeEqual("abc", "abc")); assert.ok(!safeEqual("abc", "abd")); assert.ok(!safeEqual("abc", "abcd")); assert.ok(!safeEqual(null, "x")); assert.ok(safeEqual("", ""));
});
test("summarize: lấy tóm tắt cuối cùng từ nhiều dạng tệp kết quả, không ném lỗi", () => {
  const { summarize } = require("../serverless/scripts/summarize.cjs");
  const arr = [{ type: "system" }, { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "đang làm" }] } }, { type: "result", result: "Đã sửa lỗi ở lib/a.js; kiểm thử qua." }];
  assert.equal(summarize(JSON.stringify(arr)), "Đã sửa lỗi ở lib/a.js; kiểm thử qua.");
  assert.equal(summarize(arr.slice(0, 2).map((x) => JSON.stringify(x)).join("\n")), "đang làm", "dạng mỗi dòng một JSON, không có result thì lấy tin trợ lý cuối");
  assert.equal(summarize(JSON.stringify({ result: "x".repeat(3000) }), 100).length, 100);
  assert.equal(summarize("hỏng hoàn toàn"), ""); assert.equal(summarize("[]"), "");
});
test("set-webhook: từ chối đầu vào xấu trước khi gọi mạng", () => {
  const run = (env) => spawnSync(process.execPath, [path.join(ROOT, "serverless/scripts/set-webhook.cjs"), "dat"], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
  assert.equal(run({}).status, 1);
  const a = run({ TELEGRAM_BOT_TOKEN: "1:x", WORKER_URL: "http://khong-https.example", TELEGRAM_WEBHOOK_SECRET: "a".repeat(20) }); assert.equal(a.status, 1); assert.match(a.stderr, /WORKER_URL/);
  const b = run({ TELEGRAM_BOT_TOKEN: "1:x", WORKER_URL: "https://w.workers.dev", TELEGRAM_WEBHOOK_SECRET: "ngắn" }); assert.equal(b.status, 1); assert.match(b.stderr, /TELEGRAM_WEBHOOK_SECRET/);
  assert.ok(!(a.stderr + b.stderr).includes("1:x"));
});
test("copy-to: chép bộ vào repo đích, không ghi đè tệp khác nội dung, từ chối thư mục không phải repo git", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-copy-")), run = (t) => spawnSync(process.execPath, [path.join(ROOT, "serverless/copy-to.cjs"), t], { encoding: "utf8" });
  try {
    assert.equal(run(dir).status, 1, "chưa phải repo git");
    fs.mkdirSync(path.join(dir, ".git"));
    const r = run(dir); assert.equal(r.status, 0);
    for (const f of [".github/workflows/telegram-viec.yml", ".github/workflows/telegram-hoi.yml", "serverless/scripts/notify.cjs", "serverless/scripts/lib-mask.js"]) assert.ok(fs.existsSync(path.join(dir, f)), f);
    fs.writeFileSync(path.join(dir, "serverless/scripts/tg.cjs"), "// bản đã sửa");
    assert.match(run(dir).stdout, /Bỏ qua \(đã có, khác nội dung\): serverless\/scripts\/tg\.cjs/); assert.equal(fs.readFileSync(path.join(dir, "serverless/scripts/tg.cjs"), "utf8"), "// bản đã sửa");
    const m = require(path.join(dir, "serverless/scripts/lib-mask.js")); assert.equal(m.mask("token=abc123"), "token=‹ẩn›");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("workflow: có chặn chủ, quyền tối thiểu, và hoi chỉ đọc", () => {
  const viec = fs.readFileSync(path.join(ROOT, ".github/workflows/telegram-viec.yml"), "utf8"), hoi = fs.readFileSync(path.join(ROOT, ".github/workflows/telegram-hoi.yml"), "utf8");
  for (const y of [viec, hoi]) { assert.match(y, /vars\.OWNER_CHAT_ID != ''/); assert.match(y, /repository_dispatch/); assert.match(y, /persist-credentials: false/); assert.match(y, /timeout-minutes/); }
  assert.match(hoi, /contents: read/); assert.doesNotMatch(hoi, /contents: write|pull-requests: write/); assert.match(hoi, /--allowedTools "Read,Glob,Grep"/);
  assert.match(viec, /git reset -q -- \.github\/workflows/); assert.doesNotMatch(viec, /git push[^\n]*\bmain\b/);
  assert.doesNotMatch(viec, /Bash\(git/, "Claude không được tự chạy git");
  for (const y of [viec, hoi]) assert.match(y, /ANTHROPIC_BASE_URL: \$\{\{ vars\.ANTHROPIC_BASE_URL \|\| 'https:\/\/api\.anthropic\.com' \}\}/, "mặc định địa chỉ chính thức");
  for (const y of [viec, hoi]) { assert.match(y, /ANTHROPIC_DEFAULT_HAIKU_MODEL: \$\{\{ vars\.CLAUDE_SMALL_MODEL \|\| 'claude-haiku-4-5-20251001' \}\}/); assert.match(y, /vars\.CLAUDE_MODEL && format\('--model \{0\}', vars\.CLAUDE_MODEL\) \|\| ''/); }
});

test("check-api: nhận ra kiểu xác thực x-api-key / Bearer, báo lỗi dễ hiểu, không bao giờ in khóa", async () => {
  const http = require("node:http"), KEY = "KHOA-BI-MAT-12345";
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const j = JSON.parse(b || "{}"), mode = srv.mode, okX = req.headers["x-api-key"] === KEY, okB = req.headers.authorization === `Bearer ${KEY}`;
      const send = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url === "/v1/models") return (mode === "x" && okX) || (mode === "bearer" && okB) ? send(200, { data: [{ id: "model-dung" }, { id: "model-khac" }] }) : send(401, { error: { message: "sai khóa" } });
      if (req.url !== "/v1/messages") return send(404, { error: { message: "không có đường dẫn" } });
      if (j.model !== "model-dung") return send(400, { error: { message: `model ${j.model} không tồn tại ${KEY}` } });
      if ((mode === "x" && okX) || (mode === "bearer" && okB)) return send(200, { model: j.model, content: [{ type: "text", text: "ok" }], usage: { input_tokens: 9, output_tokens: 1 } });
      send(401, { error: { message: "sai khóa" } });
    });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const run = (env) => new Promise((ok) => { const p = require("node:child_process").spawn(process.execPath, [path.join(ROOT, "serverless/scripts/check-api.cjs")], { env: { PATH: process.env.PATH, ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: KEY, ...env } }); let o = "", e = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (e += d)); p.on("exit", (c) => ok({ code: c, out: o, err: e })); });
  try {
    // chế độ --models
    const runM = () => new Promise((ok) => { const p = require("node:child_process").spawn(process.execPath, [path.join(ROOT, "serverless/scripts/check-api.cjs"), "--models"], { env: { PATH: process.env.PATH, ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: KEY } }); let o = "", e = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (e += d)); p.on("exit", (c) => ok({ code: c, out: o, err: e })); });
    srv.mode = "x"; let r = await runM(); assert.equal(r.code, 0); assert.match(r.out, /Có 2 mô hình \(xác thực: x-api-key\)/); assert.match(r.out, /model-dung/); assert.match(r.out, /model-khac/); assert.ok(!(r.out + r.err).includes(KEY));
    srv.mode = "bearer"; r = await runM(); assert.equal(r.code, 0); assert.match(r.out, /Bearer/);
    srv.mode = "none"; r = await runM(); assert.equal(r.code, 1); assert.match(r.err, /từ chối/);
    srv.mode = "x"; r = await run({ MODEL: "model-dung" }); assert.equal(r.code, 0); assert.match(r.out, /THÀNH CÔNG với kiểu xác thực: x-api-key/); assert.match(r.out, /ANTHROPIC_API_KEY/);
    srv.mode = "bearer"; r = await run({ MODEL: "model-dung" }); assert.equal(r.code, 0); assert.match(r.out, /kiểu xác thực: Authorization: Bearer/); assert.match(r.out, /ANTHROPIC_AUTH_TOKEN/);
    srv.mode = "x"; r = await run({ MODEL: "model-dung", ANTHROPIC_API_KEY: "khoa-sai" }); assert.equal(r.code, 1); assert.match(r.err, /HTTP 401/); assert.match(r.err, /khóa sai/);
    r = await run({ MODEL: "model-la" }); assert.equal(r.code, 1); assert.match(r.err, /HTTP 400/); assert.match(r.err, /tên mô hình/); assert.ok(!(r.out + r.err).includes(KEY), "khóa bị che dù máy chủ phản hồi lại khóa");
    r = await run({ MODEL: "model-dung", ANTHROPIC_BASE_URL: base + "/sai-duong-dan/v9" }); assert.equal(r.code, 1); assert.match(r.err, /HTTP 404/);
    assert.equal((await run({ MODEL: "" })).code, 1); assert.equal((await run({ MODEL: "m", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" })).code, 1);
    r = await run({ MODEL: "m", ANTHROPIC_BASE_URL: "http://dai-ly.example" }); assert.equal(r.code, 1); assert.match(r.err, /https/);
  } finally { srv.close(); }
});

test("ket-noi: kiểm tra Worker, thử token, đặt webhook; bắt lỗi bí mật không khớp; không in token hay bí mật", async () => {
  const http = require("node:http"), { spawn } = require("node:child_process"), { default: worker } = await W();
  const TOKEN = "123456789:" + "A".repeat(35), SECRET = "bi-mat-webhook-thu-nghiem-0123456789";
  const wenv = { TELEGRAM_WEBHOOK_SECRET: SECRET, OWNER_CHAT_ID: "42", TELEGRAM_BOT_TOKEN: TOKEN };
  const wsrv = http.createServer((rq, rs) => { let b = ""; rq.on("data", (c) => (b += c)); rq.on("end", async () => {
    const h = rq.headers["x-telegram-bot-api-secret-token"], r = await worker.fetch(new Request("http://w.test" + rq.url, { method: rq.method, headers: h ? { "X-Telegram-Bot-Api-Secret-Token": h } : {}, body: rq.method === "POST" ? b : undefined }), wenv, { waitUntil: () => {} });
    rs.writeHead(r.status); rs.end(await r.text()); }); });
  const calls = [];
  const tsrv = http.createServer((rq, rs) => { let b = ""; rq.on("data", (c) => (b += c)); rq.on("end", () => {
    const m = rq.url.split("/"), tok = m[1].replace(/^bot/, ""), method = m[2], body = JSON.parse(b || "{}"); calls.push({ method, body });
    const send = (code, o) => { rs.writeHead(code, { "Content-Type": "application/json" }); rs.end(JSON.stringify(o)); };
    if (tok !== TOKEN) return send(401, { ok: false, description: "Unauthorized" });
    if (method === "getMe") return send(200, { ok: true, result: { username: "testbot" } });
    if (method === "setWebhook") return send(200, { ok: true, result: true });
    if (method === "getWebhookInfo") return send(200, { ok: true, result: { url: calls.find((c) => c.method === "setWebhook").body.url, pending_update_count: 0 } });
    send(404, { ok: false, description: "no" }); }); });
  await Promise.all([new Promise((ok) => wsrv.listen(0, "127.0.0.1", ok)), new Promise((ok) => tsrv.listen(0, "127.0.0.1", ok))]);
  const wurl = `http://127.0.0.1:${wsrv.address().port}`, tapi = `http://127.0.0.1:${tsrv.address().port}`;
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-nobin-"));
  const run = (args, env, feed) => new Promise((ok) => {
    const p = spawn(process.execPath, [path.join(ROOT, "serverless/scripts/ket-noi.cjs"), ...args], { env: { PATH: emptyBin, VPAO_TELEGRAM_API: tapi, ...env } });
    let o = "", e = ""; const onOut = (d) => { o += d; feed && feed(p, o); }; p.stdout.on("data", onOut); p.stderr.on("data", (d) => (e += d)); p.on("exit", (c) => ok({ code: c, out: o, err: e }));
  });
  try {
    // 1) bí mật có sẵn trong biến, token đúng
    calls.length = 0;
    let r = await run([wurl], { TELEGRAM_WEBHOOK_SECRET: SECRET }, (p, o) => { if (/Dán TOKEN_BOT/.test(o) && !p.fed) { p.fed = 1; p.stdin.write(TOKEN + "\n"); } });
    assert.equal(r.code, 0, r.out + r.err); assert.match(r.out, /Worker đang chạy/); assert.match(r.out, /Worker đã nhận ĐÚNG/); assert.match(r.out, /bot @testbot/); assert.match(r.out, /XONG/);
    const sw = calls.find((c) => c.method === "setWebhook").body; assert.equal(sw.url, `${wurl}/telegram`); assert.equal(sw.secret_token, SECRET); assert.deepEqual(sw.allowed_updates, ["message"]);
    assert.ok(!(r.out + r.err).includes(TOKEN) && !(r.out + r.err).includes(SECRET), "không in token hay bí mật");
    // 2) bí mật không khớp → báo rõ, thoát bằng q, KHÔNG gọi setWebhook
    calls.length = 0;
    r = await run([wurl], { TELEGRAM_WEBHOOK_SECRET: "bi-mat-khac-hoan-toan-0123456789" }, (p, o) => { if (/gõ q/.test(o) && !p.fed) { p.fed = 1; p.stdin.write("q\n"); } });
    assert.equal(r.code, 1); assert.match(r.out, /KHÁC chuỗi này/); assert.ok(!calls.some((c) => c.method === "setWebhook"));
    // 3) tự tạo bí mật (không có clipboard → in ra), người dùng dán vào Worker rồi Enter, sau đó thành công
    calls.length = 0; wenv.TELEGRAM_WEBHOOK_SECRET = "chua-doi-chua-doi-chua-doi-chua";
    r = await run([wurl], {}, (p, o) => {
      const m = o.match(/đừng chụp ảnh màn hình lúc này\):\s+([A-Za-z0-9_-]{32})/);
      if (m && !p.s) { p.s = m[1]; wenv.TELEGRAM_WEBHOOK_SECRET = m[1]; p.stdin.write("\n"); }
      if (/Dán TOKEN_BOT/.test(o) && !p.fed) { p.fed = 1; p.stdin.write(TOKEN + "\n"); } });
    assert.equal(r.code, 0, r.out + r.err); assert.equal(calls.find((c) => c.method === "setWebhook").body.secret_token, wenv.TELEGRAM_WEBHOOK_SECRET);
    // 4) token sai dạng, token bị Telegram từ chối, Worker không chạy
    wenv.TELEGRAM_WEBHOOK_SECRET = SECRET;
    r = await run([wurl], { TELEGRAM_WEBHOOK_SECRET: SECRET }, (p, o) => { if (/Dán TOKEN_BOT/.test(o) && !p.fed) { p.fed = 1; p.stdin.write("khong-phai-token\n"); } }); assert.equal(r.code, 1); assert.match(r.out, /không đúng dạng/);
    const bad = "987654321:" + "B".repeat(35);
    r = await run([wurl], { TELEGRAM_WEBHOOK_SECRET: SECRET }, (p, o) => { if (/Dán TOKEN_BOT/.test(o) && !p.fed) { p.fed = 1; p.stdin.write(bad + "\n"); } }); assert.equal(r.code, 1); assert.match(r.out, /Telegram không nhận token/); assert.ok(!(r.out + r.err).includes(bad));
    r = await run(["http://127.0.0.1:9"], { TELEGRAM_WEBHOOK_SECRET: SECRET }); assert.equal(r.code, 1); assert.match(r.out, /Worker không trả "ok"/);
    r = await run(["ftp://sai"], {}); assert.equal(r.code, 1); assert.match(r.out, /không hợp lệ/);
  } finally { wsrv.close(); tsrv.close(); fs.rmSync(emptyBin, { recursive: true, force: true }); }
});

test("cai-tat-ca.ps1: có BOM UTF-8 (PowerShell 5 đọc đúng tiếng Việt), ngoặc cân bằng, hỏi xác nhận trước khi cài và không chứa bí mật", () => {
  const raw = fs.readFileSync(path.join(ROOT, "scripts/cai-tat-ca.ps1")), s = raw.toString("utf8").replace(/^﻿/, "");
  assert.deepEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  for (const [a, b] of [["{", "}"], ["(", ")"]]) assert.equal(s.split(a).length, s.split(b).length, `${a}${b} cân bằng`);
  assert.match(s, /Hoi "Cài Agent Reach"/); assert.match(s, /Hoi "Nối bot Telegram/); assert.match(s, /ket-noi\.cjs/);
  assert.doesNotMatch(s, /\b\d{6,}:[A-Za-z0-9_-]{20,}\b|sk-[A-Za-z0-9]{20,}/, "không có token/khóa");
});
