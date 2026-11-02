// Gửi một tin Telegram từ GitHub Actions. Nội dung đã qua mask() (che khóa) và cắt ngắn.
//   env: TELEGRAM_BOT_TOKEN, CHAT_ID, và MESSAGE (hoặc MESSAGE_FILE)
"use strict";
const fs = require("fs");
const { call } = require("./tg.cjs");
let mask; try { mask = require("../../lib/mask").mask; } catch { mask = require("./lib-mask.js").mask; }

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.CHAT_ID;
  let text = process.env.MESSAGE || ""; if (!text && process.env.MESSAGE_FILE) try { text = fs.readFileSync(process.env.MESSAGE_FILE, "utf8"); } catch {}
  if (!token || !chat || !text.trim()) { console.error("Thiếu TELEGRAM_BOT_TOKEN, CHAT_ID hoặc nội dung; không gửi."); process.exit(0); } // không làm hỏng workflow chỉ vì không báo được
  const safe = mask(text.replace(/\r/g, "").slice(0, 8000));
  // mask() gộp xuống dòng; giữ xuống dòng cho dễ đọc bằng cách che từng dòng riêng
  const pretty = text.replace(/\r/g, "").split("\n").map((l) => (l.trim() ? mask(l) : "")).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3800) || safe;
  for (let i = 0; i < 3; i++) {
    try { await call(token, "sendMessage", { chat_id: chat, text: pretty, disable_web_page_preview: true }); console.log("Đã gửi tin Telegram."); return; }
    catch (e) { console.error(`Gửi Telegram lỗi (${i + 1}/3): ${e.message}`); await new Promise((ok) => setTimeout(ok, 1500 * (i + 1))); }
  }
})();
