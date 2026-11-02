"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const hi = require("../lib/hookinstall");

const ROOT = path.join(os.tmpdir(), "vpao-root");
const CMD = hi.commandFor(ROOT);
const other = { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/x/hooks/emit.js" }] }] }, theme: "dark" };

test("addHooks thêm đủ sự kiện, giữ hook và cấu hình của người khác", () => {
  const r = hi.addHooks(other, CMD);
  assert.deepEqual(r.added.sort(), [...hi.EVENTS].sort());
  assert.equal(r.settings.theme, "dark");
  assert.equal(r.settings.hooks.Stop.length, 2); assert.equal(r.settings.hooks.Stop[0].hooks[0].command, "echo hi");
  const pre = r.settings.hooks.PreToolUse; assert.equal(pre[0].hooks[0].command, "/x/hooks/emit.js"); // hook lạ trùng tên file không bị coi là của mình
  assert.equal(pre[1].matcher, "*");
  assert.equal(other.hooks.Stop.length, 1, "không sửa đối tượng gốc");
});
test("addHooks chạy lại không nhân đôi, trỏ lại khi đổi nơi cài", () => {
  const once = hi.addHooks({}, CMD).settings;
  const again = hi.addHooks(once, CMD); assert.deepEqual(again.added, []); assert.deepEqual(again.updated, []);
  const moved = hi.addHooks(once, hi.commandFor(path.join(os.tmpdir(), "elsewhere")));
  assert.equal(moved.updated.length, hi.EVENTS.length); assert.equal(moved.settings.hooks.Stop.length, 1);
});
test("removeHooks gỡ đúng của mình và dọn rỗng", () => {
  const withOurs = hi.addHooks(other, CMD).settings;
  const r = hi.removeHooks(withOurs);
  assert.equal(r.removed, hi.EVENTS.length);
  assert.deepEqual(r.settings, other);
  assert.deepEqual(hi.removeHooks(hi.addHooks({}, CMD).settings).settings, {});
});
test("addHooks báo lỗi khi hooks sai kiểu", () => {
  assert.throws(() => hi.addHooks({ hooks: [] }, CMD), /không phải đối tượng/);
  assert.throws(() => hi.addHooks({ hooks: { Stop: {} } }, CMD), /không phải mảng/);
});
test("install/uninstall trên tệp: sao lưu, từ chối JSON hỏng", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-hi-")), f = path.join(dir, "settings.json");
  fs.writeFileSync(f, JSON.stringify(other));
  const r = hi.install(ROOT, f); assert.equal(r.added.length, hi.EVENTS.length);
  assert.equal(fs.readdirSync(dir).filter((x) => x.includes("vpao-bak")).length, 1);
  assert.equal(hi.status(ROOT, f).installed, hi.EVENTS.length);
  assert.equal(hi.install(ROOT, f).added.length, 0);
  assert.equal(hi.uninstall(f).removed, hi.EVENTS.length);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, "utf8")), other);
  fs.writeFileSync(f, "{ hỏng");
  assert.throws(() => hi.install(ROOT, f), /không phải JSON hợp lệ/);
  assert.equal(fs.readFileSync(f, "utf8"), "{ hỏng", "không đổi gì");
  fs.rmSync(dir, { recursive: true, force: true });
});
