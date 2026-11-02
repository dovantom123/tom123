// Cảnh báo chủ động qua Telegram: khi có việc cần bạn, phiên bị chặn lâu, tiền AI gần trần, hoặc hệ thống có sự cố.
// Mặc định TẮT. Đây là chỗ DUY NHẤT văn phòng gửi dữ liệu ra Internet (tới api.telegram.org), và chỉ khi bạn tự điền
// botToken + chatId. Nội dung đã qua mask() và cắt ngắn; đặt includeText=false để chỉ gửi "ai đang cần bạn".
// Phần quyết định (collect, giờ yên lặng, chống lặp) là hàm thuần để test; chỉ telegramCall mới đụng mạng.
"use strict";
const http = require("http");
const https = require("https");

const DEFAULTS = {
  telegram: { botToken: "", chatId: "" },
  dashboardUrl: "",       // nếu đặt, kèm vào cuối tin để bấm mở văn phòng
  includeText: true,      // false = không gửi nội dung câu hỏi/thông báo, chỉ tên người đang cần bạn
  blockedAfterMin: 3,     // phiên bị chặn quá số phút này mới báo
  cooldownMin: 60,        // cùng một cảnh báo hệ thống không báo lại trong số phút này
  maxPerHour: 20,         // trần số tin mỗi giờ; vượt thì gom thành một tin tóm tắt
  reportDone: true,       // báo khi một phiên xong lượt (kèm vài dòng cuối câu trả lời nếu includeText)
  reportGapSec: 120,      // cùng một người không báo xong lượt dày hơn mức này
  inbound: true,          // nhận lệnh từ Telegram (/ds, /viec, /baocao…); chỉ từ đúng chatId, xem lib/tgbot.js
  taskTtlMin: 30,         // việc giao qua Telegram chưa giao được thì hết hạn sau số phút này
  tmuxDelivery: false,    // true = gõ việc vào phiên Claude Code ĐANG RẢNH qua tmux (cho VPS); xem lib/tmuxsend.js
  quiet: { enabled: false, start: "23:00", end: "08:00", days: [0, 1, 2, 3, 4, 5, 6] }, // giờ máy này; vượt trần tiền AI vẫn báo
};

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
// "7:30" và "07:30" đều được; giá trị hỏng thì dùng mặc định chứ không thành "không bao giờ yên lặng".
function parseHM(v, d) { const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(String(v == null ? "" : v)); return m ? Number(m[1]) * 60 + Number(m[2]) : d; }

// Gộp cấu hình người dùng + biến môi trường VPAO_TELEGRAM_TOKEN / VPAO_TELEGRAM_CHAT (ưu tiên hơn config.json).
function normalize(user, env = {}) {
  const u = user && typeof user === "object" ? user : {}, tg = u.telegram && typeof u.telegram === "object" ? u.telegram : {}, q = u.quiet && typeof u.quiet === "object" ? u.quiet : {};
  const token = String(env.VPAO_TELEGRAM_TOKEN || tg.botToken || "").trim(), chat = String(env.VPAO_TELEGRAM_CHAT || tg.chatId || "").trim();
  const days = Array.isArray(q.days) ? [...new Set(q.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : DEFAULTS.quiet.days;
  return {
    enabled: !!(token && chat), token, chat,
    dashboardUrl: /^https?:\/\//i.test(String(u.dashboardUrl || "")) ? String(u.dashboardUrl) : "",
    includeText: u.includeText !== false,
    blockedAfterMin: num(u.blockedAfterMin, DEFAULTS.blockedAfterMin, 0, 1440),
    cooldownMin: num(u.cooldownMin, DEFAULTS.cooldownMin, 1, 10080),
    maxPerHour: Math.round(num(u.maxPerHour, DEFAULTS.maxPerHour, 1, 600)),
    reportDone: u.reportDone !== false,
    reportGapSec: num(u.reportGapSec, DEFAULTS.reportGapSec, 0, 86400),
    inbound: u.inbound !== false,
    taskTtlMin: num(u.taskTtlMin, DEFAULTS.taskTtlMin, 1, 1440),
    tmuxDelivery: u.tmuxDelivery === true,
    allowedUserIds: Array.isArray(tg.allowedUserIds) ? tg.allowedUserIds.map(String).filter((x) => /^-?\d{1,20}$/.test(x)) : [],
    quiet: { enabled: q.enabled === true, start: parseHM(q.start, 23 * 60), end: parseHM(q.end, 8 * 60), days },
  };
}

// Giờ máy này đang trong khung yên lặng? Khung qua nửa đêm (23:00 → 08:00) tính ngày theo lúc BẮT ĐẦU khung.
function inQuiet(q, date) {
  if (!q || !q.enabled) return false;
  const m = date.getHours() * 60 + date.getMinutes(), day = date.getDay();
  if (q.start === q.end) return false;
  if (q.start < q.end) return m >= q.start && m < q.end && q.days.includes(day);
  if (m >= q.start) return q.days.includes(day);
  return m < q.end && q.days.includes((day + 6) % 7);
}

const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const plain = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Từ ảnh chụp trạng thái → danh sách cảnh báo ứng viên. `st` giữ nhớ giữa các lần gọi (phiên bị chặn từ bao giờ).
function collect(snap, cfg, st, t) {
  const out = [], nameOf = (k) => { const a = (snap.agents || []).find((x) => x.key === k); return a ? a.name : null; };
  const body = (s, fallback) => (cfg.includeText ? clip(plain(s), 200) || fallback : fallback);
  for (const it of snap.asks || []) {
    if (!it.exact || it.guess || it.answered) continue; // chỉ báo việc chắc chắn, không báo đoán
    const who = it.whoLabel || nameOf(it.who) || it.who || "Một phiên";
    out.push({ key: `ask|${it.kind}|${it.who}|${it.since}`, once: true, who: it.who || null, text: `${who} cần bạn: ${body(it.text, "mở văn phòng để xem")}` });
  }
  const blockedNow = new Set();
  for (const a of snap.agents || []) {
    if (a.flag !== "blocked") continue;
    blockedNow.add(a.key);
    const first = st.blockedSince.get(a.key) || t; st.blockedSince.set(a.key, first);
    if (t - first >= cfg.blockedAfterMin * 60000) out.push({ key: `blocked|${a.key}|${first}`, once: true, who: a.key, text: `${a.name} đang bị chặn${a.hook && a.hook.text ? ": " + body(a.hook.text, "") : ""}`.replace(/: $/, "") });
  }
  for (const k of [...st.blockedSince.keys()]) if (!blockedNow.has(k)) st.blockedSince.delete(k);
  if (cfg.reportDone) for (const a of snap.agents || []) {
    if (!a.lastDoneAt || a.key === "ceo") continue;
    const txt = cfg.includeText ? clip(plain(a.lastText), 300) : "";
    out.push({ key: `done|${a.key}|${a.lastDoneAt}`, once: true, who: a.key, report: true, text: `${a.name} xong lượt${txt ? `: ${txt}` : ""}` });
  }
  const m = snap.money;
  if (m && m.cap > 0 && Array.isArray(m.days) && m.days.length) {
    const d = m.days[m.days.length - 1], usd = d.usd || 0;
    if (usd >= m.cap) out.push({ key: `money100|${d.t}`, once: true, critical: true, text: `Tiền AI hôm nay đã chạm trần: $${usd.toFixed(2)} / $${m.cap}` });
    else if (usd >= m.cap * 0.8) out.push({ key: `money80|${d.t}`, once: true, text: `Tiền AI hôm nay đã qua 80% trần: $${usd.toFixed(2)} / $${m.cap}` });
  }
  for (const a of snap.alerts || []) if (a.level === "bad") out.push({ key: "alert|" + String(a.text).replace(/\d+/g, "#"), once: false, text: plain(a.text) });
  return out;
}

// ---- Telegram ----
// Lỗi không bao giờ chứa token (địa chỉ API có token trong đường dẫn nên phải lọc).
function scrub(msg, token) { return String(msg || "").split(token || "\u0000").join("‹token›").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot‹token›"); }
function telegramCall(token, method, params, { base = "https://api.telegram.org", timeoutMs = 8000 } = {}) {
  return new Promise((ok, bad) => {
    let u; try { u = new URL(`${base}/bot${token}/${method}`); } catch { return bad(new Error("địa chỉ Telegram không hợp lệ")); }
    const body = JSON.stringify(params || {}), lib = u.protocol === "http:" ? http : https;
    const req = lib.request({ protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: u.pathname, method: "POST", timeout: timeoutMs,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let b = ""; res.on("data", (c) => { if (b.length < 200000) b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch {} if (res.statusCode === 200 && j && j.ok) ok(j.result); else bad(new Error(scrub(`Telegram ${res.statusCode}: ${(j && j.description) || "không rõ"}`, token))); });
    });
    req.on("timeout", () => req.destroy(new Error("quá thời gian chờ")));
    req.on("error", (e) => bad(new Error(scrub(e.message, token))));
    req.end(body);
  });
}
const sendMessage = (cfg, text, opts) => telegramCall(cfg.token, "sendMessage", { chat_id: cfg.chat, text: clip(text, 4000), disable_web_page_preview: true }, opts);

// Tìm chat id: bạn nhắn bot một câu rồi gọi hàm này. Chỉ trả id + tên, không trả nội dung tin.
async function findChats(token, opts) {
  const ups = await telegramCall(token, "getUpdates", { limit: 100, timeout: 0 }, opts), seen = new Map();
  for (const u of ups || []) { const c = (u.message || u.channel_post || u.my_chat_member || {}).chat; if (c && c.id != null) seen.set(String(c.id), { id: String(c.id), type: c.type, name: c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "" }); }
  return [...seen.values()];
}

// ---- bộ gửi ----
function create({ cfg: user, env = process.env, title = "Văn phòng AI", mask = require("./mask").mask, now = Date.now, send, log = () => {} } = {}) {
  const cfg = normalize(user, env), sender = send || ((text) => sendMessage(cfg, text, env.VPAO_TELEGRAM_API ? { base: env.VPAO_TELEGRAM_API } : undefined)); // VPAO_TELEGRAM_API: chỉ để test
  const st = { blockedSince: new Map(), seen: new Map(), baselined: false, held: [], sent: [], retryAt: 0, busy: false, lastErrAt: 0, lastReport: new Map(), replyMap: new Map() };
  const head = `[${title}] `, tail = cfg.dashboardUrl ? `\n${cfg.dashboardUrl}` : "";
  const fmt = (text) => head + mask(text) + tail;

  // `who` = phiên mà tin này nói về; nhớ message_id để bạn trả lời thẳng vào tin đó mà giao việc cho đúng phiên.
  async function deliver(text, who) {
    const r = await sender(text); st.sent.push(now());
    if (who && r && r.message_id != null) { st.replyMap.set(r.message_id, who); if (st.replyMap.size > 500) st.replyMap.delete(st.replyMap.keys().next().value); }
  }
  const capacity = (t) => { st.sent = st.sent.filter((x) => t - x < 3600000); return cfg.maxPerHour - st.sent.length; };
  const bullets = (items) => items.slice(0, 6).map((a) => "• " + clip(mask(a.text), 140)).join("\n") + (items.length > 6 ? `\n… và ${items.length - 6} mục nữa` : "");

  // Một lượt kiểm tra. Trả số tin đã gửi (để test). Lần đầu chỉ ghi nhận hiện trạng, không gửi: khởi động lại không báo lại việc cũ.
  async function tick(snap) {
    if (!cfg.enabled || st.busy) return 0;
    const t = now(); if (t < st.retryAt) return 0;
    st.busy = true;
    const undelivered = new Map(); // key → mục chưa gửi được (để lượt sau thử lại)
    let digestItems = [];
    try {
      const fresh = [];
      for (const a of collect(snap, cfg, st, t)) {
        const last = st.seen.get(a.key);
        if (last != null && (a.once || t - last < cfg.cooldownMin * 60000)) continue;
        st.seen.set(a.key, t);
        if (a.report && st.baselined) { const lr = st.lastReport.get(a.who) || 0; if (t - lr < cfg.reportGapSec * 1000) continue; st.lastReport.set(a.who, t); } // cùng một người không báo xong lượt dày quá
        if (st.baselined) fresh.push(a);
      }
      if (st.seen.size > 2000) for (const [k, v] of st.seen) if (t - v > 7 * 86400000) st.seen.delete(k);
      if (!st.baselined) { st.baselined = true; return 0; }

      const quiet = inQuiet(cfg.quiet, new Date(t)), queue = [];
      for (const a of fresh) (quiet && !a.critical ? st.held : queue).push(a);
      if (st.held.length > 50) st.held.splice(0, st.held.length - 50);
      if (!quiet && st.held.length) { // hết giờ yên lặng / hết trần: tóm tắt những gì đã giữ
        digestItems = st.held.splice(0);
        queue.unshift({ digest: true, text: `${digestItems.length} cảnh báo đã giữ:\n${bullets(digestItems)}` });
      }
      for (const a of queue) if (a.key) undelivered.set(a.key, a);
      let n = 0;
      while (queue.length) {
        const room = capacity(t);
        if (room <= 0) { for (const a of queue.splice(0)) if (!a.digest) st.held.push(a); undelivered.clear(); if (digestItems.length) st.held.unshift(...digestItems); digestItems = []; break; } // hết trần giờ: giữ lại
        if (room === 1 && queue.length > 1) { // còn đúng 1 tin: gom phần còn lại
          const rest = queue.splice(0);
          await deliver(head + `${rest.length} cảnh báo mới:\n${bullets(rest)}` + tail); n++;
          for (const a of rest) if (a.key) undelivered.delete(a.key);
          digestItems = []; break;
        }
        const a = queue.shift();
        await deliver(a.digest ? head + a.text + tail : fmt(a.text), a.who); n++;
        if (a.key) undelivered.delete(a.key); else digestItems = [];
      }
      return n;
    } catch (e) {
      st.retryAt = now() + 60000; // thử lại sau 1 phút; mục chưa gửi được thì bỏ dấu "đã thấy", mục đã giữ trả về hàng giữ
      for (const k of undelivered.keys()) st.seen.delete(k);
      if (digestItems.length) st.held.unshift(...digestItems);
      if (now() - st.lastErrAt > 600000) { st.lastErrAt = now(); log(`Cảnh báo Telegram lỗi: ${scrub(e.message, cfg.token)}`); }
      return 0;
    } finally { st.busy = false; }
  }
  const apiOpts = env.VPAO_TELEGRAM_API ? { base: env.VPAO_TELEGRAM_API } : undefined;
  return { tick, cfg, enabled: cfg.enabled, state: st, send: (text) => sender(head + mask(text) + tail),
    // gửi một tin tức thì (không qua giờ yên lặng/chống lặp): dùng cho trả lời lệnh và thông báo đã giao việc
    notify: async (text, who) => { const r = await sender(head + mask(text) + tail); if (who && r && r.message_id != null) st.replyMap.set(r.message_id, who); return r; },
    call: (method, params, opts) => telegramCall(cfg.token, method, params, { ...(apiOpts || {}), ...(opts || {}) }),
    agentForMessage: (id) => st.replyMap.get(id) || null };
}

module.exports = { DEFAULTS, normalize, inQuiet, collect, telegramCall, sendMessage, findChats, create, scrub };
