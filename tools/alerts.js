#!/usr/bin/env node
// Công cụ cho cảnh báo Telegram.
//   node tools/alerts.js xem        xem cảnh báo đang bật hay tắt (không in token)
//   node tools/alerts.js tim-chat   in chat id: nhắn bot một câu trước, rồi chạy lệnh này (cần botToken trong config.json hoặc VPAO_TELEGRAM_TOKEN)
//   node tools/alerts.js thu        gửi một tin thử tới chat đã cấu hình
"use strict";
const path = require("path");
const { loadConfig } = require("../lib/config");
const alerts = require("../lib/alerts");

const CFG = loadConfig(path.join(__dirname, ".."));
const user = (CFG && CFG.alerts) || {};
const a = alerts.normalize(user, process.env);
const cmd = process.argv[2] || "xem";
(async () => {
  if (cmd === "xem") {
    console.log(`Telegram: ${a.enabled ? "ĐÃ cấu hình (botToken + chatId)" : "chưa cấu hình"}${a.token && !a.chat ? " — có token, thiếu chatId (chạy: node tools/alerts.js tim-chat)" : ""}`);
    console.log(`Giờ yên lặng: ${a.quiet.enabled ? `${Math.floor(a.quiet.start / 60)}:${String(a.quiet.start % 60).padStart(2, "0")} → ${Math.floor(a.quiet.end / 60)}:${String(a.quiet.end % 60).padStart(2, "0")}` : "tắt"} · gửi nội dung: ${a.includeText ? "có" : "không"} · tối đa ${a.maxPerHour} tin/giờ`);
    console.log(`Nhận lệnh từ Telegram: ${a.inbound ? "bật" : "tắt"}${a.inbound && a.enabled ? ` (chỉ từ chat ${a.chat}${a.allowedUserIds.length ? ", người được phép " + a.allowedUserIds.join(",") : ""})` : ""} · báo xong lượt: ${a.reportDone ? "bật" : "tắt"} · việc giao hết hạn sau ${a.taskTtlMin} phút`);
  } else if (cmd === "tim-chat") {
    if (!a.token) { console.error("Chưa có botToken. Tạo bot với @BotFather, đặt vào config.json (alerts.telegram.botToken) hoặc biến VPAO_TELEGRAM_TOKEN."); process.exit(1); }
    const chats = await alerts.findChats(a.token);
    if (!chats.length) console.log("Chưa thấy chat nào. Mở bot trên Telegram, bấm Start hoặc nhắn một câu, rồi chạy lại.");
    for (const c of chats) console.log(`chatId ${c.id}  (${c.type}${c.name ? ", " + c.name : ""})`);
  } else if (cmd === "thu") {
    if (!a.enabled) { console.error("Chưa đủ botToken + chatId."); process.exit(1); }
    await alerts.create({ cfg: user, title: (CFG && CFG.title) || "Văn phòng AI" }).send("Tin thử: cảnh báo Telegram đã hoạt động.");
    console.log("Đã gửi tin thử. Kiểm tra Telegram.");
  } else { console.log("Dùng: node tools/alerts.js xem | tim-chat | thu"); process.exit(1); }
})().catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
