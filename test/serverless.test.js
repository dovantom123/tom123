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
});
