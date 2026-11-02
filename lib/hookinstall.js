// Cài / gỡ hook Claude Code cho văn phòng trong settings.json. Phần JSON là hàm thuần (dễ test);
// phần tệp sao lưu trước khi ghi, từ chối tệp JSON hỏng, và không bao giờ đụng hook không phải của mình.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const MARK = "--vpao"; // đối số đánh dấu: lệnh có chứa hooks/emit.js và cờ này mới là của văn phòng
const EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PermissionRequest", "Notification", "Stop", "StopFailure", "SubagentStart", "SubagentStop"];
const NEEDS_MATCHER = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);

const isOurs = (cmd) => typeof cmd === "string" && /hooks[\\/]emit\.js/.test(cmd) && cmd.includes(MARK);
function commandFor(root) { return `node "${path.join(root, "hooks", "emit.js").split(path.sep).join("/")}" ${MARK}`; }
function settingsPath() { return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json"); }

// Thêm (hoặc trỏ lại) hook của văn phòng. Trả { settings, added, updated }.
function addHooks(settings, command) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  if (out.hooks == null) out.hooks = {};
  if (typeof out.hooks !== "object" || Array.isArray(out.hooks)) throw new Error('"hooks" trong settings.json không phải đối tượng');
  const added = [], updated = [];
  for (const ev of EVENTS) {
    if (out.hooks[ev] == null) out.hooks[ev] = [];
    if (!Array.isArray(out.hooks[ev])) throw new Error(`hooks.${ev} trong settings.json không phải mảng`);
    let found = false;
    for (const g of out.hooks[ev]) for (const h of Array.isArray(g && g.hooks) ? g.hooks : []) {
      if (isOurs(h.command)) { found = true; if (h.command !== command) { h.command = command; updated.push(ev); } }
    }
    if (!found) {
      const g = { hooks: [{ type: "command", command, timeout: 5 }] };
      if (NEEDS_MATCHER.has(ev)) g.matcher = "*";
      out.hooks[ev].push(g); added.push(ev);
    }
  }
  return { settings: out, added, updated };
}

// Gỡ mọi hook của văn phòng; nhóm/sự kiện rỗng thì xóa. Trả { settings, removed }.
function removeHooks(settings) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  let removed = 0;
  if (out.hooks && typeof out.hooks === "object") {
    for (const ev of Object.keys(out.hooks)) {
      if (!Array.isArray(out.hooks[ev])) continue;
      out.hooks[ev] = out.hooks[ev].filter((g) => {
        if (!g || !Array.isArray(g.hooks)) return true;
        const before = g.hooks.length;
        g.hooks = g.hooks.filter((h) => !isOurs(h && h.command));
        removed += before - g.hooks.length;
        return g.hooks.length > 0;
      });
      if (!out.hooks[ev].length) delete out.hooks[ev];
    }
    if (!Object.keys(out.hooks).length) delete out.hooks;
  }
  return { settings: out, removed };
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  try { const j = JSON.parse(text || "{}"); if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("không phải đối tượng JSON"); return j; }
  catch (e) { throw new Error(`${file} không phải JSON hợp lệ (${e.message}); không đổi gì`); }
}
function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) { // sao lưu dưới tên chưa dùng
    let bak = `${file}.vpao-bak-${Date.now()}`, n = 0; while (fs.existsSync(bak)) bak = `${file}.vpao-bak-${Date.now()}-${++n}`;
    fs.copyFileSync(file, bak);
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
}

function install(root, file = settingsPath()) {
  const r = addHooks(readSettings(file), commandFor(root));
  if (r.added.length || r.updated.length) writeSettings(file, r.settings);
  return { file, added: r.added, updated: r.updated };
}
function uninstall(file = settingsPath()) {
  if (!fs.existsSync(file)) return { file, removed: 0 };
  const r = removeHooks(readSettings(file));
  if (r.removed) writeSettings(file, r.settings);
  return { file, removed: r.removed };
}
function status(root, file = settingsPath()) {
  const cmd = commandFor(root), s = readSettings(file), have = [];
  for (const ev of EVENTS) for (const g of (s.hooks && Array.isArray(s.hooks[ev]) ? s.hooks[ev] : [])) for (const h of Array.isArray(g && g.hooks) ? g.hooks : []) if (isOurs(h.command)) have.push({ ev, current: h.command === cmd });
  return { file, installed: have.length, missing: EVENTS.filter((e) => !have.some((h) => h.ev === e)), stale: have.filter((h) => !h.current).map((h) => h.ev) };
}

module.exports = { EVENTS, MARK, isOurs, commandFor, settingsPath, addHooks, removeHooks, readSettings, install, uninstall, status };
