# Ra lệnh qua Telegram 24/7 mà không cần máy chủ: Cloudflare Worker + GitHub Actions

```
Điện thoại ──Telegram──▶ Cloudflare Worker ──▶ GitHub Actions ──▶ Claude Code sửa mã
 (bạn gõ /viec)        (kiểm tra đúng chủ)     (chạy trên máy của GitHub)      │
        ▲                                                                       │
        └────────────── tin báo kết quả + link Pull Request ◀────────────────────┘
```

Không có máy nào của bạn phải bật. Worker (Cloudflare) và Actions (GitHub) luôn sẵn sàng, mỗi lệnh khởi chạy một lần rồi tắt.

## Điều cần hiểu trước khi làm (khác với văn phòng 3D)

| | Văn phòng 3D + VPS | Cách này (Worker + Actions) |
|---|---|---|
| Phiên Claude | Sống liên tục, nhớ ngữ cảnh | **Mỗi lệnh là một lần chạy mới**, chỉ biết mã trong repo |
| Làm việc trên | Thư mục dự án trên máy | **Một repo GitHub** (dự án phải nằm trên GitHub) |
| Kết quả | Sửa thẳng trên máy | **Pull Request** để bạn xem rồi gộp (không tự gộp vào nhánh chính) |
| Văn phòng 3D | Có | **Không hiện** (không có phiên sống để vẽ) |
| Hạ tầng | Phải có máy | Không |

Hai lệnh:
- `/viec <việc>`: Claude sửa mã, đẩy lên nhánh `claude/telegram-<số>` và mở Pull Request. Xong báo lại kèm link và tóm tắt.
- `/hoi <câu hỏi>`: Claude chỉ **đọc** mã rồi trả lời, không sửa gì.
- `/trangthai`: 5 lần chạy gần nhất.

> **Tôi chưa chạy thử được workflow này trên GitHub thật** (cần tài khoản và khóa của bạn). Phần Worker, các script và đoạn lệnh bash đã được kiểm tra bằng test, nhưng bước gọi `anthropics/claude-code-action` thì chưa. Vì vậy hãy thử bằng `/hoi` (chỉ đọc, ít rủi ro) trước, rồi mới `/viec`.

## Quyền riêng tư và bảo mật: đọc trước

- **Repo công khai thì mọi thứ công khai.** Repo `dovantom123/tom123` hiện là public: nội dung bạn gửi trong `/viec`, tóm tắt của Claude, tên nhánh và Pull Request đều ai cũng đọc được, kể cả log của Actions. **Với dự án thật hãy dùng repo private.**
- Chỉ **chat Telegram của bạn** ra lệnh được: Worker kiểm tra mã bí mật webhook của Telegram, đúng chat id, đúng người gửi, bỏ qua tin chuyển tiếp và tin cũ quá 2 phút; workflow kiểm tra lại chat id một lần nữa (biến `OWNER_CHAT_ID`). Người lạ nhắn bot bị bỏ qua, không được trả lời.
- Claude **không tự commit hay đẩy**: nó chỉ sửa tệp. Các bước sau (commit, đẩy nhánh riêng, mở PR) do workflow làm, và **thay đổi trong `.github/workflows` bị loại** khỏi PR. Không bao giờ đẩy thẳng vào nhánh chính. Bạn xem PR rồi mới gộp.
- Claude chỉ có các công cụ: đọc, tìm, sửa tệp, và chạy kiểm thử (`node --test`, `npm test`). Không có `git`, `curl` hay shell tự do. Sửa danh sách này trong file workflow nếu repo của bạn dùng lệnh kiểm thử khác.
- Mã kiểm thử của repo chạy **trong cùng job có các khóa bí mật** (khóa Claude, token bot). Chỉ dùng cho repo bạn tin cậy, và đừng cho người khác quyền ghi vào repo.
- Có hạn mức để khỏi tốn tiền ngoài ý muốn: tối đa `DAILY_CAP` việc mỗi ngày (mặc định 10), `--max-turns` 30, quá 30 phút thì bị tắt, mỗi lần chỉ chạy một việc (việc sau xếp hàng).

---

## Bước 1. Chuẩn bị

1. **Repo đích** trên GitHub, nơi Claude sẽ làm việc.
   - Muốn thử: dùng ngay `dovantom123/tom123` (đã có sẵn workflow). Nhớ là nó public.
   - Muốn dùng cho dự án khác (ví dụ `shop-agent`): trong thư mục `tom123` chạy `node serverless/copy-to.cjs <đường-dẫn-repo-đó>`, rồi commit và push các tệp được chép **lên nhánh mặc định** (`repository_dispatch` chỉ chạy workflow nằm ở nhánh mặc định).
2. **Một bot Telegram MỚI** cho việc này: nhắn @BotFather, `/newbot`, lấy token. **Đừng dùng lại bot của văn phòng 3D**: Telegram không cho một bot vừa có webhook vừa được hỏi bằng `getUpdates`.
3. **Chat id của bạn:** số bạn đã dùng trong `config.json`. (Nhắn bot mới một câu rồi dùng `node tools/alerts.js tim-chat` với token bot mới nếu cần lấy lại.)
4. **Khóa để Claude chạy trên Actions**, một trong hai:
   - `ANTHROPIC_API_KEY`: tạo ở console.anthropic.com, tính tiền theo lượng dùng.
   - `CLAUDE_CODE_OAUTH_TOKEN`: lấy bằng lệnh `claude setup-token` nếu bạn dùng gói thuê bao Claude. Hãy tự đọc điều khoản hiện hành của Anthropic về dùng gói thuê bao trong CI trước khi chọn cách này.

## Bước 2. Cài đặt trên GitHub (repo đích)

Vào repo → **Settings**:
1. **Secrets and variables → Actions → Secrets → New repository secret**, thêm:
   - `ANTHROPIC_API_KEY` (hoặc `CLAUDE_CODE_OAUTH_TOKEN`)
   - `TELEGRAM_BOT_TOKEN` = token của **bot mới**
2. Cùng trang, tab **Variables → New repository variable**: `OWNER_CHAT_ID` = chat id của bạn. (Chưa đặt biến này thì workflow **không chạy**, chủ ý để an toàn.)
3. **Actions → General → Workflow permissions**: chọn *Read and write permissions* và **tick** *Allow GitHub Actions to create and approve pull requests*. Lưu. (Không bật mục này thì workflow đẩy được nhánh nhưng không mở được PR.)

## Bước 3. Token GitHub cho Worker

Worker cần một token để bấm nút "chạy workflow". Tạo token **chỉ cho đúng một repo**:
1. GitHub → avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Repository access*: **Only select repositories** → chọn repo đích.
3. *Permissions → Repository permissions*: **Contents: Read and write** (cần để gửi sự kiện), **Actions: Read-only** (để `/trangthai` xem được). Metadata (read) tự có.
4. Đặt hạn dùng (ví dụ 90 ngày) và ghi nhớ ngày phải tạo lại. Sao chép token (chỉ hiện một lần).

## Bước 4. Tạo Cloudflare Worker (làm trên web, không cần dòng lệnh)

Tên menu của Cloudflare có thể đổi theo thời gian; nếu khác, gửi tôi ảnh chụp màn hình.

1. Đăng nhập Cloudflare → **Workers & Pages → Create → Create Worker** (mẫu *Hello World*). Đặt tên `vpao-telegram` → **Deploy**.
2. **Edit code**: xóa mã mẫu, dán **toàn bộ** nội dung tệp `serverless/worker/src/index.mjs` → **Deploy**.
3. Mở Worker → **Settings → Variables and Secrets**, thêm:

   | Tên | Loại | Giá trị |
   |---|---|---|
   | `TELEGRAM_BOT_TOKEN` | Secret | token bot mới |
   | `TELEGRAM_WEBHOOK_SECRET` | Secret | chuỗi ngẫu nhiên (xem lệnh bên dưới) |
   | `GITHUB_TOKEN` | Secret | token ở bước 3 |
   | `GITHUB_REPO` | Text | `chủ/repo`, ví dụ `dovantom123/tom123` |
   | `OWNER_CHAT_ID` | Text | chat id của bạn |
   | `DAILY_CAP` | Text | `10` (số việc tối đa mỗi ngày) |

   Tạo chuỗi bí mật webhook (PowerShell), ghi lại đúng chuỗi này vì bước 5 cần lại:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
4. **KV (nên có, để chống xử lý trùng và đếm hạn mức ngày):** Cloudflare → **Storage & Databases → KV → Create namespace** (tên `vpao-state`). Quay lại Worker → **Settings → Bindings → Add → KV namespace**, *Variable name* **`STATE`**, chọn namespace vừa tạo. Lưu và deploy lại.
5. Lấy địa chỉ Worker, dạng `https://vpao-telegram.<tên-bạn>.workers.dev`. Mở nó trong trình duyệt: phải hiện chữ `ok`.

(Ai quen dòng lệnh có thể dùng `serverless/worker/wrangler.toml` với `npx wrangler deploy`.)

## Bước 5. Trỏ bot Telegram về Worker

Trong PowerShell, thư mục `tom123` (thay ba giá trị của bạn; token không nằm trong dòng lệnh mà ở biến môi trường):

```powershell
$env:TELEGRAM_BOT_TOKEN = "token-của-bot-mới"
$env:WORKER_URL = "https://vpao-telegram.tên-bạn.workers.dev"
$env:TELEGRAM_WEBHOOK_SECRET = "chuỗi-bí-mật-ở-bước-4"
node serverless/scripts/set-webhook.cjs dat
node serverless/scripts/set-webhook.cjs xem
```
`xem` phải in địa chỉ webhook của bạn và `Tin đang chờ: 0`, không có dòng "Lỗi gần nhất". Đóng cửa sổ PowerShell hoặc chạy `Remove-Item Env:TELEGRAM_BOT_TOKEN` để token không nằm lại trong phiên.

## Bước 6. Thử

Trong chat với **bot mới**:
1. `/hoi repo này có những thư mục chính nào?` → Bot trả "Đã nhận câu hỏi…", khoảng 1 đến 3 phút sau gửi câu trả lời.
2. `/trangthai` → thấy lần chạy vừa rồi.
3. Khi `/hoi` chạy ổn, thử `/viec thêm một dòng chú thích vào đầu README.md` → bot báo xong kèm **link Pull Request**. Mở PR, xem thay đổi, gộp hoặc đóng.

Xem chi tiết từng lần chạy: repo → tab **Actions**.

## Dùng nhà cung cấp API khác (đại lý bán khóa)

Nếu khóa của bạn mua từ một đại lý thay vì từ Anthropic, workflow cần biết **địa chỉ API** của đại lý. Thêm biến `ANTHROPIC_BASE_URL` ở GitHub (Settings → Secrets and variables → Actions → **Variables**) với địa chỉ do đại lý cung cấp, và để khóa của họ vào secret `ANTHROPIC_API_KEY`. Không đặt biến này thì workflow dùng địa chỉ chính thức của Anthropic.

Điều kiện để chạy được: đại lý phải có đường dẫn tương thích định dạng API của Anthropic (Messages API) và hỗ trợ đúng tên mô hình mà Claude Code gọi. Nếu họ dùng tên mô hình khác, báo tôi để chỉnh thêm `--model`.

**Rủi ro cần nhắc, nhất là với đại lý bán "khóa rẻ":**
- **Toàn bộ mã và câu lệnh của bạn đi qua máy chủ của họ.** Họ đọc, lưu được mọi thứ Claude đọc trong repo. Chỉ dùng với repo **không chứa bí mật hay mã nhạy cảm**.
- **Nguồn khóa không rõ.** Khóa giá rẻ có thể đến từ tài khoản dùng chung hoặc tài khoản bị lạm dụng, có thể bị thu hồi bất cứ lúc nào, và dùng như vậy có thể vi phạm điều khoản của Anthropic. Tôi không đánh giá được riêng đại lý bạn đang dùng, bạn tự cân nhắc.
- Đừng đưa khóa vào tin nhắn, ảnh chụp màn hình hay commit. Nếu lỡ lộ thì đổi khóa ngay ở đại lý.
- Trước hết hãy thử với `/hoi` trên một repo không quan trọng, và chỉ nạp số tiền nhỏ.

## Chi phí và giới hạn

- **Tiền Claude:** tính vào khóa bạn đặt ở bước 1. Mỗi `/viec` dùng đến 30 lượt, nên đặt hạn mức chi tiêu ở trang Anthropic nếu bạn dùng khóa API.
- **Phút Actions:** repo public thì chạy miễn phí trên máy chuẩn của GitHub; repo private thì tính theo hạn mức gói GitHub của bạn (xem trang Billing của GitHub, tôi không nhớ chắc con số hiện hành).
- **Cloudflare Worker, KV:** có hạn mức miễn phí; một người dùng cá nhân thường nằm trong đó.
- **Thời gian:** mỗi lần chạy mất vài phút (khởi động máy, cài, chạy). Không phản hồi tức thì như phiên sống.
- **Việc giao nhau:** việc sau chờ việc trước xong (một hàng đợi, không chạy song song).

## Gỡ khi không dùng

```powershell
node serverless/scripts/set-webhook.cjs go
```
Rồi xóa Worker trên Cloudflare, thu hồi token GitHub (Developer settings), và tắt hai workflow trong tab Actions. Thu hồi token bot ở @BotFather (`/revoke`) nếu nghi bị lộ.

## Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Bot không trả lời gì | `set-webhook.cjs xem`: nếu không có địa chỉ thì chạy lại bước 5; nếu có "Lỗi gần nhất" thì đọc. Cũng kiểm tra `OWNER_CHAT_ID` ở Worker **đúng bằng** chat id của bạn (bot im lặng với người lạ). |
| `xem` báo lỗi 401 từ Worker | `TELEGRAM_WEBHOOK_SECRET` ở Worker khác với chuỗi đã đặt webhook. Đặt lại cho khớp rồi chạy `dat` lại. |
| Bot nói "Không kích hoạt được GitHub Actions (404/403)" | Sai `GITHUB_REPO`, hoặc token thiếu quyền *Contents: Read and write*, hoặc token không được cấp cho repo đó, hoặc đã hết hạn. |
| Bot trả lời "Đã nhận" nhưng không thấy gì chạy trong tab Actions | Workflow phải nằm ở **nhánh mặc định** của repo. Kiểm tra `.github/workflows/telegram-*.yml` có ở đó không. |
| Lần chạy hiện *Skipped* | Biến `OWNER_CHAT_ID` ở **GitHub** (Settings → Variables) chưa đặt hoặc khác chat id gửi từ Telegram. |
| `/viec` xong nhưng "không mở được Pull Request" | Chưa tick *Allow GitHub Actions to create and approve pull requests* (bước 2.3). Nhánh `claude/telegram-…` đã được đẩy, bạn tự mở PR được. |
| Claude chạy lỗi ngay ở bước "Claude làm việc" | Thiếu hoặc sai `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`. Đọc log của bước đó trong tab Actions. |
| Có PR nhưng không có tóm tắt | Định dạng tệp kết quả của action có thể đổi. PR vẫn đúng; gửi tôi một đoạn log để chỉnh `summarize.cjs`. |
| Bot hết "hạn mức ngày" | Đã đủ `DAILY_CAP` việc hôm nay. Tăng `DAILY_CAP` ở Worker nếu bạn muốn. |
