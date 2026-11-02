// Nhận lệnh từ Telegram (giao việc, xem trạng thái, báo cáo, dừng). Văn phòng tự hỏi Telegram liên tục (long polling),
// nên không cần mở cổng ra Internet.
//
// AN TOÀN (đây là cửa điều khiển vào máy bạn, nên chặt):
//  - chỉ nhận tin từ đúng chatId đã cấu hình; chat riêng thì người gửi phải chính là chat đó; nhóm thì người gửi phải nằm trong allowedUserIds;
//  - tin của người lạ bị bỏ qua, không trả lời (không lộ bot đang nghe);
//  - tin cũ (lúc văn phòng tắt, hoặc quá 2 phút) và tin chuyển tiếp không bao giờ được thi hành;
//  - tối đa maxPerMin lệnh mỗi phút; mỗi tin tối đa 2000 ký tự;
//  - bot không tự chạy gì mới: chỉ chuyển việc cho phiên có sẵn (ctx.giao) hoặc chặn lệnh tiếp theo của phiên (ctx.dung).
"use strict";

const MAX_TEXT = 2000;
const MAX_AGE_MS = 120000;
const LIST_TTL = 30 * 60000;
const boDau = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const ago = (t, now) => { if (!t) return "chưa có"; const m = Math.round((now - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const STATUS = { active: "đang làm", idle: "rảnh", away: "vắng" };

const HELP = `Lệnh:
/ds — ai đang có mặt, đang làm gì (có số thứ tự)
/viec 2 nội dung — giao việc cho người số 2 trong /ds
/viec Tên người: nội dung — giao theo tên
Trả lời thẳng vào một tin cảnh báo — gửi cho đúng người đó
/dung 2 — chặn lệnh tiếp theo của người số 2 và bảo họ dừng
/baocao — mỗi người đang làm gì, nói gì lần cuối
/cananh — việc đang chờ bạn quyết`;

function create({ cfg, call, ctx, now = Date.now, log = () => {}, pollMs = 800 }) {
  const chat = String(cfg.chat), allowed = new Set((cfg.allowedUserIds || []).map(String));
  const st = { offset: 0, running: false, lastList: null, hits: [], warnedStranger: new Set(), warnedGroup: false, warnedConflict: false };
  const maxPerMin = cfg.maxPerMin || 20;

  const reply = (text) => call("sendMessage", { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true });

  function authorized(m) {
    if (!m || !m.chat || String(m.chat.id) !== chat) return false;
    if (m.chat.type === "private") return !m.from || String(m.from.id) === chat;
    if (!allowed.size) { if (!st.warnedGroup) { st.warnedGroup = true; log("Telegram: chatId là nhóm nhưng chưa có allowedUserIds, bỏ qua mọi lệnh (thêm id người được phép vào alerts.telegram.allowedUserIds)"); } return false; }
    return !!m.from && allowed.has(String(m.from.id));
  }

  // "2" → theo /ds gần nhất (nếu còn mới), nếu không thì theo danh sách hiện tại; chữ → khớp tên (không phân biệt dấu/hoa thường).
  function resolve(ref) {
    const live = ctx.agents(), r = String(ref || "").trim();
    if (!r) return { error: "Thiếu người nhận. Gõ /ds để xem danh sách." };
    if (/^\d{1,3}$/.test(r)) {
      const list = st.lastList && now() - st.lastList.at < LIST_TTL ? st.lastList.items : live;
      const a = list[Number(r) - 1];
      if (!a) return { error: `Không có người số ${r}. Gõ /ds để xem lại danh sách.` };
      const cur = live.find((x) => x.key === a.key);
      return cur ? { agent: cur } : { error: `${a.name} không còn trong văn phòng. Gõ /ds để xem lại.` };
    }
    const n = boDau(r);
    const exact = live.filter((a) => boDau(a.name) === n || a.key.toLowerCase() === n);
    if (exact.length === 1) return { agent: exact[0] };
    const part = live.filter((a) => boDau(a.name).includes(n) || a.key.toLowerCase().startsWith(n));
    if (part.length === 1) return { agent: part[0] };
    if (part.length > 1) return { error: `Có ${part.length} người khớp "${r}": ${part.slice(0, 5).map((a) => a.name).join(", ")}. Dùng số trong /ds.` };
    return { error: `Không thấy "${r}". Gõ /ds để xem danh sách.` };
  }

  const listText = (items) => items.length ? items.map((a, i) => `${i + 1}. ${a.name} (${a.platform === "codex" ? "Codex" : "Claude"} · ${STATUS[a.status] || a.status}${a.flag === "blocked" ? " · bị chặn" : ""})`).join("\n") : "Chưa có ai trong văn phòng.";

  async function cmdDs() {
    const items = ctx.agents(); st.lastList = { at: now(), items };
    return reply(listText(items) + (items.length ? "\n\nGiao việc: /viec <số> <nội dung>" : ""));
  }
  async function cmdBaoCao() {
    const items = ctx.agents(), t = now();
    if (!items.length) return reply("Chưa có ai trong văn phòng.");
    return reply(items.map((a) => `• ${a.name} — ${STATUS[a.status] || a.status}, xong lượt: ${ago(a.lastDoneAt, t)}${a.lastText ? `\n  “${clip(a.lastText, 160)}”` : ""}`).join("\n"));
  }
  async function cmdCanAnh() {
    const items = (ctx.asks ? ctx.asks() : []).filter((x) => x.exact && !x.guess && !x.answered);
    return reply(items.length ? items.map((x) => `• ${x.who || x.whoLabel || "?"}: ${clip(x.text, 200)}`).join("\n") : "Không có việc nào đang chờ bạn.");
  }
  async function toAgent(ref, text) {
    const r = resolve(ref); if (r.error) return reply(r.error);
    if (!text) return reply("Thiếu nội dung việc.");
    const out = await ctx.giao(r.agent.key, text);
    return reply(out.ok ? `✓ ${out.msg}` : `✗ ${out.msg}`);
  }

  // Tách "<người> <nội dung>" từ phần sau lệnh: "2 làm gì đó", "Tên Dài: làm gì đó", "Tên làm gì đó".
  function splitTarget(rest) {
    let m = rest.match(/^(\d{1,3})\s+([\s\S]+)$/); if (m) return [m[1], m[2].trim()];
    m = rest.match(/^([^:\n]{1,60}):\s*([\s\S]+)$/); if (m) return [m[1].trim(), m[2].trim()];
    m = rest.match(/^(\S+)\s+([\s\S]+)$/); if (m) return [m[1], m[2].trim()];
    return [rest.trim(), ""];
  }

  async function handle(update) {
    const m = update && update.message;
    if (!m || typeof m.text !== "string") return;
    if (!authorized(m)) { const id = m.chat && String(m.chat.id); if (id && !st.warnedStranger.has(id) && st.warnedStranger.size < 20) { st.warnedStranger.add(id); log(`Telegram: bỏ qua tin từ chat không được phép (id ${id})`); } return; }
    if (m.forward_date || m.forward_origin || m.forward_from || m.forward_from_chat) return reply("Bỏ qua tin chuyển tiếp (không thi hành lệnh trong tin chuyển tiếp).");
    if (m.date && now() - m.date * 1000 > MAX_AGE_MS) return;
    const t = now(); st.hits = st.hits.filter((x) => t - x < 60000);
    if (st.hits.length >= maxPerMin) return reply(`Quá ${maxPerMin} lệnh trong một phút, chờ một chút rồi gửi lại.`);
    st.hits.push(t);
    const text = m.text.trim();
    if (!text) return;
    if (text.length > MAX_TEXT) return reply(`Tin quá dài (${text.length} ký tự, tối đa ${MAX_TEXT}).`);

    const cmd = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    if (cmd) {
      const name = cmd[1].toLowerCase(), rest = (cmd[2] || "").trim();
      if (name === "start" || name === "help" || name === "tro_giup") return reply(HELP);
      if (name === "ds" || name === "trangthai") return cmdDs();
      if (name === "baocao") return cmdBaoCao();
      if (name === "cananh") return cmdCanAnh();
      if (name === "viec" || name === "giao" || name === "task") { if (!rest) return reply("Dùng: /viec <số> <nội dung>\nVí dụ: /viec 2 sửa lỗi đăng nhập"); const [ref, body] = splitTarget(rest); return toAgent(ref, body); }
      if (name === "dung" || name === "stop") {
        const r = resolve(rest); if (r.error) return reply(r.error);
        const out = await ctx.dung(r.agent.key); return reply(out.ok ? `✓ ${out.msg}` : `✗ ${out.msg}`);
      }
      return reply("Không hiểu lệnh này.\n\n" + HELP);
    }
    const replied = m.reply_to_message && ctx.agentForReply ? ctx.agentForReply(m.reply_to_message.message_id) : null; // trả lời vào tin cảnh báo
    if (replied) { const a = ctx.agents().find((x) => x.key === replied); if (!a) return reply("Người đó không còn trong văn phòng."); const out = await ctx.giao(a.key, text); return reply(out.ok ? `✓ ${out.msg}` : `✗ ${out.msg}`); }
    const named = text.match(/^([^:\n]{1,60}):\s*([\s\S]+)$/);
    if (named) { const r = resolve(named[1]); if (!r.error) return toAgent(named[1], named[2].trim()); }
    return reply("Chưa rõ gửi cho ai. Gõ /ds rồi /viec <số> <nội dung>, hoặc trả lời thẳng vào một tin cảnh báo.\n\n" + HELP);
  }

  // Vòng lấy tin. Lần đầu bỏ toàn bộ tin tồn đọng để không thi hành lệnh cũ.
  async function loop() {
    let primed = false, wait = pollMs;
    while (st.running) {
      try {
        if (!primed) { const last = await call("getUpdates", { offset: -1, limit: 1, timeout: 0 }); if (last && last.length) st.offset = last[last.length - 1].update_id + 1; primed = true; continue; }
        const ups = await call("getUpdates", { offset: st.offset, timeout: 25, allowed_updates: ["message"] }, { timeoutMs: 35000 });
        for (const u of ups || []) { st.offset = u.update_id + 1; try { await handle(u); } catch (e) { log(`Telegram: lỗi xử lý lệnh: ${e.message}`); } }
        wait = pollMs;
      } catch (e) {
        if (/409|webhook|Conflict/i.test(e.message)) { if (!st.warnedConflict) { st.warnedConflict = true; log("Telegram: bot đang có webhook hoặc một chương trình khác cũng đang nhận tin (getUpdates xung đột), chưa nhận lệnh được."); } wait = 30000; }
        else { wait = Math.min(60000, wait * 2 || 3000); }
      }
      await new Promise((ok) => setTimeout(ok, wait));
    }
  }

  return { handle, resolve, start() { if (st.running) return; st.running = true; loop(); }, stop() { st.running = false; }, state: st, HELP };
}

module.exports = { create, HELP };
