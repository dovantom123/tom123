// Gọi API Telegram, không phụ thuộc thư viện. Token lấy từ biến môi trường, không bao giờ in ra.
"use strict";
const https = require("https");
const http = require("http");

const scrub = (msg, token) => String(msg || "").split(token || "\u0000").join("‹token›").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot‹token›");

function call(token, method, params, { timeoutMs = 15000 } = {}) {
  return new Promise((ok, bad) => {
    const body = JSON.stringify(params || {});
    // VPAO_TELEGRAM_API chỉ dùng để test (trỏ về máy chủ giả); bình thường luôn là api.telegram.org
    const base = new URL(process.env.VPAO_TELEGRAM_API || "https://api.telegram.org"), lib = base.protocol === "http:" ? http : https;
    const req = lib.request({ protocol: base.protocol, hostname: base.hostname, port: base.port || undefined, path: `/bot${token}/${method}`, method: "POST", timeout: timeoutMs, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let b = ""; res.on("data", (c) => { if (b.length < 200000) b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} if (res.statusCode === 200 && j && j.ok) ok(j.result); else bad(new Error(scrub(`Telegram ${res.statusCode}: ${(j && j.description) || "không rõ"}`, token))); });
    });
    req.on("timeout", () => req.destroy(new Error("quá thời gian chờ")));
    req.on("error", (e) => bad(new Error(scrub(e.message, token))));
    req.end(body);
  });
}
module.exports = { call, scrub };
