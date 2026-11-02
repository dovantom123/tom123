#!/usr/bin/env sh
# Mở một phiên Claude Code trong tmux để chạy 24/7 trên VPS và để văn phòng gõ được việc Telegram vào phiên khi nó rảnh.
#   deploy/agents-tmux.sh <tên-cửa-sổ> <thư-mục-dự-án> [lệnh]
# Ví dụ:
#   deploy/agents-tmux.sh shop ~/projects/shop-agent              # chạy: claude
#   deploy/agents-tmux.sh shop ~/projects/shop-agent "claude --continue"   # nối tiếp phiên trước (sau khi khởi động lại máy)
# Xem phiên: tmux attach -t agents   (rời ra mà phiên vẫn chạy: nhấn Ctrl+B rồi D)
set -eu
NAME=${1:-}; DIR=${2:-}; CMD=${3:-claude}
[ -n "$NAME" ] && [ -n "$DIR" ] || { echo "Dùng: $0 <tên-cửa-sổ> <thư-mục-dự-án> [lệnh]"; exit 1; }
[ -d "$DIR" ] || { echo "Không có thư mục: $DIR"; exit 1; }
command -v tmux >/dev/null 2>&1 || { echo "Chưa cài tmux (sudo apt install -y tmux)"; exit 1; }
S=${VPAO_TMUX:-agents}
if tmux has-session -t "$S" 2>/dev/null; then
  if tmux list-windows -t "$S" -F '#W' | grep -qx "$NAME"; then echo "Cửa sổ '$NAME' đã có trong tmux '$S'."; exit 0; fi
  tmux new-window -d -t "$S" -n "$NAME" -c "$DIR" "$CMD"
else
  tmux new-session -d -s "$S" -n "$NAME" -c "$DIR" "$CMD"
fi
echo "Đã mở '$NAME' trong tmux '$S' ($DIR). Xem: tmux attach -t $S"
