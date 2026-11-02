// Hàng đợi việc giao từ xa (Telegram) cho từng phiên Claude Code. Việc không bị đẩy vào phiên: nó nằm đây
// cho tới khi hook của chính phiên đó chạy (Stop → giao việc, PreToolUse → lệnh dừng), và HẾT HẠN nếu quá lâu,
// để một việc cũ không bất ngờ chạy lại hàng giờ sau. Thuần bộ nhớ, đồng hồ truyền vào được để test.
"use strict";

const MAX_PER_SESSION = 5;
const TYPES = new Set(["message", "stop"]);

function createCommandQueue({ now = Date.now, ttlMs = 30 * 60000 } = {}) {
  const q = new Map(); // sessionId -> [{ id, type, text, name, agentKey, at }]
  let seq = 1;

  function push(sessionId, { type = "message", text = "", name = "", agentKey = "" } = {}) {
    if (!sessionId || !TYPES.has(type)) return { ok: false, error: "yêu cầu không hợp lệ" };
    const list = (q.get(sessionId) || []).filter((c) => now() - c.at < ttlMs);
    if (list.length >= MAX_PER_SESSION) { q.set(sessionId, list); return { ok: false, error: `hàng chờ của phiên này đã đầy (${MAX_PER_SESSION} mục)` }; }
    const cmd = { id: seq++, type, text: String(text), name, agentKey, at: now() };
    list.push(cmd); q.set(sessionId, list);
    return { ok: true, cmd };
  }

  // Lấy (và xóa) mục cũ nhất thuộc loại `type` còn hạn; mục hết hạn bị bỏ lại cho sweep().
  function take(sessionId, type) {
    const list = q.get(sessionId); if (!list) return null;
    const i = list.findIndex((c) => c.type === type && now() - c.at < ttlMs);
    if (i < 0) return null;
    const [cmd] = list.splice(i, 1);
    if (!list.length) q.delete(sessionId);
    return cmd;
  }

  // Gỡ các mục hết hạn, trả về để báo lại cho chủ.
  function sweep() {
    const expired = [];
    for (const [sid, list] of q) {
      const keep = [];
      for (const c of list) (now() - c.at >= ttlMs ? expired : keep).push(c);
      if (keep.length) q.set(sid, keep); else q.delete(sid);
    }
    return expired;
  }

  const pending = (sessionId) => (q.get(sessionId) || []).filter((c) => now() - c.at < ttlMs).length;
  return { push, take, sweep, pending, ttlMs };
}

module.exports = { createCommandQueue, MAX_PER_SESSION };
