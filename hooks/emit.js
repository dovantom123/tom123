#!/usr/bin/env node
// Hook của Claude Code → văn phòng. Claude Code đưa JSON sự kiện qua stdin; script này rút ra vài trường
// cần thiết (KHÔNG gửi nội dung lệnh, đường dẫn tệp hay kết quả tool) rồi POST tới máy chủ văn phòng
// trên 127.0.0.1 kèm token. Không bao giờ chặn Claude: mọi lỗi (máy chủ chưa chạy, JSON lạ…) đều thoát 0 trong im lặng
// và không in gì ra stdout, trừ đúng một trường hợp: máy chủ báo có việc giao từ xa cho phiên này (Telegram), khi đó in JSON
// quyết định để Claude làm tiếp (Stop) hoặc dừng (PreToolUse). stdout của hook được đưa vào ngữ cảnh của Claude nên không in gì khác.
"use strict";
const path = require("path");
const http = require("http");

const KEEP = ["hook_event_name", "session_id", "tool_name", "notification_type", "reason", "source"];
const MAX_STDIN = 8 * 1024 * 1024;

function slim(payload) {
  const out = {};
  for (const k of KEEP) if (typeof payload[k] === "string") out[k] = payload[k].slice(0, 80);
  if (typeof payload.message === "string") out.message = payload.message.slice(0, 300);
  if (typeof payload.error === "string") out.error = payload.error.slice(0, 200);
  return out;
}

function send(raw) {
  let payload; try { payload = JSON.parse(raw); } catch { return process.exit(0); }
  if (!payload || typeof payload !== "object") return process.exit(0);
  let ep;
  try {
    const { loadConfig } = require("../lib/config");
    const { readEndpoint } = require("../lib/netguard");
    const cfg = loadConfig(path.join(__dirname, ".."));
    ep = cfg && readEndpoint(path.join(cfg.dataDir, ".hook-endpoint.json"));
  } catch { return process.exit(0); }
  if (!ep) return process.exit(0);
  const body = JSON.stringify(slim(payload));
  const req = http.request({ host: "127.0.0.1", port: ep.port, path: "/hook", method: "POST", timeout: 1500,
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-VP-Token": ep.token } },
  (res) => {
    let b = ""; res.setEncoding("utf8"); res.on("data", (c) => { if (b.length < 20000) b += c; });
    res.on("end", () => {
      // Việc giao từ xa (Telegram): máy chủ chỉ trả JSON khi có việc đang chờ phiên NÀY. Đây là lần duy nhất script in ra stdout.
      try {
        const d = res.statusCode === 200 && JSON.parse(b).deliver;
        if (d && d.kind === "stop-block" && typeof d.text === "string") process.stdout.write(JSON.stringify({ decision: "block", reason: d.text }));
        else if (d && d.kind === "pretool-deny" && typeof d.text === "string") process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.text } }));
      } catch {}
      process.exit(0);
    });
  });
  req.on("error", () => process.exit(0));
  req.on("timeout", () => { req.destroy(); process.exit(0); });
  req.end(body);
}

let raw = "", size = 0;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { size += c.length; if (size <= MAX_STDIN) raw += c; });
process.stdin.on("end", () => { try { if (size <= MAX_STDIN) send(raw); else process.exit(0); } catch { process.exit(0); } });
process.stdin.on("error", () => process.exit(0));
setTimeout(() => process.exit(0), 3000).unref();
