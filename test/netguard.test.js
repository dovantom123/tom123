"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const ng = require("../lib/netguard");

test("isLoopbackBind", () => {
  for (const h of ["127.0.0.1", "localhost", "LOCALHOST", "[::1]"]) assert.ok(ng.isLoopbackBind(h), h);
  for (const h of ["0.0.0.0", "192.168.1.5", "::", "", undefined, "example.com"]) assert.ok(!ng.isLoopbackBind(h), String(h));
});
test("hostAllowed chống DNS rebinding", () => {
  for (const h of ["localhost", "localhost:7788", "127.0.0.1:7788", "[::1]:7788", "LocalHost"]) assert.ok(ng.hostAllowed(h), h);
  for (const h of ["evil.com", "evil.com:7788", "127.0.0.1.evil.com", "localhost.evil.com", "", undefined, "127.0.0.1:99999999", "a b"]) assert.ok(!ng.hostAllowed(h), String(h));
});
test("isDirectLocal: loopback không qua proxy", () => {
  const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers });
  assert.ok(ng.isDirectLocal(req("127.0.0.1"))); assert.ok(ng.isDirectLocal(req("::1"))); assert.ok(ng.isDirectLocal(req("::ffff:127.0.0.1")));
  assert.ok(!ng.isDirectLocal(req("192.168.1.9")));
  assert.ok(!ng.isDirectLocal(req("127.0.0.1", { "cf-ray": "x" })));
  assert.ok(!ng.isDirectLocal(req("127.0.0.1", { "x-forwarded-for": "1.2.3.4" })));
});
test("safeEqual", () => {
  assert.ok(ng.safeEqual("abc", "abc")); assert.ok(!ng.safeEqual("abc", "abd")); assert.ok(!ng.safeEqual("abc", "abcd"));
  assert.ok(!ng.safeEqual(undefined, "x")); assert.ok(ng.safeEqual("", ""));
});
test("createLimiter: chặn sau max lần, hết hạn, reset", () => {
  let t = 0; const l = ng.createLimiter({ max: 3, windowMs: 1000, now: () => t });
  l.fail("a"); l.fail("a"); assert.ok(!l.blocked("a")); l.fail("a"); assert.ok(l.blocked("a")); assert.ok(!l.blocked("b"));
  t = 1001; assert.ok(!l.blocked("a"));
  l.fail("a"); l.fail("a"); l.fail("a"); assert.ok(l.blocked("a")); l.reset("a"); assert.ok(!l.blocked("a"));
});
test("writeEndpoint: giữ token cũ, quyền 0600, readEndpoint đọc lại", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vpao-ng-")), f = path.join(dir, "d", ".hook-endpoint.json");
  const t1 = ng.writeEndpoint(f, 1234), t2 = ng.writeEndpoint(f, 5678);
  assert.equal(t1, t2); assert.match(t1, /^[0-9a-f]{48}$/);
  assert.deepEqual(ng.readEndpoint(f), { port: 5678, token: t1 });
  if (process.platform !== "win32") assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  fs.writeFileSync(f, "{hỏng"); assert.equal(ng.readEndpoint(f), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
