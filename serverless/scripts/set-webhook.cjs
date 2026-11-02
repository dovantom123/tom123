// Đăng ký (hoặc xem, hoặc gỡ) webhook của bot Telegram trỏ về Cloudflare Worker.
//   env: TELEGRAM_BOT_TOKEN, và với "dat": WORKER_URL (https://....workers.dev), TELEGRAM_WEBHOOK_SECRET
//   node serverless/scripts/set-webhook.cjs dat | xem | go
"use strict";
const { call } = require("./tg.cjs");

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN, cmd = process.argv[2] || "xem";
  if (!token) { console.error("Thiếu biến TELEGRAM_BOT_TOKEN."); process.exit(1); }
  if (cmd === "dat") {
    const base = String(process.env.WORKER_URL || "").replace(/\/+$/, ""), secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
    if (!/^https:\/\/[^\s/]+$/.test(base)) { console.error("WORKER_URL phải dạng https://ten.tai-khoan.workers.dev (không có đường dẫn phía sau)."); process.exit(1); }
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) { console.error("TELEGRAM_WEBHOOK_SECRET phải dài 16-256 ký tự, chỉ gồm chữ, số, _ và -."); process.exit(1); }
    await call(token, "setWebhook", { url: `${base}/telegram`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true, max_connections: 5 });
    console.log(`Đã đặt webhook: ${base}/telegram (bỏ các tin tồn đọng).`);
  } else if (cmd === "go") {
    await call(token, "deleteWebhook", { drop_pending_updates: true }); console.log("Đã gỡ webhook.");
  } else {
    const i = await call(token, "getWebhookInfo", {});
    console.log(`Địa chỉ: ${i.url || "(chưa đặt)"}\nTin đang chờ: ${i.pending_update_count}${i.last_error_message ? `\nLỗi gần nhất: ${i.last_error_message}` : ""}`);
  }
})().catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
