// In ra phần tóm tắt cuối cùng của Claude từ tệp kết quả của claude-code-action (execution_file).
// Định dạng tệp có thể đổi theo phiên bản nên đọc phòng thủ: ưu tiên phần tử có trường "result", rồi tới tin trợ lý cuối cùng.
//   node summarize.cjs <execution_file> [độ dài tối đa]
"use strict";
const fs = require("fs");

function lastText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((x) => x && x.type === "text" && typeof x.text === "string").map((x) => x.text).join("\n");
  return "";
}
function summarize(raw, max = 1500) {
  let data; try { data = JSON.parse(raw); } catch {
    data = String(raw).split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); // dạng mỗi dòng một JSON
  }
  const items = Array.isArray(data) ? data : [data];
  let text = "";
  for (let i = items.length - 1; i >= 0 && !text; i--) { const x = items[i]; if (x && typeof x.result === "string" && x.result.trim()) text = x.result; }
  for (let i = items.length - 1; i >= 0 && !text; i--) {
    const x = items[i], msg = x && (x.message || x);
    if (x && (x.type === "assistant" || (msg && msg.role === "assistant"))) text = lastText(msg && msg.content).trim();
  }
  text = text.replace(/\r/g, "").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
module.exports = { summarize };

if (require.main === module) {
  let out = "";
  try { out = summarize(fs.readFileSync(process.argv[2], "utf8"), Number(process.argv[3]) || 1500); } catch {}
  process.stdout.write(out || "(Claude không để lại tóm tắt.)");
}
