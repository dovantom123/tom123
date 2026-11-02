// Kết nối bot Telegram với Cloudflare Worker trong MỘT lệnh, có hướng dẫn từng bước:
//   1) tạo (hoặc dùng) chuỗi bí mật webhook, chép vào clipboard để bạn dán sang Cloudflare;
//   2) KIỂM TRA Worker đã nhận đúng chuỗi đó chưa (bắt lỗi "bí mật không khớp" trước khi báo Telegram);
//   3) hỏi token bot bằng ô ẨN, thử getMe để chắc token đúng;
//   4) đặt webhook và đọc lại để xác nhận.
// Token và chuỗi bí mật không bao giờ được in ra màn hình.
//   node serverless/scripts/ket-noi.cjs [https://ten.tai-khoan.workers.dev]
"use strict";
const readline = require("readline");
const { Writable } = require("stream");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { spawnSync } = require("child_process");
const { call, scrub } = require("./tg.cjs");

const say = (s = "") => process.stdout.write(s + "\n");
let muted = false;
const out = new Writable({ write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc); cb(); } });
const rl = readline.createInterface({ input: process.stdin, output: out, terminal: !!process.stdin.isTTY });
const ask = (q, hidden = false) => new Promise((ok) => { rl.question(q, (a) => { muted = false; if (hidden) say(""); ok(String(a || "").trim()); }); muted = hidden; });
const done = (code) => { rl.close(); process.exit(code); };

function copy(text) {
  const tries = process.platform === "win32" ? [["clip", []]] : process.platform === "darwin" ? [["pbcopy", []]] : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]]];
  for (const [cmd, args] of tries) { const r = spawnSync(cmd, args, { input: text }); if (r.status === 0) return true; }
  return false;
}
function req(method, url, headers = {}, body = "") {
  return new Promise((ok) => {
    const u = new URL(url), lib = u.protocol === "http:" ? http : https;
    const r = lib.request(u, { method, timeout: 20000, headers: { ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}), ...headers } }, (res) => { let b = ""; res.on("data", (c) => { if (b.length < 5000) b += c; }); res.on("end", () => ok({ status: res.statusCode, body: b })); });
    r.on("timeout", () => r.destroy(new Error("quá thời gian chờ"))); r.on("error", (e) => ok({ status: 0, error: e.message }));
    r.end(body);
  });
}

(async () => {
  say("\n=== Kết nối bot Telegram với Cloudflare Worker ===\n");
  let base = (process.argv[2] || process.env.WORKER_URL || "").trim() || await ask("Địa chỉ Worker (dạng https://vpao-telegram.tên-bạn.workers.dev): ");
  base = base.replace(/\/+$/, "").replace(/\/telegram$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) { say("Địa chỉ không hợp lệ: phải bắt đầu bằng https:// và không có đường dẫn phía sau."); return done(1); }

  say("Bước 1/4: kiểm tra Worker…");
  const hello = await req("GET", base + "/");
  if (hello.status !== 200 || hello.body.trim() !== "ok") { say(`  Worker không trả "ok" (HTTP ${hello.status || "không kết nối được"}${hello.error ? ", " + hello.error : ""}). Kiểm tra địa chỉ và đã Deploy mã chưa.`); return done(1); }
  say("  Worker đang chạy (trả \"ok\").\n");

  let secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (/^[A-Za-z0-9_-]{16,256}$/.test(secret)) say("Bước 2/4: dùng chuỗi bí mật có sẵn trong biến TELEGRAM_WEBHOOK_SECRET của cửa sổ này.\n");
  else {
    secret = crypto.randomBytes(24).toString("base64url");
    say("Bước 2/4: chuỗi bí mật webhook mới.");
    if (copy(secret)) say("  Đã CHÉP chuỗi vào clipboard (không hiện trên màn hình).");
    else { say("  Không chép được vào clipboard. Chuỗi (đừng chụp ảnh màn hình lúc này):\n  " + secret); }
    say("  Trên Cloudflare: Worker vpao-telegram → Settings → Variables and Secrets → bút chì ở TELEGRAM_WEBHOOK_SECRET → Ctrl+V → lưu → Deploy.");
    await ask("  Xong thì nhấn Enter ở đây… ");
  }
  for (;;) {
    const probe = await req("POST", base + "/telegram", { "X-Telegram-Bot-Api-Secret-Token": secret }, JSON.stringify({ update_id: 0 }));
    if (probe.status === 200) { say("  Worker đã nhận ĐÚNG chuỗi bí mật.\n"); break; }
    if (probe.status === 401) { say("  Worker từ chối: chuỗi bí mật ở Worker KHÁC chuỗi này. Kiểm tra đã dán đúng, đã bấm Deploy chưa."); const a = await ask("  Nhấn Enter để thử lại, hoặc gõ q rồi Enter để thoát: "); if (a.toLowerCase() === "q") return done(1); continue; }
    say(`  Worker trả HTTP ${probe.status || "lỗi kết nối"}. Dừng lại.`); return done(1);
  }

  say("Bước 3/4: token bot.");
  const token = await ask("  Dán TOKEN_BOT (không hiện chữ, chuột phải để dán) rồi Enter: ", true);
  say(`  Đã nhận ${token.length} ký tự.`);
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) { say("  Token trông không đúng dạng (phải như 123456789:AAH…). Dán lại token từ @BotFather."); return done(1); }
  let me; try { me = await call(token, "getMe", {}); } catch (e) { say("  Telegram không nhận token này: " + scrub(e.message, token)); return done(1); }
  say(`  Token đúng: bot @${me.username}.\n`);

  say("Bước 4/4: đặt webhook…");
  try { await call(token, "setWebhook", { url: `${base}/telegram`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true, max_connections: 5 }); }
  catch (e) { say("  Đặt webhook lỗi: " + scrub(e.message, token)); return done(1); }
  const info = await call(token, "getWebhookInfo", {});
  say(`  Địa chỉ: ${info.url}\n  Tin đang chờ: ${info.pending_update_count}${info.last_error_message ? `\n  Lỗi gần nhất: ${scrub(info.last_error_message, token)}` : ""}`);
  say(`\nXONG. Mở chat với @${me.username} trong Telegram, bấm Start rồi gõ /start.\nNhớ: TOKEN_BOT này phải cũng nằm ở (1) Worker, biến TELEGRAM_BOT_TOKEN, và (2) GitHub, secret TELEGRAM_BOT_TOKEN.`);
  done(0);
})().catch((e) => { say("Lỗi: " + e.message); done(1); });
