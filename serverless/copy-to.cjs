// Chép bộ "Telegram → GitHub Actions" vào một repo dự án khác (repo mà bạn muốn Claude làm việc).
//   node serverless/copy-to.cjs <thư-mục-repo-đích>
// Chép: 2 workflow, các script phụ, và lib/mask.js (đổi tên thành serverless/scripts/lib-mask.js). Không ghi đè nếu tệp đích đã có và khác.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, ".git"))) { console.error("Dùng: node serverless/copy-to.cjs <thư mục repo đích>  (phải là một repo git)"); process.exit(1); }
const files = [
  [".github/workflows/telegram-viec.yml", ".github/workflows/telegram-viec.yml"],
  [".github/workflows/telegram-hoi.yml", ".github/workflows/telegram-hoi.yml"],
  ["serverless/scripts/tg.cjs", "serverless/scripts/tg.cjs"], ["serverless/scripts/notify.cjs", "serverless/scripts/notify.cjs"],
  ["serverless/scripts/summarize.cjs", "serverless/scripts/summarize.cjs"], ["serverless/scripts/set-webhook.cjs", "serverless/scripts/set-webhook.cjs"],
  ["lib/mask.js", "serverless/scripts/lib-mask.js"],
];
let copied = 0;
for (const [from, to] of files) {
  const src = path.join(ROOT, from), dst = path.join(target, to), data = fs.readFileSync(src);
  if (fs.existsSync(dst)) { if (fs.readFileSync(dst).equals(data)) continue; console.log(`  Bỏ qua (đã có, khác nội dung): ${to}`); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, data); copied++; console.log(`  Đã chép: ${to}`);
}
console.log(copied ? `\nXong. Vào ${target}, kiểm tra rồi commit và push các tệp trên. Rồi làm tiếp theo serverless/HUONG-DAN.md.` : "\nKhông có gì mới để chép.");
