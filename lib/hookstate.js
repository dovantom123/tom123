// Trạng thái phiên Claude Code lấy từ hook (chính xác hơn đoán qua nhật ký).
// Thuần bộ nhớ: nhận sự kiện đã rút gọn từ hooks/emit.js, trả trạng thái cho từng phiên.
//
// Pha (phase):
//   working  đang chạy lượt (prompt, tool…)
//   waiting  chờ người: hộp xin quyền, hộp hỏi (Notification/PermissionRequest)
//   idle     xong lượt hoặc phiên vừa mở, đang chờ lệnh
//   error    lượt kết thúc vì lỗi API (StopFailure)
//   ended    phiên đã thoát (SessionEnd)
// Trạng thái quá cũ thì view() trả null để máy chủ quay về cách đọc nhật ký.
"use strict";

const WAIT_TYPE = /permission|elicitation|needs_input|approval/i;
const STALE_MS = { working: 30 * 60000, waiting: 24 * 3600000, idle: 6 * 3600000, error: 6 * 3600000, ended: 3600000 };
const MAX_SESSIONS = 500;
const SID = /^[A-Za-z0-9_-]{8,80}$/;
const PANE = /^%\d{1,6}$/, SOCK = /^\/[A-Za-z0-9._/-]{1,200}$/;
const EVENTS = new Set(["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PermissionRequest", "Notification", "Stop", "StopFailure", "SubagentStart", "SubagentStop"]);

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

function createHookState({ now = Date.now, mask = (s) => s } = {}) {
  const sessions = new Map(); // session_id -> { phase, since, last, text, tool, subagents, source }

  function ingest(raw) {
    if (!raw || typeof raw !== "object") return null;
    const ev = str(raw.hook_event_name, 40), sid = str(raw.session_id, 80);
    if (!EVENTS.has(ev) || !SID.test(sid)) return null;
    const t = now();
    let s = sessions.get(sid);
    if (!s) {
      s = { phase: "idle", since: t, last: t, text: "", tool: "", subagents: 0 };
      sessions.set(sid, s);
      if (sessions.size > MAX_SESSIONS) { // bỏ phiên cập nhật lâu nhất
        let oldest = null; for (const [k, v] of sessions) if (!oldest || v.last < sessions.get(oldest).last) oldest = k;
        if (oldest && oldest !== sid) sessions.delete(oldest);
      }
    }
    s.last = t;
    if (PANE.test(str(raw.tmux_pane, 12))) s.pane = raw.tmux_pane;           // phiên chạy trong tmux (VPS): nhớ để gõ việc vào khi phiên rảnh
    if (SOCK.test(str(raw.tmux_socket, 200))) s.socket = raw.tmux_socket;
    const to = (phase, text = "") => { if (s.phase !== phase) s.since = t; s.phase = phase; s.text = text; };
    switch (ev) {
      case "SessionStart": s.subagents = 0; s.tool = ""; to("idle"); break;
      case "UserPromptSubmit": to("working"); break;
      case "PreToolUse": case "PostToolUse": case "PostToolUseFailure":
        s.tool = str(raw.tool_name, 60); to("working"); break; // một tool chạy tiếp nghĩa là hộp xin quyền đã được trả lời
      case "PermissionRequest": {
        const tool = str(raw.tool_name, 60);
        to("waiting", mask(tool ? `Chờ bạn duyệt quyền: ${tool}` : "Chờ bạn duyệt quyền"));
        break;
      }
      case "Notification": {
        const type = str(raw.notification_type, 60), msg = mask(str(raw.message, 300));
        if (WAIT_TYPE.test(type)) to("waiting", msg || "Chờ bạn trả lời");
        else if (/idle/i.test(type) && s.phase !== "waiting") to("idle");
        break;
      }
      case "Stop": s.subagents = 0; s.doneAt = t; to("idle"); break;
      case "StopFailure": to("error", mask(str(raw.error, 200)) || "Lượt kết thúc vì lỗi"); break;
      case "SubagentStart": s.subagents++; if (s.phase !== "waiting") to("working"); break;
      case "SubagentStop": s.subagents = Math.max(0, s.subagents - 1); break;
      case "SessionEnd": s.subagents = 0; to("ended", mask(str(raw.reason, 60))); break;
    }
    return { sid, phase: s.phase };
  }

  // Trạng thái hiện tại của một phiên, hoặc null nếu chưa có / đã cũ quá.
  function view(sid, t = now()) {
    const s = sessions.get(sid);
    if (!s) return null;
    if (t - s.last > (STALE_MS[s.phase] || STALE_MS.working)) return null;
    return { phase: s.phase, since: s.since, last: s.last, text: s.text, tool: s.tool, subagents: s.subagents, doneAt: s.doneAt || 0 };
  }

  // Như view() nhưng không bỏ trạng thái cũ: phiên rảnh nhiều giờ trên VPS vẫn cần biết pane tmux của nó.
  function lastKnown(sid) {
    const s = sessions.get(sid);
    return s ? { phase: s.phase, last: s.last, doneAt: s.doneAt || 0, pane: s.pane || "", socket: s.socket || "" } : null;
  }

  return { ingest, view, lastKnown, size: () => sessions.size };
}

module.exports = { createHookState, EVENTS };
