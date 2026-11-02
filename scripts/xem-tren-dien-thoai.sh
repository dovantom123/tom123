#!/usr/bin/env sh
# Mở đường hầm Cloudflare (miễn phí, không cần tài khoản) để xem văn phòng trên điện thoại.
# Cài cloudflared một lần:  macOS: brew install cloudflared   ·   Linux: xem https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cd "$(dirname "$0")/.." || exit 1
[ -f config.json ] || { echo "Chưa có config.json. Chạy: npm run setup"; exit 1; }
if ! grep -q '"accessKey": *"[^"]' config.json; then
  echo "(!) config.json chưa có accessKey: ai có link cũng xem được văn phòng của bạn."
  echo "    Chạy lại npm run setup và trả lời 'c' ở câu xem trên điện thoại để tạo khóa."
  exit 1
fi
command -v cloudflared >/dev/null || { echo "Chưa có cloudflared (macOS: brew install cloudflared)"; exit 1; }
PORT=$(sed -n 's/.*"port": *\([0-9]*\).*/\1/p' config.json); PORT=${PORT:-7788}
echo "Đang mở đường hầm... mở link trycloudflare.com hiện ra trên điện thoại, nhập khóa xem một lần."
exec cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT"
