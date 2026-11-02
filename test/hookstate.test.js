"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHookState } = require("../lib/hookstate");

const SID = "11111111-aaaa-bbbb-cccc-222222222222";
function make() { let t = 1000000; const hs = createHookState({ now: () => t }); return { hs, tick: (ms) => { t += ms; }, at: () => t }; }
const ev = (hook_event_name, extra = {}) => ({ hook_event_name, session_id: SID, ...extra });

test("vòng đời cơ bản: mở → làm → xong → thoát", () => {
  const { hs } = make();
  hs.ingest(ev("SessionStart", { source: "startup" })); assert.equal(hs.view(SID).phase, "idle");
  hs.ingest(ev("UserPromptSubmit")); assert.equal(hs.view(SID).phase, "working");
  hs.ingest(ev("PreToolUse", { tool_name: "Bash" })); assert.equal(hs.view(SID).tool, "Bash");
  hs.ingest(ev("Stop")); assert.equal(hs.view(SID).phase, "idle");
  hs.ingest(ev("SessionEnd", { reason: "other" })); assert.equal(hs.view(SID).phase, "ended");
});
test("xin quyền → waiting; tool chạy tiếp → hết chờ", () => {
  const { hs } = make();
  hs.ingest(ev("PermissionRequest", { tool_name: "Bash" }));
  const w = hs.view(SID); assert.equal(w.phase, "waiting"); assert.match(w.text, /Bash/);
  hs.ingest(ev("PostToolUse", { tool_name: "Bash" })); assert.equal(hs.view(SID).phase, "working");
});
test("Notification: permission_prompt chờ người, idle_prompt thì không đè lên waiting", () => {
  const { hs } = make();
  hs.ingest(ev("Notification", { notification_type: "permission_prompt", message: "Claude needs your permission to use Bash" }));
  assert.equal(hs.view(SID).phase, "waiting");
  hs.ingest(ev("Notification", { notification_type: "idle_prompt" })); assert.equal(hs.view(SID).phase, "waiting");
  hs.ingest(ev("Stop")); hs.ingest(ev("Notification", { notification_type: "idle_prompt" })); assert.equal(hs.view(SID).phase, "idle");
});
test("StopFailure → error, UserPromptSubmit làm lại", () => {
  const { hs } = make();
  hs.ingest(ev("StopFailure", { error: "rate_limit" })); const e = hs.view(SID); assert.equal(e.phase, "error"); assert.match(e.text, /rate_limit/);
  hs.ingest(ev("UserPromptSubmit")); assert.equal(hs.view(SID).phase, "working");
});
test("subagent đếm cộng/trừ, không âm, Stop về 0", () => {
  const { hs } = make();
  hs.ingest(ev("SubagentStart")); hs.ingest(ev("SubagentStart")); assert.equal(hs.view(SID).subagents, 2);
  hs.ingest(ev("SubagentStop")); hs.ingest(ev("SubagentStop")); hs.ingest(ev("SubagentStop")); assert.equal(hs.view(SID).subagents, 0);
  hs.ingest(ev("SubagentStart")); hs.ingest(ev("Stop")); assert.equal(hs.view(SID).subagents, 0);
});
test("trạng thái cũ quá thì view = null (quay về nhật ký)", () => {
  const { hs, tick } = make();
  hs.ingest(ev("UserPromptSubmit")); tick(31 * 60000); assert.equal(hs.view(SID), null);
  hs.ingest(ev("PermissionRequest")); tick(60 * 60000); assert.equal(hs.view(SID).phase, "waiting"); // chờ người sống lâu hơn
});
test("từ chối đầu vào xấu", () => {
  const { hs } = make();
  for (const bad of [null, "x", [], {}, { hook_event_name: "Nope", session_id: SID }, { hook_event_name: "Stop" }, { hook_event_name: "Stop", session_id: "../etc" }, { hook_event_name: "Stop", session_id: 5 }])
    assert.equal(hs.ingest(bad), null);
  assert.equal(hs.size(), 0);
});
test("che bí mật trong thông báo và giới hạn số phiên", () => {
  let t = 1; const hs = createHookState({ now: () => t++, mask: (s) => s.replace(/ghp_\w+/g, "‹khóa›") });
  hs.ingest(ev("Notification", { notification_type: "elicitation", message: "dùng ghp_abcdefghijklmnop" }));
  assert.equal(hs.view(SID).text, "dùng ‹khóa›");
  for (let i = 0; i < 600; i++) hs.ingest({ hook_event_name: "Stop", session_id: "sess-" + String(i).padStart(6, "0") });
  assert.ok(hs.size() <= 500);
});
