"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCommandQueue, MAX_PER_SESSION } = require("../lib/commandq");

test("push/take theo loại, theo thứ tự, mỗi mục giao một lần", () => {
  let t = 0; const q = createCommandQueue({ now: () => t, ttlMs: 1000 });
  q.push("s1", { type: "message", text: "a" }); q.push("s1", { type: "stop" }); q.push("s1", { type: "message", text: "b" });
  assert.equal(q.take("s1", "message").text, "a"); assert.equal(q.take("s1", "stop").type, "stop"); assert.equal(q.take("s1", "message").text, "b");
  assert.equal(q.take("s1", "message"), null); assert.equal(q.take("s2", "message"), null);
});
test("hết hạn: không giao nữa, sweep trả về để báo lại", () => {
  let t = 0; const q = createCommandQueue({ now: () => t, ttlMs: 1000 });
  q.push("s1", { type: "message", text: "cũ", name: "A" }); t = 1500;
  assert.equal(q.take("s1", "message"), null); assert.equal(q.pending("s1"), 0);
  const ex = q.sweep(); assert.equal(ex.length, 1); assert.equal(ex[0].name, "A"); assert.equal(q.sweep().length, 0);
});
test("giới hạn số mục mỗi phiên và từ chối đầu vào xấu", () => {
  const q = createCommandQueue();
  for (let i = 0; i < MAX_PER_SESSION; i++) assert.ok(q.push("s", { type: "message", text: "x" + i }).ok);
  assert.equal(q.push("s", { type: "message", text: "thừa" }).ok, false);
  assert.equal(q.push("", { type: "message" }).ok, false); assert.equal(q.push("s", { type: "rm -rf" }).ok, false);
});
