"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { send, clean } = require("../lib/tmuxsend");

function fake(paneOut) {
  const calls = [];
  return { calls, exec: async (file, args) => { calls.push([file, ...args]); if (args.includes("display-message")) return paneOut + "\n"; return ""; } };
}
test("clean: một dòng, bỏ ký tự điều khiển, cắt độ dài", () => {
  assert.equal(clean("a\nb\r\nc\u001b[31md\t e"), "a b c [31md e");
  assert.equal(clean(null), ""); assert.equal(clean("x".repeat(5000)).length, 2000);
});
test("send: kiểm tra pane, xóa dòng, gõ nguyên văn bằng -l, rồi Enter; không qua shell", async () => {
  const f = fake("%3"); const slept = [];
  const r = await send({ socket: "/tmp/tmux-1000/default", pane: "%3", text: "làm việc $(rm -rf /); `id` \n dòng hai", exec: f.exec, sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(f.calls.map((c) => c.slice(3)), [["display-message", "-p", "-t", "%3", "#{pane_id}"], ["send-keys", "-t", "%3", "C-u"], ["send-keys", "-t", "%3", "-l", "--", "làm việc $(rm -rf /); `id` dòng hai"], ["send-keys", "-t", "%3", "Enter"]]);
  assert.ok(f.calls.every((c) => c[0] === "tmux" && c[1] === "-S" && c[2] === "/tmp/tmux-1000/default")); assert.deepEqual(slept, [150]);
});
test("send: từ chối pane/socket xấu, pane đã mất, nội dung trống; không gọi gì", async () => {
  const f = fake("%9");
  for (const pane of ["", "3", "%3; id", "%3 -t %4", undefined]) assert.equal((await send({ pane, text: "x", exec: f.exec })).ok, false);
  assert.equal((await send({ pane: "%3", socket: "/tmp/x; id", text: "x", exec: f.exec })).ok, false);
  assert.equal((await send({ pane: "%3", text: " \n\u0007 ", exec: f.exec })).ok, false);
  assert.equal(f.calls.length, 0);
  const gone = await send({ pane: "%3", text: "x", exec: f.exec, sleep: async () => {} }); assert.equal(gone.ok, false); assert.match(gone.error, /không còn/);
  assert.equal(f.calls.length, 1, "dừng ngay sau khi thấy pane không còn");
});
test("send: chưa cài tmux hoặc lỗi thì báo rõ, không ném lỗi", async () => {
  const enoent = async () => { const e = new Error("spawn tmux ENOENT"); e.code = "ENOENT"; throw e; };
  assert.match((await send({ pane: "%1", text: "x", exec: enoent })).error, /chưa cài tmux/);
  assert.match((await send({ pane: "%1", text: "x", exec: async () => { throw new Error("boom\nxx"); } })).error, /tmux lỗi: boom/);
});

test("tmux thật (bỏ qua nếu máy chưa có tmux): chữ vào nguyên văn, không bị shell diễn giải, Enter được nhấn", { skip: process.platform === "win32" || require("node:child_process").spawnSync("tmux", ["-V"]).status !== 0 }, async () => {
  const { spawnSync } = require("node:child_process"), name = "vpao-test-" + process.pid;
  spawnSync("tmux", ["new-session", "-d", "-s", name, "-x", "120", "-y", "20", "sh -c 'while read -r l; do echo GOT:$l; done'"]);
  try {
    await new Promise((ok) => setTimeout(ok, 400));
    const pane = spawnSync("tmux", ["list-panes", "-t", name, "-F", "#{pane_id}"]).stdout.toString().trim();
    const socket = spawnSync("tmux", ["display-message", "-p", "-t", name, "#{socket_path}"]).stdout.toString().trim();
    assert.deepEqual(await send({ socket, pane, text: "a $(echo HACK) `id` ; rm -rf /\nb" }), { ok: true });
    await new Promise((ok) => setTimeout(ok, 400));
    const screen = spawnSync("tmux", ["capture-pane", "-p", "-t", name]).stdout.toString();
    assert.match(screen, /GOT:a \$\(echo HACK\) `id` ; rm -rf \/ b/);
    assert.equal((await send({ socket, pane: "%9999", text: "x" })).ok, false);
  } finally { spawnSync("tmux", ["kill-session", "-t", name]); }
});
