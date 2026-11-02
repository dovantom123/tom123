// Thử một khóa API (của Anthropic hoặc của đại lý) bằng một yêu cầu nhỏ, để biết khóa có chạy với Claude Code / GitHub Actions không.
// Chạy trên MÁY BẠN, khóa chỉ nằm trong biến môi trường của cửa sổ đó và không bao giờ được in ra.
//   env: ANTHROPIC_API_KEY (hoặc ANTHROPIC_AUTH_TOKEN), MODEL (tên mô hình đại lý ghi trên trang của họ),
//        ANTHROPIC_BASE_URL (bỏ trống = https://api.anthropic.com)
//   node serverless/scripts/check-api.cjs
//   node serverless/scripts/check-api.cjs --models     liệt kê các mô hình khóa này được dùng (không cần MODEL), nếu đại lý có hỗ trợ
// Script thử hai kiểu xác thực: header x-api-key (kiểu Anthropic) rồi Authorization: Bearer, và nói kiểu nào được.
"use strict";
const http = require("http");
const https = require("https");

const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
const model = process.env.MODEL || "";
const baseRaw = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").trim();
const scrub = (s) => (key ? String(s).split(key).join("‹khóa›") : String(s));

function fail(msg) { console.error(scrub(msg)); process.exit(1); }
if (!key) fail("Thiếu ANTHROPIC_API_KEY (hoặc ANTHROPIC_AUTH_TOKEN) trong biến môi trường.");
const LIST = process.argv.includes("--models");
if (!LIST && !model) fail("Thiếu MODEL: đặt tên mô hình đúng như trang của đại lý ghi, ví dụ $env:MODEL=\"...\".");
let url; try { url = new URL(baseRaw.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/messages"); } catch { fail(`ANTHROPIC_BASE_URL không hợp lệ: ${baseRaw}`); }
if (url.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) fail("Địa chỉ phải là https (chỉ localhost mới được http).");

function listModels(headers) {
  return new Promise((ok) => {
    const u = new URL(url.href.replace(/\/messages$/, "/models")), lib = u.protocol === "http:" ? http : https;
    const req = lib.request(u, { method: "GET", timeout: 30000, headers: { "anthropic-version": "2023-06-01", ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => { if (b.length < 500000) b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, raw: b.slice(0, 300) }); });
    });
    req.on("timeout", () => req.destroy(new Error("quá thời gian chờ")));
    req.on("error", (e) => ok({ status: 0, error: e.message }));
    req.end();
  });
}

function once(headers) {
  return new Promise((ok) => {
    const body = JSON.stringify({ model, max_tokens: 24, messages: [{ role: "user", content: "Trả lời đúng một chữ: ok" }] });
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(url, { method: "POST", timeout: 30000, headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body), ...headers } }, (res) => {
      let b = ""; res.on("data", (c) => { if (b.length < 100000) b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} ok({ status: res.statusCode, json: j, raw: b.slice(0, 300) }); });
    });
    req.on("timeout", () => req.destroy(new Error("quá thời gian chờ")));
    req.on("error", (e) => ok({ status: 0, error: e.message }));
    req.end(body);
  });
}

(async () => {
  if (LIST) {
    console.log(`Địa chỉ: ${url.origin}${url.pathname.replace(/\/messages$/, "/models")}`);
    for (const [name, h] of [["x-api-key", { "x-api-key": key }], ["Authorization: Bearer", { Authorization: `Bearer ${key}` }]]) {
      const r = await listModels(h);
      if (r.status === 0) fail(`\nKhông kết nối được: ${r.error}`);
      const arr = r.json && (Array.isArray(r.json.data) ? r.json.data : Array.isArray(r.json) ? r.json : null);
      if (r.status === 200 && arr) {
        const ids = arr.map((m) => (typeof m === "string" ? m : m && (m.id || m.name))).filter(Boolean);
        console.log(`\nCó ${ids.length} mô hình (xác thực: ${name}):\n${ids.slice(0, 80).map((i) => "  " + scrub(i)).join("\n")}${ids.length > 80 ? `\n  … và ${ids.length - 80} mô hình nữa` : ""}`);
        console.log("\n=> Chọn một tên trong danh sách, đặt vào $env:MODEL rồi chạy lại không có --models.");
        return;
      }
      if (![401, 403].includes(r.status)) fail(`\nKhông lấy được danh sách (HTTP ${r.status}): ${scrub(r.raw)}\n=> Đại lý có thể không hỗ trợ liệt kê. Xem tên mô hình ở trang của họ.`);
    }
    fail("\nKhông lấy được danh sách: khóa bị từ chối ở cả hai kiểu xác thực.");
  }
  console.log(`Địa chỉ: ${url.origin}${url.pathname}\nMô hình: ${model}`);
  const tries = [["x-api-key", { "x-api-key": key }], ["Authorization: Bearer", { Authorization: `Bearer ${key}` }]];
  let last = null;
  for (const [name, h] of tries) {
    const r = await once(h); last = { name, ...r };
    if (r.status === 200 && r.json && Array.isArray(r.json.content)) {
      const text = r.json.content.filter((x) => x.type === "text").map((x) => x.text).join(" ").trim();
      console.log(`\nTHÀNH CÔNG với kiểu xác thực: ${name}\nMô hình trả về: ${r.json.model || "(không ghi)"}\nTrả lời: ${scrub(text) || "(trống)"}${r.json.usage ? `\nToken dùng: vào ${r.json.usage.input_tokens}, ra ${r.json.usage.output_tokens}` : ""}`);
      console.log(name === "x-api-key" ? "\n=> Đặt khóa vào secret ANTHROPIC_API_KEY (và biến ANTHROPIC_BASE_URL nếu không dùng địa chỉ chính thức)." : "\n=> Đại lý dùng kiểu Bearer: báo tôi để chỉnh workflow dùng ANTHROPIC_AUTH_TOKEN.");
      return;
    }
    if (r.status === 0) fail(`\nKhông kết nối được: ${r.error}`);
    if (![401, 403].includes(r.status)) break; // lỗi khác (404, 400, 429...) thì đổi kiểu xác thực cũng không giúp
  }
  const msg = last.json && (last.json.error && (last.json.error.message || last.json.error) || last.json.message) || last.raw;
  const hint = { 401: "khóa sai hoặc kiểu xác thực không đúng", 403: "khóa bị từ chối hoặc hết hạn mức", 404: "đường dẫn không đúng: đại lý có thể không có /v1/messages (không tương thích API Anthropic) hoặc sai ANTHROPIC_BASE_URL", 400: "thường là sai tên mô hình (MODEL)", 429: "bị giới hạn tốc độ hoặc hết hạn mức", 503: "nhóm kênh của khóa này không có mô hình đó (hoặc kênh đang tắt). Chạy lại với --models để xem tên mô hình được dùng, hoặc hỏi đại lý" }[last.status] || "";
  fail(`\nTHẤT BẠI (HTTP ${last.status}, thử ${last.name}): ${scrub(typeof msg === "string" ? msg : JSON.stringify(msg))}${hint ? `\n=> ${hint}.` : ""}`);
})();
