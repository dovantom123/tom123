# Chạy agent và văn phòng trên máy chủ đám mây (VPS) 24/7

Mục tiêu: một máy chủ Linux trên đám mây chạy **cả Claude Code lẫn văn phòng ảo**, để máy tính của bạn tắt vẫn **giao việc, nhận báo cáo và cảnh báo qua Telegram**.

> Vì sao phải chạy cả hai trên cùng một máy: văn phòng đọc nhật ký ở `~/.claude` **trên máy nó chạy**. Phiên chạy trên PC của bạn thì văn phòng trên VPS không thấy được. Muốn văn phòng thấy thì agent phải chạy trên chính VPS.

## Trước khi bắt đầu, cần biết

- **Bạn chưa có VPS thì phải thuê trước** (bất kỳ nhà cung cấp nào cho Ubuntu: Hetzner, DigitalOcean, Vultr, Linode, AWS Lightsail, Oracle…). Tôi không thuê hộ được và không biết giá hiện tại của từng nơi, bạn tự xem.
- **Chọn:** Ubuntu 24.04 (hoặc 22.04), tối thiểu **2 GB RAM** và 1–2 CPU (Claude Code ngốn bộ nhớ), đăng nhập bằng **khóa SSH**.
- **Mã của bạn phải nằm trên VPS.** Dự án ở `D:\CLAUDE`, `D:\shop-agent` trên PC không tự có trên VPS. Bạn cần `git clone` chúng lên VPS (kho riêng tư thì dùng deploy key hoặc `gh auth login`).
- **Chi phí AI:** phiên chạy 24/7 vẫn tiêu hạn mức hoặc tiền của tài khoản Claude/API. Ô "Tiền AI hôm nay" và cảnh báo vượt 80% trần (`aiCapUsd`) giúp bạn theo dõi.
- **Chỉ một nơi được nhận lệnh từ một bot.** Nếu văn phòng trên PC và văn phòng trên VPS cùng dùng một bot, Telegram báo xung đột (409) và chỉ một bên nhận được. **Dừng văn phòng trên PC** (Ctrl+C) trước khi bật trên VPS, hoặc tạo bot thứ hai cho VPS.

---

## Bước 1. Tạo khóa SSH trên Windows (một lần)

Trong PowerShell trên PC:

```powershell
ssh-keygen -t ed25519 -C "vps"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```
Dòng thứ hai in ra **khóa công khai** (một dòng bắt đầu bằng `ssh-ed25519`). Dán nó vào ô "SSH key" khi tạo VPS. **Không bao giờ chia sẻ** file `id_ed25519` (không có đuôi `.pub`).

## Bước 2. Vào VPS và tạo người dùng riêng

Nhà cung cấp cho bạn một địa chỉ IP, giả sử `203.0.113.10`. Đăng nhập lần đầu bằng root:

```powershell
ssh root@203.0.113.10
```
Trên VPS, tạo người dùng `agent` (agent chạy bằng người này, **không chạy bằng root**):

```bash
adduser --disabled-password --gecos "" agent
mkdir -p /home/agent/.ssh
cp /root/.ssh/authorized_keys /home/agent/.ssh/
chown -R agent:agent /home/agent/.ssh && chmod 700 /home/agent/.ssh && chmod 600 /home/agent/.ssh/authorized_keys
```
Bật tường lửa chỉ cho SSH, và tắt đăng nhập root bằng mật khẩu:

```bash
apt update && apt install -y ufw
ufw allow OpenSSH && ufw --force enable
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh
exit
```
**Không mở cổng 7788 ra Internet.** Văn phòng chỉ nghe 127.0.0.1 và bạn xem nó qua đường hầm SSH (bước 9).

Từ giờ đăng nhập bằng người `agent`:

```powershell
ssh agent@203.0.113.10
```

## Bước 3. Cài phần mềm cần thiết

Lệnh sau cần quyền quản trị, nên chạy lúc còn là root (thoát ra `exit` rồi `ssh root@...` nếu cần), hoặc cấp `sudo` cho `agent`:

```bash
apt install -y git tmux curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # phải in v22.x trở lên
```
(`curl ... | bash` tải script cài đặt chính thức của NodeSource rồi chạy. Muốn kiểm tra trước thì tải về xem rồi mới chạy.)

Đăng nhập lại bằng `agent`, cài Claude Code **trong thư mục của người dùng** (không cần sudo):

```bash
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.bashrc && . ~/.bashrc
npm install -g @anthropic-ai/claude-code
claude --version
```

## Bước 4. Lấy mã dự án của bạn lên VPS

```bash
mkdir -p ~/projects && cd ~/projects
git clone <địa-chỉ-kho-dự-án-của-bạn> shop-agent
```
(Thay bằng địa chỉ kho của bạn. Kho riêng tư cần xác thực: tạo deploy key hoặc dùng `gh auth login`.)

## Bước 5. Cài văn phòng

```bash
cd ~ && git clone -b claude/upbeat-volta-fgcnq3 https://github.com/dovantom123/tom123.git vanphong
cd vanphong
node setup.js --yes --project ~/projects/shop-agent --title "VP 92" --owner "Mr. Dang" --hooks
```
Lệnh này tạo `config.json`, sổ `data/` và **cài hook vào `~/.claude/settings.json` của người `agent`**. Muốn theo dõi nhiều dự án thì lặp lại `--project`.

## Bước 6. Cấu hình Telegram

Dùng tệp môi trường riêng để token không nằm trong `config.json`:

```bash
cp deploy/vpao.env.example ~/.vpao.env && chmod 600 ~/.vpao.env
nano ~/.vpao.env     # điền VPAO_TELEGRAM_TOKEN=... (token từ @BotFather); chat id điền sau
```
Nhắn bot một câu trên Telegram, rồi lấy chat id (đọc tệp env vào shell trước):

```bash
set -a; . ~/.vpao.env; set +a
node tools/alerts.js tim-chat
nano ~/.vpao.env     # điền VPAO_TELEGRAM_CHAT=<số vừa thấy>
set -a; . ~/.vpao.env; set +a
node tools/alerts.js thu     # Telegram phải nhận tin thử
```

Rồi bật các tùy chọn cho VPS trong `config.json` (`nano config.json`), thêm khối `alerts` trước dấu `}` cuối, nhớ dấu phẩy:

```json
  "alerts": {
    "tmuxDelivery": true,
    "quiet": { "enabled": true, "start": "23:00", "end": "08:00" }
  }
```
- `tmuxDelivery: true` cho phép văn phòng **gõ việc từ Telegram vào phiên Claude đang rảnh** qua tmux (xem phần "Giao việc cho phiên đang rảnh" cuối trang). Bỏ dòng này thì việc chỉ được giao khi phiên đang chạy lượt.
- Token và chat id đã nằm trong `~/.vpao.env`, không cần ghi lại ở đây.

## Bước 7. Chạy văn phòng như một dịch vụ (tự chạy lại khi lỗi hoặc khởi động lại máy)

Cần quyền `sudo` (hoặc đăng nhập root) cho đoạn này:

```bash
cd ~/vanphong
sed -e "s|__USER__|agent|g" -e "s|__DIR__|/home/agent/vanphong|g" -e "s|__NODE__|$(command -v node)|g" deploy/vpao.service | sudo tee /etc/systemd/system/vpao.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now vpao
sudo systemctl status vpao --no-pager     # phải thấy "active (running)"
journalctl -u vpao -n 20 --no-pager       # log phải có dòng "Cảnh báo: Telegram đang bật"
```
Xem log trực tiếp: `journalctl -u vpao -f`. Sau khi sửa `config.json` hoặc `~/.vpao.env`: `sudo systemctl restart vpao`.

## Bước 8. Chạy agent trong tmux

Lần đầu **đăng nhập Claude Code** (làm tương tác, một lần):

```bash
cd ~/projects/shop-agent
tmux new -s agents
claude
```
Làm theo hướng dẫn trên màn hình để đăng nhập (nó in một đường link, bạn mở link ở trình duyệt trên PC, rồi dán mã lại). Khi `claude` đã chạy được, thoát ra (gõ `/exit`, rồi `exit` để đóng tmux).

Từ đó mở agent bằng script (chạy trong tmux nền, không cần giữ cửa sổ SSH):

```bash
cd ~/vanphong
deploy/agents-tmux.sh shop ~/projects/shop-agent
tmux attach -t agents      # xem phiên; rời ra mà phiên vẫn chạy: Ctrl+B rồi D
```
Một dự án nữa: `deploy/agents-tmux.sh backend ~/projects/backend`.

**Quan trọng, Claude phải chạy BÊN TRONG tmux** thì văn phòng mới biết pane của nó để gõ việc vào. Chạy `claude` thẳng trong SSH thì vẫn báo cáo và cảnh báo được, chỉ không gõ việc vào lúc rảnh được.

**Hộp xin quyền sẽ làm phiên đứng chờ** vì không ai ngồi bấm. Có ba cách, từ an toàn đến rủi ro:
1. Khai báo trước các lệnh được phép trong `~/projects/shop-agent/.claude/settings.json` (mục `permissions.allow`).
2. Chạy với chế độ cho phép sửa tệp tự động: `deploy/agents-tmux.sh shop ~/projects/shop-agent "claude --permission-mode acceptEdits"`.
3. `--dangerously-skip-permissions` (bỏ mọi hộp xin quyền). **Chỉ nên dùng trên VPS dùng riêng cho việc này, không chứa khóa hay dữ liệu quan trọng.** Agent làm được mọi thứ người `agent` làm được.

Sau khi VPS khởi động lại, tmux mất; mở lại bằng script, thêm `"claude --continue"` để nối tiếp phiên trước.

## Bước 9. Xem văn phòng từ PC

Mở đường hầm SSH (giữ cửa sổ PowerShell này mở), thay IP của bạn:

```powershell
ssh -L 7788:127.0.0.1:7788 agent@203.0.113.10
```
Rồi mở **http://localhost:7788** trên PC. (Nếu PC đang chạy văn phòng riêng ở cổng 7788 thì dừng nó, hoặc dùng `-L 7790:127.0.0.1:7788` và mở http://localhost:7790.)

## Bước 10. Thử

Trong chat với bot Telegram:
1. `/ds` phải liệt kê robot của phiên Claude đang chạy (sau khi bạn đã gõ ít nhất một câu vào phiên đó).
2. `/viec 1 hãy trả lời "đã nhận việc"`.
3. Nếu phiên đang rảnh và đã bật `tmuxDelivery`: bot trả lời "Đã gõ việc vào phiên ... (tmux %N)" và bạn thấy Claude làm ngay trong `tmux attach`. Nếu không: "Đã xếp hàng", việc được giao khi phiên chạy lượt tiếp theo.
4. Xong lượt, bot báo cáo.

## Bước 11 (tùy chọn). Xem văn phòng bằng tên miền riêng qua Cloudflare Tunnel

Thay cho đường hầm SSH ở bước 9: bạn mở `https://office.tên-miền-của-bạn.com` ở bất cứ đâu (điện thoại, máy khác). VPS **vẫn không mở cổng nào**: chương trình `cloudflared` trên VPS tự kết nối ra Cloudflare, Cloudflare chuyển yêu cầu về văn phòng. Tôi **không có quyền vào tài khoản Cloudflare của bạn**, nên các bước bấm trên web bạn tự làm.

**Cần có:** một tài khoản Cloudflare (miễn phí) và **một tên miền đã thêm vào Cloudflare** (đổi nameserver theo hướng dẫn của Cloudflare). Chưa có tên miền thì dùng đường hầm SSH ở bước 9, hoặc đường hầm nhanh `trycloudflare.com` của `scripts/xem-tren-dien-thoai.sh` (địa chỉ đổi mỗi lần chạy).

### 11a. Đặt khóa xem cho văn phòng (bắt buộc)
Văn phòng cho thấy hội thoại của các phiên AI nên **phải có khóa** trước khi mở ra Internet. Khi chưa có khóa, văn phòng từ chối mọi yêu cầu đến từ tên miền lạ.

```bash
cd ~/vanphong
node setup.js --yes --key "$(openssl rand -base64 18 | tr -d '/+=')"
sudo systemctl restart vpao
```
Lệnh in ra khóa (một chuỗi ngẫu nhiên). **Ghi lại khóa này**, nó giữ nguyên các cấu hình khác trong `config.json` (Telegram, tmux…).

### 11b. Tạo tunnel trên Cloudflare (làm trên web)
1. Vào **Cloudflare → Zero Trust** (tên menu có thể đổi theo thời gian; đường dẫn hiện nay là *Networks → Tunnels*). Lần đầu Cloudflare yêu cầu chọn gói (gói Free) và có thể đòi nhập thẻ để xác minh.
2. **Create a tunnel** → loại **Cloudflared** → đặt tên `vpao`.
3. Chọn hệ điều hành **Debian/Ubuntu** (và đúng kiểu CPU của VPS: `uname -m` in `x86_64` là 64-bit/amd64, `aarch64` là arm64). Trang hiện các lệnh cài; **ta không dùng lệnh `cloudflared service install <token>` họ hiển thị**, mà chỉ **sao chép token** (chuỗi rất dài sau chữ `install` hoặc `--token`).
4. Tab **Public hostname** (hoặc *Published application routes*) → **Add**: Subdomain `office`, Domain chọn tên miền của bạn, **Service type `HTTP`, URL `127.0.0.1:7788`**. Lưu.

### 11c. Cài cloudflared trên VPS và chạy như dịch vụ
Cài chương trình (chọn đúng kiểu CPU; amd64 cho `x86_64`, arm64 cho `aarch64`):

```bash
cd /tmp
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```
Lưu token (dán token vào chỗ dấu `...`), rồi bật dịch vụ:

```bash
cd ~/vanphong
cp deploy/cloudflared.env.example ~/.cloudflared.env && chmod 600 ~/.cloudflared.env
nano ~/.cloudflared.env        # điền: TUNNEL_TOKEN=...
sed -e "s|__USER__|agent|g" -e "s|__CLOUDFLARED__|$(command -v cloudflared)|g" deploy/cloudflared.service | sudo tee /etc/systemd/system/cloudflared-vpao.service >/dev/null
sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared-vpao
sudo systemctl status cloudflared-vpao --no-pager      # phải thấy "active (running)"
journalctl -u cloudflared-vpao -n 20 --no-pager         # tìm dòng "Registered tunnel connection"
```
Trên trang Cloudflare, tunnel `vpao` phải chuyển sang **Healthy**. Mở `https://office.tên-miền-của-bạn.com`, nhập khóa ở bước 11a.

### 11d. Thêm lớp bảo vệ Cloudflare Access (rất nên làm)
Khóa xem là lớp thứ hai. Lớp thứ nhất nên là **Cloudflare Access**: chỉ email của bạn mới thấy được trang đăng nhập.
1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. Application domain: `office.tên-miền-của-bạn.com`.
3. **Policy**: Action *Allow*, Include → *Emails* → email của bạn. Lưu.

Từ đó người lạ chỉ thấy trang đăng nhập Cloudflare, không chạm được tới văn phòng.

### Điều văn phòng vẫn giữ an toàn khi đi qua tunnel
Tôi đã có test kiểm tra: qua tunnel thì yêu cầu mang dấu của Cloudflare nên
- `/hook` (cổng nhận sự kiện từ Claude) **bị từ chối** dù có token: chỉ nhận từ chính VPS;
- nhắn tin cho agent từ trang web cần **PIN 6 số**, và PIN **không bao giờ hiện qua tunnel**. PIN chỉ đọc được trên VPS: `cat ~/.van-phong-ao/pin.txt` (qua SSH);
- cookie đăng nhập có thêm `Secure`, `HttpOnly`, `SameSite=Strict`; sai khóa 5 lần thì bị khóa 10 phút.

### Gỡ tunnel khi không dùng
```bash
sudo systemctl disable --now cloudflared-vpao
```
Rồi xóa tunnel và public hostname trên trang Cloudflare, và **thu hồi token** ở đó nếu nghi bị lộ.

---

## Giao việc cho phiên đang rảnh (tmux): chọn bật hay không

- **Bật (`tmuxDelivery: true`):** văn phòng gõ việc vào **ô nhập** của phiên Claude rồi nhấn Enter, như bạn tự gõ. Chỉ làm khi phiên **đã xong ít nhất một lượt và đang rảnh** (theo hook). Phiên đang làm hoặc đang chờ duyệt quyền thì **không** gõ (chữ gõ vào hộp xin quyền sẽ thành câu trả lời), việc được xếp hàng như thường.
- **Mọi thứ qua tmux đều không qua shell:** việc đi bằng `tmux send-keys -l` với đối số tách riêng, nên không chèn lệnh được. Văn bản bị gộp một dòng và bỏ ký tự điều khiển.
- **Rủi ro còn lại:** nếu Claude đang ở một màn hình đặc biệt mà hook không báo (ví dụ một menu `/` đang mở), chữ có thể vào sai chỗ. Chỉ bạn (đúng `chatId`) gửi lệnh được, nhưng nếu tài khoản Telegram của bạn bị chiếm thì kẻ đó điều khiển được agent. **Bật xác thực hai bước cho Telegram.**
- **Tắt (mặc định):** an toàn hơn, nhưng phiên rảnh hẳn sẽ không nhận việc cho tới khi bạn gõ gì đó vào phiên.

## Cập nhật sau này

```bash
cd ~/vanphong && git pull
node tools/hooks.js cai      # nếu bản mới thêm hook
sudo systemctl restart vpao
```

## Danh sách kiểm tra bảo mật

- [ ] Đăng nhập SSH bằng khóa, tắt mật khẩu; agent chạy bằng người `agent`, không bằng root.
- [ ] `ufw` chỉ mở SSH. Không mở cổng 7788.
- [ ] `~/.vpao.env` chmod 600; không đưa lên GitHub.
- [ ] Telegram bật xác thực hai bước.
- [ ] Nếu dùng Cloudflare Tunnel: đã đặt khóa xem (11a) và bật Cloudflare Access chỉ cho email của bạn (11d).
- [ ] Không để khóa quan trọng (khóa cloud, khóa thanh toán…) trên VPS mà agent đọc được, đặc biệt nếu dùng `--dangerously-skip-permissions`.
- [ ] Đặt `aiCapUsd` để được báo khi tiền AI hôm nay vượt 80%.

## Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| `systemctl status vpao` báo `failed` | `journalctl -u vpao -n 50 --no-pager` để xem lỗi. Thường là `config.json` sai JSON hoặc đường dẫn `node` sai. |
| Telegram không nhận lệnh, log có "xung đột" / 409 | Một văn phòng khác (trên PC) đang nhận tin của cùng bot. Dừng nó hoặc dùng bot khác. |
| `/ds` trống | Chưa có phiên nào hoạt động trong 24 giờ trong thư mục đã chọn. Gõ vào phiên Claude một câu, chờ vài giây. |
| `/viec` nói "chưa có hook" | Phiên được mở **trước khi** cài hook. Thoát phiên Claude rồi mở lại. |
| Bot nói "Đã xếp hàng" thay vì "Đã gõ việc" | `tmuxDelivery` chưa bật, Claude không chạy trong tmux, hoặc phiên đang làm/chờ duyệt. Xem log `journalctl -u vpao` dòng `tmux:`. |
| Phiên đứng yên không làm gì | Có thể đang chờ hộp xin quyền. `tmux attach -t agents` để xem; xem bước 8 về cách khai báo trước các quyền. |
| Mở tên miền ra lỗi 502/1033 | Tunnel chưa chạy hoặc `vpao` đang tắt. `systemctl status vpao cloudflared-vpao`, và kiểm tra Service là `HTTP` + `127.0.0.1:7788` ở trang Cloudflare. |
| Mở tên miền báo "Host không hợp lệ" | Chưa đặt khóa xem (11a): khi chưa có khóa, văn phòng từ chối tên miền lạ. Đặt khóa rồi `sudo systemctl restart vpao`. |
| `claude: command not found` trong tmux | Thiếu PATH. Thêm `export PATH=$HOME/.npm-global/bin:$PATH` vào `~/.bashrc` rồi mở lại tmux. |
