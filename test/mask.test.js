"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mask, maskDoc } = require("../lib/mask");

test("mask: che khóa dạng key=value", () => {
  assert.equal(mask("api_key=abc123xyz rest"), "api_key=‹ẩn› rest");
  assert.match(mask("Password: hunter2"), /Password=‹ẩn›/);
});
test("mask: che tiền tố khóa nổi tiếng", () => {
  for (const k of ["sk-ant-api03-abcdefghijklmnop", "ghp_abcdefghijklmnopqrstuv", "github_pat_11ABCDEFG0abcdefghijkl", "AKIAIOSFODNN7EXAMPLE", "AIzaSyA1234567890abcdefghij", "xoxb-1234567890-abcdefghij", "glpat-abcdefghijklmnopqrstu", "npm_abcdefghijklmnopqrstuvwx", "hf_abcdefghijklmnopqrstuv", "ghs_abcdefghijklmnopqrstuv", "ASIAIOSFODNN7EXAMPLE"])
    assert.ok(!mask(`dùng ${k} ở đây`).includes(k.slice(4)), k);
});
test("mask: che JWT, PEM, chuỗi kết nối, Bearer", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  assert.ok(!mask(`token ${jwt}`).includes("dozjgNryP4J3"));
  assert.match(mask("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"), /khóa riêng/);
  assert.equal(mask("postgres://admin:s3cretpw@db.local:5432/x"), "postgres://‹ẩn›@db.local:5432/x");
  assert.ok(!mask("Authorization: Bearer abcdefghijklmnop1234").includes("abcdefghijklmnop1234"));
  assert.ok(!mask("Authorization: Basic dXNlcjpwYXNzd29yZA==").includes("dXNlcjpwYXNzd29yZA"));
});
test("mask: không làm hỏng chữ thường", () => {
  const s = "Quản lý đã duyệt gói A, chạy npm run build xong, basic usage ổn.";
  assert.equal(mask(s), s);
  assert.equal(mask(""), ""); assert.equal(mask(null), "");
});
test("mask: gọn một dòng, bỏ dấu ** và `", () => {
  assert.equal(mask("**a**\n\n  `b`  c"), "a b c");
});
test("maskDoc: giữ xuống dòng, vẫn che khóa", () => {
  const out = maskDoc("# Tiêu đề\ntoken=abcd1234\n- ghp_abcdefghijklmnopqrstuv\n");
  assert.match(out, /^# Tiêu đề\ntoken=‹ẩn›\n- ‹khóa›\n$/);
});
