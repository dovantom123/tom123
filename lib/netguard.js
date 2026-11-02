// Các lớp bảo vệ mạng nhỏ cho máy chủ văn phòng: kiểm tra Host (chống DNS rebinding),
// giới hạn thử sai, so khóa an toàn thời gian, tệp thông tin hook (cổng + token).
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// host trong config.json có chỉ nghe trên máy này không?
function isLoopbackBind(host) { return LOOPBACK_NAMES.has(String(host || "").trim().toLowerCase()); }

// Địa chỉ người gọi có phải vòng lặp không (kể cả dạng IPv4 nhúng IPv6).
function isLoopbackAddr(addr) { return /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(String(addr || "")); }

// Yêu cầu đến thẳng từ máy này, không đi qua đường hầm/proxy (Cloudflare gắn cf-*, proxy gắn x-forwarded-for).
function isDirectLocal(req) {
  const h = req.headers || {};
  return isLoopbackAddr(req.socket && req.socket.remoteAddress) && !h["cf-ray"] && !h["cf-connecting-ip"] && !h["x-forwarded-for"] && !h["forwarded"];
}

// Header Host hợp lệ khi chỉ nghe trên máy này: localhost / 127.0.0.1 / [::1], có thể kèm cổng.
function hostAllowed(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  const m = h.match(/^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/);
  return !!m && LOOPBACK_NAMES.has(m[1]);
}

// So hai chuỗi không lộ độ dài khớp qua thời gian.
function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a == null ? "" : a)).digest();
  const y = crypto.createHash("sha256").update(String(b == null ? "" : b)).digest();
  return crypto.timingSafeEqual(x, y) && String(a) === String(b);
}

// Giới hạn số lần thử sai: quá `max` lần trong `windowMs` thì chặn tới khi các lần cũ hết hạn.
function createLimiter({ max = 5, windowMs = 600000, now = Date.now } = {}) {
  const hits = new Map();
  const fresh = (k) => { const t = now(), l = (hits.get(k) || []).filter((x) => t - x < windowMs); if (l.length) hits.set(k, l); else hits.delete(k); return l; };
  return {
    blocked: (k) => fresh(k).length >= max,
    fail: (k) => { const l = fresh(k); l.push(now()); hits.set(k, l); if (hits.size > 5000) hits.delete(hits.keys().next().value); },
    reset: (k) => { hits.delete(k); },
  };
}

// Tệp {port, token} để hooks/emit.js biết gửi đi đâu. Token giữ nguyên giữa các lần chạy; ghi quyền 0600.
function writeEndpoint(file, port) {
  let token = "";
  try { const old = JSON.parse(fs.readFileSync(file, "utf8")); if (typeof old.token === "string" && /^[0-9a-f]{48}$/.test(old.token)) token = old.token; } catch {}
  if (!token) token = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ port, token }) + "\n", { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
  return token;
}
function readEndpoint(file) {
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (j && Number.isInteger(j.port) && typeof j.token === "string") return j; } catch {}
  return null;
}

module.exports = { isLoopbackBind, isLoopbackAddr, isDirectLocal, hostAllowed, safeEqual, createLimiter, writeEndpoint, readEndpoint };
