// Gõ việc vào một phiên Claude Code đang rảnh bằng tmux (dùng trên VPS: phiên chạy trong tmux, việc từ Telegram tới được cả khi
// phiên đã nghỉ hẳn). Chỉ dùng khi bật alerts.tmuxDelivery. KHÔNG qua shell: mọi đối số truyền dạng mảng cho execFile,
// văn bản đi bằng `send-keys -l` (gõ nguyên chữ, không hiểu là phím), nên không thể chèn lệnh.
"use strict";
const { execFile } = require("child_process");

const PANE = /^%\d{1,6}$/;
const SOCK = /^\/[A-Za-z0-9._/-]{1,200}$/;
const MAX = 2000;

// Một dòng duy nhất, bỏ ký tự điều khiển (kể cả xuống dòng và Esc): chặn việc "dán" nhiều dòng hoặc chuỗi phím đặc biệt.
const clean = (t) => String(t == null ? "" : t).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX);

function run(file, args, timeout = 5000) {
  return new Promise((ok, bad) => execFile(file, args, { timeout, windowsHide: true }, (err, out) => (err ? bad(err) : ok(String(out || "")))));
}

async function send({ socket, pane, text, exec = run, delayMs = 150, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms)) }) {
  if (!PANE.test(String(pane || ""))) return { ok: false, error: "mã pane tmux không hợp lệ" };
  if (socket && !SOCK.test(String(socket))) return { ok: false, error: "đường dẫn socket tmux không hợp lệ" };
  const body = clean(text); if (!body) return { ok: false, error: "nội dung trống" };
  const base = socket ? ["-S", socket] : [];
  try {
    const id = (await exec("tmux", [...base, "display-message", "-p", "-t", pane, "#{pane_id}"])).trim(); // pane còn tồn tại không
    if (id !== pane) return { ok: false, error: "pane tmux không còn" };
    await exec("tmux", [...base, "send-keys", "-t", pane, "C-u"]);               // xóa chữ đang gõ dở trên dòng nhập
    await exec("tmux", [...base, "send-keys", "-t", pane, "-l", "--", body]);     // gõ nguyên văn
    await sleep(delayMs);                                                          // để giao diện nhận xong rồi mới nhấn Enter (tránh coi là dán)
    await exec("tmux", [...base, "send-keys", "-t", pane, "Enter"]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.code === "ENOENT" ? "máy này chưa cài tmux" : `tmux lỗi: ${String(e.message).split("\n")[0].slice(0, 120)}` }; }
}

module.exports = { send, clean, PANE, SOCK };
