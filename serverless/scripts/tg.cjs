// Gọi API Telegram, không phụ thuộc thư viện. Token lấy từ biến môi trường, không bao giờ in ra.
"use strict";
const https = require("https");

const scrub = (msg, token) => String(msg || "").split(token || "\u0000").join("‹token›").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot‹token›");

function call(token, method, params, { timeoutMs = 15000 } = {}) {
  return new Promise((ok, bad) => {
    const body = JSON.stringify(params || {});
    const req = https.request({ hostname: "api.telegram.org", path: `/bot${token}/${method}`, method: "POST", timeout: timeoutMs, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let b = ""; res.on("data", (c) => { if (b.length < 200000) b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} if (res.statusCode === 200 && j && j.ok) ok(j.result); else bad(new Error(scrub(`Telegram ${res.statusCode}: ${(j && j.description) || "không rõ"}`, token))); });
    });
    req.on("timeout", () => req.destroy(new Error("quá thời gian chờ")));
    req.on("error", (e) => bad(new Error(scrub(e.message, token))));
    req.end(body);
  });
}
module.exports = { call, scrub };
