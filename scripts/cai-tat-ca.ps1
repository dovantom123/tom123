# Cài và nối mọi thứ trên máy bạn trong MỘT lệnh có hỏi xác nhận từng bước (Windows PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts\cai-tat-ca.ps1
# Việc của script: cập nhật mã, (tùy chọn) cài Agent Reach, (tùy chọn) nối bot Telegram với Cloudflare Worker.
# Việc CHỈ bạn làm được: dán chuỗi bí mật vào Cloudflare và dán token bot (script hỏi đúng lúc, token nhập bằng ô ẩn).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Hoi($cau) { $a = Read-Host "$cau (c/k)"; return ($a.Trim().ToLower() -eq "c") }
function Buoc($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Buoc "0. Kiểm tra máy"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Chưa có Node.js. Cài bản LTS ở https://nodejs.org rồi chạy lại." -ForegroundColor Red; exit 1 }
Write-Host ("Node.js " + (node -v))
if (Get-Command git -ErrorAction SilentlyContinue) {
  if (Test-Path (Join-Path $root ".git")) { Write-Host "Đang cập nhật mã (git pull)..."; git pull --ff-only } else { Write-Host "Thư mục này không phải kho git, bỏ qua git pull." }
} else { Write-Host "Chưa có git, bỏ qua git pull." }

Buoc "1. Agent Reach (công cụ đọc YouTube, GitHub, Reddit... cho Claude Code)"
Write-Host "Sẽ chạy mã tải từ Internet: trình cài uv (astral.sh) và gói agent-reach.zip từ GitHub Releases."
Write-Host "Chỉ bật các kênh KHÔNG cần đăng nhập. Kênh cần đăng nhập sao chép phiên đăng nhập từ Chrome của bạn, nên bỏ qua hoặc dùng tài khoản phụ."
if (Hoi "Cài Agent Reach") {
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    if (-not (Hoi "Chưa có uv. Cài uv bằng trình cài chính thức của astral.sh")) { Write-Host "Bỏ qua Agent Reach (cần uv)." } else {
      powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
      $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
    }
  }
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
    if (-not (Get-Command agent-reach -ErrorAction SilentlyContinue)) { uv tool update-shell; $env:Path = "$env:USERPROFILE\.local\bin;$env:Path" }
    if (Get-Command agent-reach -ErrorAction SilentlyContinue) { agent-reach setup; Write-Host "Xem skill nằm đâu: agent-reach skill" } else { Write-Host "Chưa chạy được agent-reach. Mở PowerShell mới rồi gõ: agent-reach setup" -ForegroundColor Yellow }
  } else { Write-Host "Không có uv nên chưa cài được Agent Reach." -ForegroundColor Yellow }
}

Buoc "2. Nối bot Telegram với Cloudflare Worker"
Write-Host "Lệnh sẽ chép một chuỗi bí mật vào clipboard để bạn dán vào Cloudflare, rồi hỏi token bot (ô ẩn)."
if (Hoi "Nối bot Telegram ngay bây giờ") {
  $url = Read-Host "Địa chỉ Worker (Enter để dùng https://vpao-telegram.dohuydang1992.workers.dev)"
  if ([string]::IsNullOrWhiteSpace($url)) { $url = "https://vpao-telegram.dohuydang1992.workers.dev" }
  node (Join-Path $root "serverless\scripts\ket-noi.cjs") $url.Trim()
}

Buoc "Xong"
Write-Host "Thử trong bot Telegram: /start rồi /hoi repo này có những thư mục chính nào?"
Write-Host "Theo dõi lần chạy ở: https://github.com/dovantom123/tom123/actions"
