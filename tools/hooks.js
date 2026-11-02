#!/usr/bin/env node
// Cài / gỡ / xem hook Claude Code của văn phòng.
//   node tools/hooks.js cai      thêm hook vào ~/.claude/settings.json (hoặc $CLAUDE_CONFIG_DIR/settings.json), sao lưu trước
//   node tools/hooks.js go       gỡ đúng các hook của văn phòng, không đụng hook khác
//   node tools/hooks.js xem      xem đã cài đủ chưa
"use strict";
const path = require("path");
const hi = require("../lib/hookinstall");

const ROOT = path.join(__dirname, "..");
const cmd = process.argv[2] || "xem";
try {
  if (cmd === "cai" || cmd === "install") {
    const r = hi.install(ROOT);
    console.log(r.added.length || r.updated.length ? `Đã cài hook vào ${r.file} (thêm ${r.added.length}, trỏ lại ${r.updated.length}). Bản sao lưu nằm cạnh file đó.` : `Hook đã đủ trong ${r.file}, không đổi gì.`);
    console.log("Phiên Claude Code đang mở cần mở lại để nhận hook. Khởi động lại văn phòng: npm start");
  } else if (cmd === "go" || cmd === "uninstall") {
    const r = hi.uninstall();
    console.log(r.removed ? `Đã gỡ ${r.removed} hook khỏi ${r.file}.` : `Không có hook của văn phòng trong ${r.file}.`);
  } else if (cmd === "xem" || cmd === "status") {
    const r = hi.status(ROOT);
    console.log(`${r.file}: ${r.installed}/${hi.EVENTS.length} hook${r.missing.length ? `, thiếu: ${r.missing.join(", ")}` : ""}${r.stale.length ? `, trỏ về nơi cũ: ${r.stale.join(", ")} (chạy lại "cai")` : ""}`);
  } else { console.log("Dùng: node tools/hooks.js cai | go | xem"); process.exit(1); }
} catch (e) { console.error("Lỗi:", e.message); process.exit(1); }
