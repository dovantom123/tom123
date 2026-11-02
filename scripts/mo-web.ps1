# Mở văn phòng ảo 3D qua web (Cloudflare quick tunnel, không cần tên miền). Windows PowerShell.
#   powershell -ExecutionPolicy Bypass -File scripts\mo-web.ps1          (giữ khóa hiện có)
#   powershell -ExecutionPolicy Bypass -File scripts\mo-web.ps1 -DoiKhoa  (tạo khóa mới)
# Việc của script: bảo đảm có accessKey, cài cloudflared nếu thiếu (winget), mở máy chủ văn phòng ở cửa sổ riêng, mở tunnel.
# Khóa được CHÉP vào clipboard, không in ra màn hình. Địa chỉ trycloudflare.com đổi mỗi lần chạy.
param([switch]$DoiKhoa, [int]$Cong = 7790)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Buoc($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Buoc "1. Kiểm tra máy"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Chưa có Node.js. Cài bản LTS ở https://nodejs.org rồi chạy lại." -ForegroundColor Red; exit 1 }
Write-Host ("Node.js " + (node -v))

Buoc "2. Khóa xem văn phòng (accessKey)"
$args2 = @((Join-Path $root "scripts\dam-bao-khoa.cjs"))
if ($DoiKhoa) { $args2 += "--doi" }
$kq = & node @args2
if ($LASTEXITCODE -ne 0) { Write-Host "Không chuẩn bị được khóa. Xem thông báo ở trên." -ForegroundColor Red; exit 1 }
$kq = @($kq)
$khoa = $kq[1]
Set-Clipboard -Value $khoa
if ($kq[0] -eq "MOI") { Write-Host "Đã tạo khóa MỚI và ghi vào config.json." } else { Write-Host "Dùng khóa hiện có trong config.json." }
Write-Host "Khóa đã được CHÉP vào clipboard (không hiện trên màn hình). Dán vào ô 'Nhập khóa xem văn phòng' khi mở trang."
$khoa = $null

Buoc "3. Công cụ tunnel (cloudflared)"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Chưa có cloudflared. Đang cài bằng winget (Cloudflare.cloudflared)..."
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Chưa có cloudflared. Đóng PowerShell, mở lại rồi chạy lại script. Nếu vẫn lỗi: cài thủ công từ trang Cloudflare (cloudflared, Windows)." -ForegroundColor Yellow
  exit 1
}
Write-Host ("cloudflared " + ((cloudflared --version) -join " "))

Buoc "4. Mở máy chủ văn phòng (cửa sổ riêng, cổng $Cong)"
$env:PORT = "$Cong"
$srv = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds 3
if ($srv.HasExited) { Write-Host "Máy chủ văn phòng tắt ngay. Cổng $Cong có thể đang bận: chạy lại với -Cong 7791." -ForegroundColor Red; exit 1 }
Write-Host "Máy chủ đã chạy (PID $($srv.Id))."

Buoc "5. Mở tunnel"
Write-Host "Tìm dòng https://....trycloudflare.com trong log bên dưới, mở link đó, dán khóa (Ctrl+V) rồi bấm Vào xem."
Write-Host "Nhấn Ctrl+C để đóng tunnel; máy chủ văn phòng sẽ được tắt theo."
try { cloudflared tunnel --url "http://127.0.0.1:$Cong" }
finally { if ($srv -and -not $srv.HasExited) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue } }
