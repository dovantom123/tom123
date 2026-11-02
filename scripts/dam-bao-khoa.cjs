// Đảm bảo config.json có accessKey đủ mạnh (tạo mới nếu thiếu/quá ngắn). In ra stdout: dòng 1 = MOI hoặc CU, dòng 2 = khóa.
// Dùng bởi scripts/mo-web.ps1 để mở văn phòng qua địa chỉ công khai mà không để trống khóa.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = process.env.VPAO_CONFIG || path.join(__dirname, "..", "config.json");
let cfg = {};
if (fs.existsSync(file)) {
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
  catch (e) { process.stderr.write("config.json không đọc được (sai cú pháp JSON): " + e.message + "\n"); process.exit(2); }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { process.stderr.write("config.json phải là một đối tượng JSON.\n"); process.exit(2); }
}
const cur = typeof cfg.accessKey === "string" ? cfg.accessKey : "";
if (cur.length >= 16 && !process.argv.includes("--doi")) {
  process.stdout.write("CU\n" + cur + "\n");
} else {
  cfg.accessKey = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write("MOI\n" + cfg.accessKey + "\n");
}
