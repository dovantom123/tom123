"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const alerts = require("../lib/alerts");

const cfgOn = (extra = {}) => ({ telegram: { botToken: "123:ABC", chatId: "42" }, ...extra });
const snap = (o = {}) => ({ agents: [{ key: "c-1", name: "Kỹ sư A", flag: null }], asks: [], alerts: [], money: { cap: 100, days: [{ t: 1, usd: 0 }] }, ...o });
const ask = (o = {}) => ({ kind: "hoi", exact: true, who: "c-1", since: 111, text: "Chờ bạn duyệt quyền: Bash", ...o });

function harness(user, env = {}) {
  let t = new Date(2026, 0, 5, 12, 0).getTime(); const sent = [];
  const a = alerts.create({ cfg: user, env, title: "VP", now: () => t, send: async (x) => { if (a.fail) throw new Error("mạng hỏng"); sent.push(x); }, log: (m) => sent.logs = (sent.logs || []).concat(m) });
  return { a, sent, tick: (s) => a.tick(s), at: (h, m = 0) => { t = new Date(2026, 0, 5, h, m).getTime(); }, add: (ms) => { t += ms; }, now: () => t };
}

test("normalize: cần cả token và chatId; env thắng config; giá trị hỏng về mặc định", () => {
  assert.equal(alerts.normalize({}, {}).enabled, false);
  assert.equal(alerts.normalize({ telegram: { botToken: "t" } }, {}).enabled, false);
  assert.equal(alerts.normalize(cfgOn(), {}).enabled, true);
  const n = alerts.normalize(cfgOn(), { VPAO_TELEGRAM_TOKEN: "envtok", VPAO_TELEGRAM_CHAT: "99" });
  assert.equal(n.token, "envtok"); assert.equal(n.chat, "99");
  const q = alerts.normalize({ quiet: { enabled: true, start: "25:99", end: "x", days: [1, 9, "a"] }, maxPerHour: -5, dashboardUrl: "javascript:alert(1)" }).quiet;
  assert.equal(q.start, 23 * 60); assert.equal(q.end, 8 * 60); assert.deepEqual(q.days, [1]);
  assert.equal(alerts.normalize({ maxPerHour: -5 }).maxPerHour, 1); assert.equal(alerts.normalize({ dashboardUrl: "javascript:x" }).dashboardUrl, "");
});
test("inQuiet: khung qua nửa đêm, theo ngày bắt đầu khung", () => {
  const q = alerts.normalize({ quiet: { enabled: true, start: "23:00", end: "08:00", days: [1] } }).quiet; // chỉ đêm thứ Hai
  const at = (d, h, m = 0) => new Date(2026, 0, d, h, m); // 5/1/2026 là thứ Hai
  assert.ok(alerts.inQuiet(q, at(5, 23, 30))); assert.ok(alerts.inQuiet(q, at(6, 7, 59)));
  assert.ok(!alerts.inQuiet(q, at(6, 8, 0))); assert.ok(!alerts.inQuiet(q, at(5, 22, 59)));
  assert.ok(!alerts.inQuiet(q, at(6, 23, 30)), "đêm thứ Ba không nằm trong days");
  assert.ok(!alerts.inQuiet({ ...q, enabled: false }, at(5, 23, 30)));
});
test("lượt đầu chỉ ghi nhận hiện trạng; việc mới sau đó mới được gửi, đúng một lần", async () => {
  const h = harness(cfgOn());
  assert.equal(await h.tick(snap({ asks: [ask()] })), 0, "việc có sẵn lúc khởi động không báo");
  assert.equal(await h.tick(snap({ asks: [ask(), ask({ since: 222, text: "Duyệt kế hoạch" })] })), 1);
  assert.match(h.sent[0], /^\[VP\] Kỹ sư A cần bạn: Duyệt kế hoạch$/);
  assert.equal(await h.tick(snap({ asks: [ask({ since: 222, text: "Duyệt kế hoạch" })] })), 0);
});
test("không báo mục đoán hoặc đã trả lời; includeText=false thì không gửi nội dung; nội dung được che khóa", async () => {
  const h = harness(cfgOn()); await h.tick(snap());
  assert.equal(await h.tick(snap({ asks: [ask({ guess: true }), ask({ since: 2, answered: true }), ask({ since: 3, exact: false })] })), 0);
  await h.tick(snap({ asks: [ask({ since: 4, text: "dùng ghp_abcdefghijklmnopqrstuv nhé" })] }));
  assert.ok(!h.sent[0].includes("abcdefghijklmnopqrst"));
  const h2 = harness(cfgOn({ includeText: false })); await h2.tick(snap());
  await h2.tick(snap({ asks: [ask({ text: "bí mật công ty" })] }));
  assert.ok(!h2.sent[0].includes("bí mật")); assert.match(h2.sent[0], /Kỹ sư A cần bạn/);
});
test("phiên bị chặn chỉ báo sau blockedAfterMin, và một lần cho mỗi đợt chặn", async () => {
  const h = harness(cfgOn({ blockedAfterMin: 3 })); await h.tick(snap());
  const blocked = snap({ agents: [{ key: "c-1", name: "Kỹ sư A", flag: "blocked", hook: { text: "rate_limit" } }] });
  assert.equal(await h.tick(blocked), 0); h.add(2 * 60000); assert.equal(await h.tick(blocked), 0);
  h.add(61000); assert.equal(await h.tick(blocked), 1); assert.match(h.sent[0], /Kỹ sư A đang bị chặn: rate_limit/);
  h.add(60000); assert.equal(await h.tick(blocked), 0);
  await h.tick(snap()); h.add(60000); await h.tick(blocked); h.add(4 * 60000); assert.equal(await h.tick(blocked), 1, "đợt chặn mới báo lại");
});
test("tiền AI: báo ở 80% và 100% mỗi ngày một lần; cảnh báo hệ thống có thời gian nghỉ", async () => {
  const h = harness(cfgOn()); await h.tick(snap());
  const money = (usd) => snap({ money: { cap: 100, days: [{ t: 7, usd }] } });
  assert.equal(await h.tick(money(79)), 0); assert.equal(await h.tick(money(81)), 1); assert.equal(await h.tick(money(85)), 0);
  assert.equal(await h.tick(money(100)), 1); assert.match(h.sent.at(-1), /chạm trần/);
  const sys = snap({ alerts: [{ level: "bad", text: "DEV trống 17 phút" }, { level: "warn", text: "chỉ cảnh báo vàng" }] });
  assert.equal(await h.tick(sys), 1); h.add(30 * 60000); assert.equal(await h.tick(snap({ alerts: [{ level: "bad", text: "DEV trống 47 phút" }] })), 0, "cùng một sự cố, số phút khác");
  h.add(31 * 60000); assert.equal(await h.tick(snap({ alerts: [{ level: "bad", text: "DEV trống 78 phút" }] })), 1, "hết thời gian nghỉ thì nhắc lại");
});
test("giờ yên lặng: giữ lại rồi gửi một tin tóm tắt; vượt trần tiền AI vẫn báo", async () => {
  const h = harness(cfgOn({ quiet: { enabled: true, start: "23:00", end: "08:00" } }));
  h.at(23, 30); await h.tick(snap());
  assert.equal(await h.tick(snap({ asks: [ask({ since: 1 }), ask({ since: 2, text: "Câu hai" })] })), 0);
  assert.equal(await h.tick(snap({ asks: [ask({ since: 1 }), ask({ since: 2 })], money: { cap: 10, days: [{ t: 1, usd: 12 }] } })), 1);
  assert.match(h.sent[0], /chạm trần/);
  h.at(8, 1); assert.equal(await h.tick(snap()), 1);
  assert.match(h.sent[1], /2 cảnh báo đã giữ/); assert.match(h.sent[1], /Câu hai/);
  assert.equal(await h.tick(snap()), 0);
});
test("trần số tin mỗi giờ: tin cuối gom lại, quá trần thì giữ cho lượt sau", async () => {
  const h = harness(cfgOn({ maxPerHour: 3 })); await h.tick(snap());
  const asks = (n) => Array.from({ length: n }, (_, i) => ask({ since: 100 + i, text: "việc " + i }));
  assert.equal(await h.tick(snap({ asks: asks(6) })), 3);
  assert.match(h.sent[2], /4 cảnh báo mới/, "tin thứ 3 gom phần còn lại");
  h.add(30 * 60000); await h.tick(snap({ asks: asks(6).concat(ask({ since: 999, text: "thêm" })) })); // vẫn trong giờ → giữ
  assert.equal(h.sent.length, 3);
  h.add(31 * 60000); assert.equal(await h.tick(snap({ asks: asks(6).concat(ask({ since: 999 })) })), 1);
  assert.match(h.sent[3], /cảnh báo đã giữ/);
});
test("gửi lỗi: không mất cảnh báo, thử lại sau 1 phút, log không lộ token", async () => {
  const h = harness(cfgOn()); await h.tick(snap());
  h.a.fail = true; const s = snap({ asks: [ask({ since: 5 })] });
  assert.equal(await h.tick(s), 0); assert.equal(h.sent.length, 0);
  h.add(10000); assert.equal(await h.tick(s), 0, "chưa tới 1 phút");
  h.a.fail = false; h.add(61000); assert.equal(await h.tick(s), 1);
});
test("telegram: gọi đúng API, lỗi không chứa token", async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got.push({ url: req.url, body: JSON.parse(b || "{}") }); if (req.url.includes("botbad")) { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, description: "Unauthorized " + "bot123:SECRET" })); }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, result: req.url.endsWith("getUpdates") ? [{ message: { chat: { id: 7, type: "private", first_name: "An" }, text: "xin chào riêng tư" } }] : {} })); }); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok)); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    await alerts.sendMessage({ token: "123:ABC", chat: "42" }, "xin chào", { base });
    assert.equal(got[0].url, "/bot123:ABC/sendMessage"); assert.equal(got[0].body.chat_id, "42"); assert.equal(got[0].body.text, "xin chào"); assert.equal(got[0].body.disable_web_page_preview, true);
    const chats = await alerts.findChats("123:ABC", { base }); assert.deepEqual(chats, [{ id: "7", type: "private", name: "An" }]); assert.ok(!JSON.stringify(chats).includes("riêng tư"));
    await assert.rejects(alerts.telegramCall("bad", "sendMessage", {}, { base }), (e) => { assert.ok(!e.message.includes("SECRET")); assert.ok(!e.message.includes("bad:")); return /401/.test(e.message); });
    await assert.rejects(alerts.telegramCall("123:ABC", "x", {}, { base: "http://127.0.0.1:1" }), (e) => !e.message.includes("123:ABC"));
  } finally { srv.close(); }
});

test("báo xong lượt: một lần cho mỗi lượt, có khoảng nghỉ, includeText=false thì không kèm nội dung", async () => {
  const agent = (done, text = "đã sửa xong lỗi đăng nhập") => snap({ agents: [{ key: "c-1", name: "Kỹ sư A", flag: null, lastDoneAt: done, lastText: text }] });
  const h = harness(cfgOn({ reportGapSec: 120 })); await h.tick(agent(1000));
  assert.equal(await h.tick(agent(1000)), 0, "lượt có sẵn lúc khởi động không báo");
  assert.equal(await h.tick(agent(2000)), 1); assert.match(h.sent[0], /Kỹ sư A xong lượt: đã sửa xong lỗi đăng nhập/);
  assert.equal(await h.tick(agent(2000)), 0, "không báo lặp");
  h.add(30000); assert.equal(await h.tick(agent(3000)), 0, "trong khoảng nghỉ");
  h.add(121000); assert.equal(await h.tick(agent(4000)), 1);
  const off = harness(cfgOn({ includeText: false, reportGapSec: 0 })); await off.tick(agent(1));
  await off.tick(agent(2)); assert.match(off.sent[0], /Kỹ sư A xong lượt$/);
  const none = harness(cfgOn({ reportDone: false })); await none.tick(agent(1)); assert.equal(await none.tick(agent(2)), 0);
});
test("nhớ tin cảnh báo nào nói về phiên nào để trả lời giao việc đúng người", async () => {
  let id = 100; const sent = [];
  const a = alerts.create({ cfg: cfgOn(), title: "VP", send: async (t) => { sent.push(t); return { message_id: ++id }; } });
  await a.tick(snap()); await a.tick(snap({ asks: [ask({ who: "c-1" })] }));
  assert.equal(a.agentForMessage(101), "c-1"); assert.equal(a.agentForMessage(999), null);
  const r = await a.notify("Đã giao việc", "c-1"); assert.equal(a.agentForMessage(r.message_id), "c-1");
});
test("normalize: allowedUserIds chỉ nhận số, inbound/reportDone mặc định bật", () => {
  const n = alerts.normalize({ telegram: { botToken: "t", chatId: "1", allowedUserIds: [5, "-100", "x", "9 9"] } });
  assert.deepEqual(n.allowedUserIds, ["5", "-100"]); assert.equal(n.inbound, true); assert.equal(n.reportDone, true);
  assert.equal(alerts.normalize({ inbound: false, reportDone: false }).inbound, false);
});
