# Mở đường hầm Cloudflare (miễn phí, không cần tài khoản) để xem văn phòng trên điện thoại.
# Cần cài cloudflared một lần:  winget install --id Cloudflare.cloudflared
# Chạy (cửa sổ khác, sau khi đã npm start):  powershell -ExecutionPolicy Bypass -File scripts\xem-tren-dien-thoai.ps1
$cfg = Get-Content (Join-Path $PSScriptRoot "..\config.json") -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
if (-not $cfg) { Write-Host "Chưa có config.json. Chạy: npm run setup"; exit 1 }
if (-not $cfg.accessKey) {
  Write-Host "(!) config.json chưa có accessKey: ai có link cũng xem được văn phòng của bạn." -ForegroundColor Yellow
  Write-Host "    Chạy lại npm run setup và trả lời 'c' ở câu xem trên điện thoại để tạo khóa." -ForegroundColor Yellow
  exit 1
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) { Write-Host "Chưa có cloudflared. Cài bằng: winget install --id Cloudflare.cloudflared"; exit 1 }
$port = if ($cfg.port) { $cfg.port } else { 7788 }
Write-Host "Đang mở đường hầm... chờ dòng có chữ trycloudflare.com rồi mở link đó trên điện thoại, nhập khóa xem một lần."
cloudflared tunnel --no-autoupdate --url "http://localhost:$port"
