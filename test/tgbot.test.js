"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const tgbot = require("../lib/tgbot");

const AGENTS = [
  { key: "c-aaaa1111", name: "Kỹ sư Backend", platform: "claude", status: "active", lastText: "đã sửa xong", lastDoneAt: 1 },
  { key: "x-bbbb2222", name: "Kỹ sư Codex", platform: "codex", status: "idle" },
  { key: "c-cccc3333", name: "Kỹ sư Backend 2", platform: "claude", status: "idle" },
];
function make(cfg = {}, now = () => 1_700_000_000_000) {
  const said = [], giao = [], dung = [], logs = [];
  const bot = tgbot.create({ cfg: { chat: "42", ...cfg }, now, log: (m) => logs.push(m),
    call: async (method, p) => { if (method === "sendMessage") said.push(p.text); return {}; },
    ctx: { agents: () => AGENTS, asks: () => [{ exact: true, who: "c-aaaa1111", text: "duyệt?" }], giao: async (k, t) => { giao.push([k, t]); return { ok: true, msg: "ok " + k }; }, dung: async (k) => { dung.push(k); return { ok: true, msg: "dừng " + k }; }, agentForReply: (id) => (id === 7 ? "x-bbbb2222" : null) } });
  const send = (text, extra = {}, chat = { id: 42, type: "private" }) => bot.handle({ update_id: 1, message: { date: Math.floor(now() / 1000), chat, from: { id: chat.id }, text, ...extra } });
  return { bot, said, giao, dung, logs, send };
}

test("chỉ nhận đúng chat; người lạ bị bỏ qua và không được trả lời", async () => {
  const h = make();
  await h.send("/viec 1 x", {}, { id: 999, type: "private" });
  assert.deepEqual(h.giao, []); assert.deepEqual(h.said, []); assert.match(h.logs[0], /999/);
  await h.bot.handle({ update_id: 2, message: { date: 1_700_000_000, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "/viec 1 x" } });
  assert.deepEqual(h.giao, [], "chat riêng nhưng người gửi không phải chủ");
});
test("nhóm: cần allowedUserIds, và người gửi phải nằm trong đó", async () => {
  const g = { id: 42, type: "supergroup" };
  let h = make(); await h.send("/viec 1 x", {}, g); assert.deepEqual(h.giao, []); assert.match(h.logs[0], /allowedUserIds/);
  h = make({ allowedUserIds: ["42"] }); await h.bot.handle({ update_id: 1, message: { date: 1_700_000_000, chat: g, from: { id: 5 }, text: "/viec 1 x" } }); assert.deepEqual(h.giao, []);
  await h.bot.handle({ update_id: 2, message: { date: 1_700_000_000, chat: g, from: { id: 42 }, text: "/viec 1 x" } }); assert.equal(h.giao.length, 1);
});
test("/ds đánh số, /viec theo số và theo tên (không phân biệt dấu), /dung", async () => {
  const h = make();
  await h.send("/ds"); assert.match(h.said[0], /1\. Kỹ sư Backend \(Claude · đang làm\)/); assert.match(h.said[0], /2\. Kỹ sư Codex \(Codex · rảnh\)/);
  await h.send("/viec 2 sửa lỗi"); assert.deepEqual(h.giao.at(-1), ["x-bbbb2222", "sửa lỗi"]);
  await h.send("/viec Ky su Codex: làm B"); assert.deepEqual(h.giao.at(-1), ["x-bbbb2222", "làm B"]);
  await h.send("/viec codex làm C"); assert.deepEqual(h.giao.at(-1), ["x-bbbb2222", "làm C"]);
  await h.send("/viec@van_phong_bot 1 làm D"); assert.deepEqual(h.giao.at(-1), ["c-aaaa1111", "làm D"]);
  await h.send("Kỹ sư Backend 2: nhắn thẳng"); assert.deepEqual(h.giao.at(-1), ["c-cccc3333", "nhắn thẳng"]);
  await h.send("/dung 3"); assert.deepEqual(h.dung, ["c-cccc3333"]);
});
test("tên mơ hồ hoặc không có thì không giao", async () => {
  const h = make(); const n = h.giao.length;
  await h.send("/viec backend làm gì đó"); assert.match(h.said.at(-1), /2 người khớp/);
  await h.send("/viec 9 x"); assert.match(h.said.at(-1), /Không có người số 9/);
  await h.send("/viec không-ai: x"); assert.match(h.said.at(-1), /Không thấy/);
  await h.send("tin lung tung"); assert.match(h.said.at(-1), /Chưa rõ gửi cho ai/);
  assert.equal(h.giao.length, n);
});
test("trả lời vào tin cảnh báo thì giao đúng người", async () => {
  const h = make(); await h.send("làm tiếp nhé", { reply_to_message: { message_id: 7 } });
  assert.deepEqual(h.giao, [["x-bbbb2222", "làm tiếp nhé"]]);
});
test("tin chuyển tiếp, tin cũ, tin quá dài và tin dồn dập đều bị chặn", async () => {
  const h = make();
  await h.send("/viec 1 x", { forward_date: 1 }); await h.send("/viec 1 x", { date: 1_699_999_000 }); await h.send("/viec 1 " + "a".repeat(2100));
  assert.deepEqual(h.giao, []); assert.match(h.said[0], /chuyển tiếp/); assert.match(h.said.at(-1), /quá dài/);
  const r = make({ maxPerMin: 3 }); for (let i = 0; i < 6; i++) await r.send("/viec 1 việc " + i);
  assert.equal(r.giao.length, 3); assert.match(r.said.at(-1), /Quá 3 lệnh/);
});
test("/baocao, /cananh, /help", async () => {
  const h = make(); await h.send("/baocao"); assert.match(h.said[0], /Kỹ sư Backend — đang làm/); assert.match(h.said[0], /đã sửa xong/);
  await h.send("/cananh"); assert.match(h.said[1], /duyệt\?/); await h.send("/start"); assert.match(h.said[2], /\/viec/);
  await h.send("/lenh_la"); assert.match(h.said[3], /Không hiểu lệnh/);
});
