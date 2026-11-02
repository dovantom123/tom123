# Văn phòng ảo 3D cho đội AI

Biến các phiên **Claude Code** và **Codex** trên máy bạn thành một công ty AI 3D sống động, kèm đủ bộ sổ điều phối như một đội thật: việc ưu tiên, gói việc, hòm thư, lượt DEV, sổ "Cần anh", nội quy, đội ngũ, bài học, đánh giá nhân sự và tiền AI.

Mỗi phiên là một nhân viên robot có bàn riêng:
- đang làm thì gõ phím, xong việc thì báo cáo;
- phiên này nhắn phiên kia thì robot đi sang bàn người nhận;
- bạn giao việc thì cả nhóm ra phòng họp;
- ai đang giữ môi trường DEV thì đứng giữa Phòng DEV, ai đang chờ thì xếp hàng.

> **Chỉ đọc, chạy tại máy bạn.** Văn phòng chỉ đọc nhật ký mà Claude Code và Codex vốn tự ghi (`~/.claude`, `~/.codex`) và sổ của đội trong thư mục `data/`. Mặc định nó không gửi dữ liệu đi đâu và không cần khóa API (chỉ khi bạn tự bật cảnh báo Telegram thì mới có tin ngắn gửi tới Telegram, xem mục dưới). Mọi chuỗi giống khóa đều được che trước khi hiện. Kho không dùng thư viện ngoài nào, nên không cần `npm install`.
>
> Có thể cài thêm **hook Claude Code** (tùy chọn, xem mục dưới) để trạng thái "đang làm / chờ bạn duyệt / lỗi" chính xác thay vì đoán qua nhật ký. Hook chỉ gửi vài trường tối thiểu về chính máy bạn (127.0.0.1), không gửi nội dung lệnh hay tệp.

---

## Cách nhanh nhất: gửi link này cho agent của bạn

Mở Claude Code hoặc Codex **trong thư mục dự án của bạn** và gõ:

> Cài văn phòng ảo cho dự án này theo hướng dẫn ở https://github.com/vinaichatbot-rgb/van-phong-ao-3d (đọc file HUONG-DAN-CHO-AGENT.md)

Agent sẽ tự làm các bước sau. Những bước có thay đổi bên ngoài thì nó sẽ hỏi bạn trước:

1. Kiểm tra Node.js.
2. Tải mã về.
3. Cài đặt.
4. Chạy và tự kiểm.
5. Hỏi bạn rồi mới dán luật đội vào `AGENTS.md` / `CLAUDE.md`, để mọi phiên AI tự dùng hòm thư, lượt DEV và sổ "Cần anh".
6. Điền sổ cho đúng đội thật.
7. Báo lại link cho bạn.

## Cài tay

Cần **Node.js 18+** (https://nodejs.org), cùng với **Claude Code** hoặc **Codex** đã dùng trên máy.

```bash
git clone https://github.com/vinaichatbot-rgb/van-phong-ao-3d.git
cd van-phong-ao-3d
npm run setup
npm start
```

Mở **http://localhost:7788**.

`npm run setup` hỏi 5 câu:
1. Theo dõi dự án nào: máy tự liệt kê các thư mục đã dùng AI trong 14 ngày, bạn gõ số thứ tự.
2. Tên văn phòng.
3. Bạn muốn được gọi là gì.
4. Có xem trên điện thoại không: trả lời có thì máy tạo khóa xem.
5. Có dán luật đội vào `AGENTS.md` / `CLAUDE.md` không.

Xong, máy ghi `config.json` và tạo sổ `data/` từ khung mẫu `mau/`.

## Các màn hình

| Màn | Có gì |
|---|---|
| **Văn phòng 3D** | 8 phòng: Giám đốc, Quản lý, Điều phối, Kiểm tra & duyệt, Studio Claude, Phòng DEV, Khu Codex, Phòng họp. Robot đi lại, tin bay giữa bàn, họp tự động. Trên cùng có ô **Cần anh** và **Tiền AI hôm nay**, kèm 3 màn hình lớn trên tường |
| **Bảng điều hành** (màn giữa) | Đang làm / chờ / bị chặn / rảnh. Phòng DEV: ai giữ, bao lâu, dịch vụ khỏe không. Việc ưu tiên, lịch DEV hôm nay, hàng chờ, luồng tin, băng chữ chạy, dải "Cần anh làm", nhịp làm việc 3 giờ |
| **Công việc & tiến độ** (màn trái) | Việc đang áp dụng theo thứ tự, nhật ký quyết định, tiến độ từng gói (mục "Đang dở"), DEV và việc chờ anh |
| **Nội quy & đội ngũ** (màn phải) | Nội quy (mục mới đổi gắn nhãn MỚI), đội ngũ (chấm xanh khi phiên đang có mặt), cấp bậc, sổ tay gồm bài học, việc để sau, từ điển, SPEC |
| **Tổng quan** | Việc gì, để làm gì, ai làm, tới đâu, nghẽn ở đâu (hạn quá thì đỏ). Từng bot đang làm gì, ai "rảnh mà còn việc", ai "im quá 2 giờ" |
| **Hòm thư** | Mỗi vai: số tin chưa xong, chờ quá 1 giờ, đọc lại từ 3 lần mà chưa xong, chưa đọc, tin cũ nhất |
| **Đánh giá nhân sự** | Token theo giờ và ngày, quỹ Codex tuần, xếp loại A/B/C/D theo việc xong, lỗi lệnh, lượt DEV, giờ làm, độ tiết kiệm |
| **Tin nhắn** | Toàn bộ tin 24 giờ, lọc theo người |
| **Sơ đồ 2D** | Bản nhẹ cho điện thoại yếu: mặt bằng, người, tin bay, cảnh báo, dòng thời gian |
| **Nhắn tin cho agent** | Bấm vào một người trên văn phòng hoặc bảng điều hành, gõ tin. Tin vào hòm thư của người đó; từ xa phải nhập **PIN 6 số**, mã chỉ hiện trên chính máy bạn |

## Sổ điều phối `data/` và công cụ `vp`

Sổ của đội nằm trong `data/`. Thư mục này đã có trong `.gitignore`, mỗi máy một bộ riêng. Agent ghi sổ bằng `node tools/vp.js …`, gõ `node tools/vp.js giup` để xem đủ lệnh:

| Sổ | Lệnh |
|---|---|
| Hòm thư `hop-thu/<vai>.jsonl` | `vp gui --toi "<vai>" "[VIỆC] …"` · `vp tiep --toi "<vai mình>"` (cuối mỗi lượt) · `vp xong <mã>` · `vp ds` |
| Lượt DEV `DEV.lock`, `DEV-LUOT.jsonl` | `vp luot cho \| lay \| nha \| huy \| xem` |
| Cần anh `CAN-ANH.md` | `vp cananh hoi \| xong \| ds` |
| Việc ưu tiên `UU-TIEN.json` | `vp viec ds \| them \| sua \| dung \| xoa` |
| Gói việc `goi/<gói>/viec.json` + `tien-do.md` | `vp goi tao \| muc \| dat \| sua \| ghichu` · `vp tiendo <gói> "…"` |
| Bài học `BAI-HOC.md` | `vp baihoc --the "<thẻ>" "…" --chan "…"` |
| Nội quy, đội ngũ, cấp bậc, việc để sau, từ điển, quyết định, SPEC | sửa tay các file `.md` trong `data/` (khung mẫu ở `mau/`) |

Luật đội để dán vào dự án nằm ở `data/DOAN-CHEN-VAO-AGENTS.md`, đã điền sẵn đường dẫn. Nó dặn mọi phiên AI 4 việc:
- đọc hòm thư cuối mỗi lượt;
- hỏi chủ qua sổ "Cần anh";
- lấy và nhả lượt DEV;
- ghi "Đang dở" trước khi nghỉ.

## Hook Claude Code (trạng thái chính xác)

Mặc định văn phòng đọc nhật ký phiên và đoán. Cài hook thì Claude Code tự báo: bắt đầu lượt, đang chạy tool, **chờ bạn duyệt quyền**, lỗi API, xong lượt, subagent, thoát phiên.

```bash
node tools/hooks.js cai   # thêm hook vào ~/.claude/settings.json (hoặc $CLAUDE_CONFIG_DIR), có sao lưu cạnh file
node tools/hooks.js xem   # kiểm tra đã đủ chưa
node tools/hooks.js go    # gỡ đúng hook của văn phòng, không đụng hook khác
```

Rồi mở lại phiên Claude Code đang chạy và khởi động lại `npm start`. (`npm run setup` cũng hỏi cài hook; agent cài dùng `--hooks`.)

- **Phiên nào có hook thì dùng hook**, phiên nào chưa có thì vẫn đọc nhật ký như cũ. Codex chưa có hook nên vẫn đọc nhật ký.
- Hộp xin quyền / hộp hỏi của Claude hiện ngay ở ô **Cần anh**, tắt khi bạn trả lời. Lượt lỗi API hiện là "bị chặn".
- `hooks/emit.js` chỉ gửi tên sự kiện, mã phiên, tên tool, loại thông báo và thông báo ngắn tới `127.0.0.1`. Không gửi nội dung lệnh, đường dẫn tệp, kết quả tool. Máy chủ chỉ nhận khi gọi thẳng từ máy này kèm token trong `data/.hook-endpoint.json` (quyền 0600). Máy chủ chưa chạy hay lỗi gì thì hook im lặng thoát, không làm chậm hay chặn Claude.

## Cảnh báo Telegram (tùy chọn, mặc định tắt)

Không cần ngồi canh màn hình: khi có việc cần bạn, văn phòng nhắn Telegram. Đây là **chỗ duy nhất văn phòng gửi dữ liệu ra Internet** (tới `api.telegram.org`), và chỉ khi bạn tự điền token + chat id.

Báo khi:
- **Cần anh** chắc chắn (hộp xin quyền/hộp hỏi từ hook, sổ "Cần anh", tin gắn `[CẦN ANH]`). Mục chỉ đoán qua chữ thì không báo.
- Phiên **bị chặn** quá `blockedAfterMin` phút (mặc định 3).
- **Tiền AI hôm nay** qua 80% và chạm 100% trần `aiCapUsd`.
- Sự cố hệ thống mức đỏ (ổ đĩa đầy, container DEV hỏng, tin hòm thư bị bỏ quên). Cùng sự cố không nhắc lại trong `cooldownMin` phút (mặc định 60).

Cài đặt:
1. Trên Telegram nhắn **@BotFather**, lệnh `/newbot`, lấy `botToken`.
2. Mở bot vừa tạo, bấm Start (hoặc nhắn một câu), rồi chạy `node tools/alerts.js tim-chat` để lấy `chatId`.
3. Thêm vào `config.json` (file này nằm trong `.gitignore`), hoặc dùng biến môi trường `VPAO_TELEGRAM_TOKEN` / `VPAO_TELEGRAM_CHAT`:

```json
"alerts": {
  "telegram": { "botToken": "123456:ABC...", "chatId": "123456789" },
  "dashboardUrl": "https://....trycloudflare.com",
  "includeText": true,
  "quiet": { "enabled": true, "start": "23:00", "end": "08:00", "days": [0,1,2,3,4,5,6] }
}
```

4. `node tools/alerts.js thu` gửi tin thử, rồi khởi động lại `npm start`.

Lưu ý:
- **Quyền riêng tư:** tin chứa tên phiên và một đoạn ngắn (tối đa 200 ký tự, đã che khóa) của câu hỏi. Không muốn nội dung ra khỏi máy thì đặt `"includeText": false`: tin chỉ nói "X cần bạn".
- **Giờ yên lặng** theo giờ máy này, qua nửa đêm được; alert bị giữ sẽ gộp thành một tin khi hết giờ. Chỉ "chạm trần tiền AI" vẫn gửi ngay.
- Tối đa `maxPerHour` tin mỗi giờ (mặc định 20); vượt thì gom thành tin tóm tắt. Lần chạy đầu sau khi khởi động chỉ ghi nhận hiện trạng nên không báo lại việc cũ. Gửi lỗi thì thử lại sau 1 phút.
- Token không bao giờ nằm trong log hay thông báo lỗi. Nếu máy phải qua proxy HTTP để ra Internet thì cần cấu hình riêng (Node không tự dùng `HTTPS_PROXY`).

## Giao việc và báo cáo qua Telegram

Khi đã bật cảnh báo Telegram (mục trên), bot còn **nhận lệnh từ bạn**. Văn phòng tự hỏi Telegram liên tục (long polling) nên không cần mở cổng ra Internet.

| Gõ trong chat với bot | Làm gì |
|---|---|
| `/ds` | Danh sách người đang có mặt, đánh số, kèm trạng thái |
| `/viec 2 sửa lỗi đăng nhập` | Giao việc cho người số 2 trong `/ds` |
| `/viec Tên người: nội dung` hoặc `Tên người: nội dung` | Giao theo tên (không phân biệt dấu, hoa thường) |
| **Trả lời thẳng vào một tin cảnh báo** | Gửi cho đúng người mà tin đó nói về |
| `/dung 2` | Chặn lệnh tiếp theo của người số 2 và bảo họ dừng |
| `/baocao` | Mỗi người đang làm gì, xong lượt lúc nào, nói gì lần cuối |
| `/cananh` | Việc đang chờ bạn quyết |

**Việc tới agent bằng cách nào (và giới hạn thật):**
- **Claude Code có hook:** việc được xếp hàng và giao khi hook `Stop` của phiên chạy (lúc phiên sắp nghỉ), Claude làm tiếp ngay theo việc mới. Không cần sửa `CLAUDE.md`. Phiên **đang rảnh hẳn** chỉ nhận việc ở lượt kế tiếp, tức là sau khi bạn gõ gì đó vào phiên đó. Việc **hết hạn** sau `taskTtlMin` phút (mặc định 30) và bot báo lại, để việc cũ không bất ngờ chạy hàng giờ sau.
- **Codex hoặc phiên chưa có hook:** việc vào hòm thư. Agent chỉ thấy khi chạy `vp tiep` nên cần luật đội trong `AGENTS.md`/`CLAUDE.md`.
- Bot **không bao giờ khởi chạy phiên mới** hay chạy lệnh trên máy bạn. Nó chỉ chuyển việc cho phiên có sẵn.

**Báo cáo:** mỗi khi một phiên xong lượt, bot gửi tên người đó và vài dòng cuối câu trả lời (đã che khóa, tối đa 300 ký tự; `includeText:false` thì chỉ báo "xong lượt"). Cùng một người không báo dày hơn `reportGapSec` giây (mặc định 120), và có giờ yên lặng, trần `maxPerHour` như các cảnh báo khác. Tắt bằng `"reportDone": false`.

**An toàn (đây là cửa điều khiển vào máy bạn):**
- Chỉ nhận tin từ đúng `chatId`. Người lạ nhắn bot sẽ bị bỏ qua, không trả lời. Chat nhóm: phải đặt `alerts.telegram.allowedUserIds` (danh sách id người được phép), nếu không mọi lệnh bị bỏ.
- Tin tồn đọng lúc văn phòng tắt, tin quá 2 phút và tin chuyển tiếp **không bao giờ được thi hành**. Tối đa `20` lệnh mỗi phút, mỗi tin tối đa 2000 ký tự.
- Tắt hẳn phần nhận lệnh bằng `"inbound": false` (vẫn nhận cảnh báo).
- Chưa làm: nút Cho phép / Từ chối quyền ngay trong Telegram (duyệt nhầm lệnh nguy hiểm từ điện thoại là rủi ro lớn).

## Ra lệnh qua Telegram 24/7 mà không cần máy chủ (Cloudflare Worker + GitHub Actions)

Không có máy nào bật suốt? Gõ `/viec <việc>` hoặc `/hoi <câu hỏi>` trong Telegram: một Cloudflare Worker (miễn phí, luôn chạy) kích hoạt GitHub Actions, Claude Code sửa mã trong repo của bạn và **mở Pull Request** (không tự gộp), rồi báo kết quả về Telegram. Mỗi lệnh là một lần chạy mới, không có phiên sống và không hiện trên văn phòng 3D. Hướng dẫn từng bước: [serverless/HUONG-DAN.md](serverless/HUONG-DAN.md).

## Chạy 24/7 trên máy chủ đám mây (VPS)

Muốn máy tính tắt mà vẫn giao việc và nhận báo cáo qua Telegram thì chạy **cả Claude Code lẫn văn phòng trên cùng một VPS** (văn phòng đọc nhật ký trên máy nó chạy). Hướng dẫn từng bước, kèm file systemd và script tmux: [deploy/HUONG-DAN-VPS.md](deploy/HUONG-DAN-VPS.md). Muốn xem văn phòng bằng tên miền riêng https, bước 11 của hướng dẫn đó dùng **Cloudflare Tunnel** (không mở cổng) + Cloudflare Access.

Trên VPS, phiên Claude chạy trong tmux và hay ở trạng thái rảnh, nên có tùy chọn `"alerts": {"tmuxDelivery": true}`: văn phòng **gõ việc từ Telegram vào phiên đang rảnh** (không qua shell, chỉ khi phiên đã xong ít nhất một lượt, không bao giờ gõ khi phiên đang làm hoặc chờ duyệt quyền). Mặc định tắt.

## Bảo mật khi mở ra ngoài

- Máy chủ mặc định chỉ nghe `127.0.0.1` và từ chối `Host` lạ (chống DNS rebinding) khi chưa có `accessKey`.
- Đặt `host` khác `127.0.0.1` mà **không có `accessKey` thì máy chủ từ chối chạy** (trừ khi bạn cố tình đặt `"allowOpenAccess": true`).
- Khóa xem chỉ nhận qua form đăng nhập (POST), không nhận qua `?key=` trên địa chỉ nên không nằm lại trong lịch sử trình duyệt. Công cụ dòng lệnh dùng header `X-VP-Key`. Sai 5 lần trong 10 phút thì khóa 10 phút.
- Cookie đăng nhập `HttpOnly`, `SameSite=Strict`.

## Xem trên điện thoại

- **Cùng Wi-Fi:** đặt `"host": "0.0.0.0"` và `accessKey` trong `config.json`, rồi mở `http://<IP máy>:7788`.
- **Qua Internet:** cài cloudflared (Windows: `winget install --id Cloudflare.cloudflared`; macOS: `brew install cloudflared`). Chạy `powershell -ExecutionPolicy Bypass -File scripts\xem-tren-dien-thoai.ps1` hoặc `sh scripts/xem-tren-dien-thoai.sh`, mở link `trycloudflare.com` rồi nhập khóa xem một lần. Script sẽ không chạy nếu chưa có khóa xem.

## Cấu hình `config.json`

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `title`, `subtitle`, `ownerName` | Văn phòng AI, …, Giám đốc | Tên hiện trên văn phòng |
| `projects` | `[]` | Thư mục dự án cần theo dõi (tính cả thư mục con, worktree). Để trống là mọi dự án |
| `port`, `host` | 7788, 127.0.0.1 | `0.0.0.0` để máy khác trong mạng xem được (bắt buộc có `accessKey`) |
| `alerts` | `{}` | Cảnh báo và lệnh Telegram (xem hai mục trên). Để trống = tắt. Khóa con: `telegram.{botToken,chatId,allowedUserIds}`, `includeText`, `quiet`, `reportDone`, `reportGapSec`, `inbound`, `taskTtlMin`, `tmuxDelivery`, `maxPerHour`, `blockedAfterMin`, `cooldownMin`, `dashboardUrl` |
| `allowOpenAccess` | `false` | `true` = cho phép mở ra mạng không khóa (không nên) |
| `accessKey` | `""` | Khóa xem: nhập một lần ở form đăng nhập mới vào được |
| `keepHours` | 24 | Phiên im quá số giờ này thì rời văn phòng |
| `staff`, `hide` | `[]` | Đặt tên, chức danh, phòng (`manager`, `coord`, `g1`, `claude`, `codex`) cho phiên; giấu phiên |
| `dataDir` | `data` | Nơi để sổ điều phối |
| `rulesFile` | `""` | File nội quy riêng; để trống thì dùng `data/NOI-QUY.md`, không có thì `AGENTS.md` / `CLAUDE.md` của dự án |
| `aiCapUsd` | 100 | Trần tiền AI mỗi ngày (vượt 80% thì ô chuyển đỏ) |
| `prices` | Claude 3/0,3/15 · Codex 1,25/0,125/10 | Giá API (USD cho 1 triệu token: vào / đọc đệm / ra) để **ước tính** tiền. Dùng gói thuê bao tháng thì đây chỉ là số để so sánh |
| `dockerFilter`, `dockerStrip`, `dockerRetired` | `""`, `""`, `[]` | Hiện container Docker trong Phòng DEV, ví dụ `"name=myapp-dev"` |

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| `Chưa có config.json` | Chạy `npm run setup` trước. |
| Văn phòng trống | Mở phiên AI **trong đúng thư mục dự án** đã chọn; kiểm `projects` (dùng dấu `/`). |
| `EADDRINUSE` | Cổng 7788 đang bận: đổi `port`. |
| Màn 3D đen | Trình duyệt chặn WebGL hoặc máy không tải được three.js. Thử Chrome/Edge mới, hoặc dùng Sơ đồ 2D. |
| Hòm thư không ai đọc | Phiên AI chưa có luật đội: dán `data/DOAN-CHEN-VAO-AGENTS.md` vào `AGENTS.md` / `CLAUDE.md`, và đặt tên phiên trùng tên vai. |

## Cấu trúc mã

```
server.js              máy chủ: tìm phiên, đọc nhật ký + sổ, đẩy trạng thái mỗi giây
lib/                   tgbot (nhận lệnh Telegram) · commandq (hàng đợi việc giao từ xa) · perf (token, điểm, tiền) · docs (sổ sách) · hopthu · tongquan · chat (PIN) · mailbox · config
                       mask (che khóa) · hookstate (trạng thái từ hook) · hookinstall · alerts (Telegram) · netguard (Host, giới hạn thử sai, token hook)
tools/vp.js            công cụ ghi sổ cho agent
tools/hooks.js         cài / gỡ / xem hook Claude Code
tools/alerts.js        xem / tìm chat id / gửi tin thử cho cảnh báo Telegram
serverless/            Telegram → Cloudflare Worker → GitHub Actions (không cần máy chủ); workflow ở .github/workflows/telegram-*.yml
deploy/                hướng dẫn và file cho VPS: systemd, tmux, Cloudflare Tunnel, mẫu biến môi trường
hooks/emit.js          hook: rút gọn sự kiện rồi POST về máy chủ (và nhận việc giao từ xa)
test/                  npm test (node --test, không cần thư viện)
setup.js               cài đặt (hỏi–đáp hoặc --yes cho agent)
mau/                   khung mẫu sổ điều phối + đoạn luật đội cho AGENTS.md / CLAUDE.md
public/                giao diện: index (3D), board, congviec, noiquy, tongquan, hopthu, hieusuat, tinnhan, 2d
scripts/               mở đường hầm xem trên điện thoại
HUONG-DAN-CHO-AGENT.md hướng dẫn để agent tự cài từ link này
```

Giấy phép MIT. Mã gốc: `van-phong-ao-3d` của vinaichatbot-rgb (giữ nguyên LICENSE); bản này thêm hook Claude Code, siết bảo mật và test.
