// Cloudflare Worker: nhận lệnh Telegram (webhook) → kích hoạt GitHub Actions chạy Claude Code. Chạy 24/7 không cần máy chủ nào.
// Một tệp duy nhất, không import: có thể dán thẳng vào Cloudflare Dashboard (Workers → Edit code).
//
// Biến cần đặt (Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN       (Secret)  token bot. DÙNG BOT RIÊNG, không dùng chung bot với văn phòng ở máy bạn (webhook và getUpdates xung đột)
//   TELEGRAM_WEBHOOK_SECRET  (Secret)  chuỗi ngẫu nhiên 1-256 ký tự [A-Za-z0-9_-]; Telegram gửi kèm mỗi tin để chứng minh tin đến từ Telegram
//   GITHUB_TOKEN             (Secret)  fine-grained PAT, chỉ cho repo đích: Contents (Read and write) + Actions (Read)
//   GITHUB_REPO              (Text)    "chủ/repo", ví dụ dovantom123/tom123
//   OWNER_CHAT_ID            (Text)    chat id của bạn (chỉ chat này được ra lệnh)
//   OWNER_USER_ID            (Text, tùy chọn) nếu OWNER_CHAT_ID là nhóm: id người được phép
//   DAILY_CAP                (Text, tùy chọn) số việc tối đa mỗi ngày, mặc định 10
//   STATE                    (KV namespace, tùy chọn nhưng nên có) chống xử lý trùng và đếm hạn mức ngày
//
// An toàn: sai mã bí mật → 401; người lạ, tin chuyển tiếp, tin cũ quá 2 phút → bỏ qua, không trả lời; mỗi tin tối đa 2000 ký tự.

const MAX_TEXT = 2000;
const MAX_AGE_S = 120;
const HELP = `Lệnh:
/viec <nội dung> — giao việc: Claude sửa mã trong repo rồi mở Pull Request (không tự gộp vào nhánh chính)
/hoi <câu hỏi> — hỏi về mã trong repo, chỉ đọc, không sửa gì
/trangthai — 5 lần chạy gần nhất`;

// So sánh chuỗi không lộ độ dài khớp qua thời gian.
export function safeEqual(a, b) {
  a = String(a ?? ""); b = String(b ?? "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function parseCommand(text) {
  const m = String(text || "").trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || "").trim() } : null;
}

const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function tg(env, fetchFn, method, params) {
  const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  return r;
}
const say = (env, fetchFn, chatId, text) => tg(env, fetchFn, "sendMessage", { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true });

function gh(env, fetchFn, path, init = {}) {
  return fetchFn(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, { ...init, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "van-phong-ao-telegram-worker", ...(init.headers || {}) } });
}

const VN = { completed: "xong", in_progress: "đang chạy", queued: "đang chờ" };
const CONC = { success: "thành công", failure: "lỗi", cancelled: "đã hủy", skipped: "bỏ qua", timed_out: "quá thời gian" };

async function statusText(env, fetchFn) {
  const r = await gh(env, fetchFn, "/actions/runs?event=repository_dispatch&per_page=5");
  if (!r.ok) return `Không đọc được trạng thái (GitHub trả ${r.status}). Kiểm tra quyền Actions: Read của token.`;
  const j = await r.json(), runs = (j.workflow_runs || []).slice(0, 5);
  if (!runs.length) return "Chưa có lần chạy nào.";
  return runs.map((x) => `• ${x.name}: ${x.status === "completed" ? CONC[x.conclusion] || x.conclusion : VN[x.status] || x.status} (${String(x.created_at).replace("T", " ").slice(0, 16)} UTC)\n  ${x.html_url}`).join("\n");
}

// Xử lý một update. `deps` cho phép test: { fetch, now }. Trả về mô tả việc đã làm (để test), lỗi không bao giờ ném ra ngoài.
export async function handleUpdate(update, env, deps = {}) {
  const fetchFn = deps.fetch || fetch, now = deps.now || (() => Date.now());
  try {
    const m = update && update.message;
    if (!m || typeof m.text !== "string" || !m.chat) return { action: "ignored", why: "không phải tin chữ" };
    const chat = String(env.OWNER_CHAT_ID || ""), from = m.from ? String(m.from.id) : "";
    const okUser = m.chat.type === "private" ? from === chat : !!env.OWNER_USER_ID && from === String(env.OWNER_USER_ID);
    if (!chat || String(m.chat.id) !== chat || !okUser) return { action: "ignored", why: "không phải chủ" }; // im lặng
    const reply = (t) => say(env, fetchFn, chat, t);
    if (m.forward_date || m.forward_origin || m.forward_from || m.forward_from_chat) { await reply("Bỏ qua tin chuyển tiếp (không thi hành lệnh trong tin chuyển tiếp)."); return { action: "forwarded" }; }
    if (m.date && now() / 1000 - m.date > MAX_AGE_S) return { action: "ignored", why: "tin cũ" };
    if (env.STATE && update.update_id != null) { // Telegram có thể gửi lại cùng một update
      const k = `u:${update.update_id}`;
      if (await env.STATE.get(k)) return { action: "ignored", why: "trùng" };
      await env.STATE.put(k, "1", { expirationTtl: 86400 });
    }
    const c = parseCommand(m.text);
    if (!c) { await reply("Chưa hiểu. Dùng /viec <việc> hoặc /hoi <câu hỏi>.\n\n" + HELP); return { action: "help" }; }
    if (c.cmd === "start" || c.cmd === "help") { await reply(HELP); return { action: "help" }; }
    if (c.cmd === "trangthai") { const t = await statusText(env, fetchFn); await reply(t); return { action: "status", text: t }; }
    if (c.cmd !== "viec" && c.cmd !== "hoi") { await reply("Không hiểu lệnh này.\n\n" + HELP); return { action: "help" }; }
    if (!c.arg) { await reply(c.cmd === "viec" ? "Dùng: /viec <nội dung việc>" : "Dùng: /hoi <câu hỏi>"); return { action: "usage" }; }
    if (c.arg.length > MAX_TEXT) { await reply(`Quá dài (${c.arg.length} ký tự, tối đa ${MAX_TEXT}).`); return { action: "toolong" }; }
    const cap = Math.max(1, Number(env.DAILY_CAP) || 10);
    if (env.STATE) {
      const key = `cap:${new Date(now()).toISOString().slice(0, 10)}`, used = Number(await env.STATE.get(key)) || 0;
      if (used >= cap) { await reply(`Hôm nay đã đủ ${cap} việc (hạn mức ngày, để khỏi tốn tiền ngoài ý muốn). Mai gửi tiếp.`); return { action: "capped" }; }
      await env.STATE.put(key, String(used + 1), { expirationTtl: 172800 });
    }
    const payload = { task: c.arg, chat_id: chat, message_id: m.message_id, dispatch_id: String(update.update_id ?? m.message_id), requested_at: new Date(now()).toISOString() };
    const r = await gh(env, fetchFn, "/dispatches", { method: "POST", body: JSON.stringify({ event_type: c.cmd === "viec" ? "telegram-viec" : "telegram-hoi", client_payload: payload }) });
    if (r.status !== 204) {
      await reply(`Không kích hoạt được GitHub Actions (GitHub trả ${r.status}). ${r.status === 404 || r.status === 403 ? "Kiểm tra GITHUB_REPO và quyền của token (Contents: Read and write)." : ""}`.trim());
      return { action: "dispatch_failed", status: r.status };
    }
    await reply(c.cmd === "viec" ? `Đã nhận việc: “${clip(c.arg, 120)}”. Claude đang làm trên GitHub Actions, xong sẽ báo lại kèm link Pull Request.` : `Đã nhận câu hỏi: “${clip(c.arg, 120)}”. Có trả lời sẽ gửi lại ngay.`);
    return { action: "dispatched", event_type: c.cmd === "viec" ? "telegram-viec" : "telegram-hoi", payload };
  } catch (e) {
    return { action: "error", error: String(e && e.message || e).slice(0, 200) }; // không để lộ token: không in env
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return new Response("ok");
    if (request.method !== "POST" || url.pathname !== "/telegram") return new Response("not found", { status: 404 });
    if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.TELEGRAM_WEBHOOK_SECRET)) return new Response("unauthorized", { status: 401 });
    const body = await request.text();
    if (body.length > 100000) return new Response("too large", { status: 413 });
    let update; try { update = JSON.parse(body); } catch { return new Response("bad request", { status: 400 }); }
    const work = handleUpdate(update, env);
    if (ctx && ctx.waitUntil) ctx.waitUntil(work); else await work;
    return new Response("ok"); // trả 200 ngay để Telegram không gửi lại
  },
};
