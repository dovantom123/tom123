// Che chuỗi giống khóa/bí mật trước khi hiện lên văn phòng. Thuần hàm, không đọc file.
// mask(): gọn một dòng (tin nhắn, tên). maskDoc(): giữ xuống dòng và Markdown (nội quy, bài học…).
// Regex không bắt được mọi thứ: đây là lớp che bổ sung, đừng coi là bảo đảm tuyệt đối.
"use strict";

// Quy tắc dùng chung cho cả hai hàm.
const COMMON = [
  // khối khóa riêng PEM (có thể nhiều dòng; thiếu dòng END thì che tới hết chuỗi)
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "‹khóa riêng›"],
  // JWT: ba đoạn base64url, đoạn đầu và đoạn giữa bắt đầu bằng eyJ ({"…)
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "‹khóa›"],
  // chuỗi kết nối có mật khẩu: scheme://user:pass@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, "$1‹ẩn›@"],
  // Authorization: Basic xxx / Bearer xxx
  [/\bauthorization\s*:\s*basic\s+\S+/gi, "authorization: basic ‹ẩn›"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "bearer ‹ẩn›"],
  // tiền tố khóa nổi tiếng
  [/\b(sk|pk|rk|ghp|gho|github_pat|xox[abprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{12,}/g, "‹khóa›"],
  [/\b(?:ghs|ghu|ghr|npm|hf)_[A-Za-z0-9]{16,}/g, "‹khóa›"],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, "‹khóa›"],
];
const WIN_SECRET_DIR = /[A-Za-z]:[\\/][^\s|;,]*secrets?[^\s|;,]*/gi;
const WIN_SECRET_DIR_DOC = /[A-Za-z]:[\\/][^\s|;,`]*secrets?[^\s|;,`]*/gi;
const KV = /((?:api[_-]?)?key|token|secret|password|passwd|pwd|bearer)\s*[:=]\s*\S+/gi;
const KV_DOC = /((?:api[_-]?)?key|token|secret|password|passwd|pwd)\s*[:=]\s*[^\s`|]+/gi;
const LONG_RUN = /[A-Za-z0-9_\-+/=]{48,}/g;
const LONG_MIXED = /\b(?=[A-Za-z0-9+/=]*[A-Z])(?=[A-Za-z0-9+/=]*[a-z])(?=[A-Za-z0-9+/=]*\d)[A-Za-z0-9+/=]{40,}\b/g;

function applyCommon(s) { for (const [re, to] of COMMON) s = s.replace(re, to); return s; }

function mask(s) {
  if (!s) return "";
  return applyCommon(String(s))
    .replace(WIN_SECRET_DIR, "‹thư mục khóa›")
    .replace(KV, "$1=‹ẩn›")
    .replace(LONG_RUN, "…")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function maskDoc(s) {
  if (!s) return "";
  return applyCommon(String(s))
    .replace(WIN_SECRET_DIR_DOC, "‹thư mục khóa›")
    .replace(KV_DOC, "$1=‹ẩn›")
    .replace(LONG_MIXED, "…");
}

module.exports = { mask, maskDoc };
