#!/bin/sh
set -eu

# 用法:
#   sh install_javactl.sh [源脚本路径] [安装路径]
# 默认:
#   源脚本: /data/crew/backend/0000Admin/javactl.sh
#   目标路径: /bin/javactl

SRC=${1:-/data/crew/backend/0000Admin/javactl.sh}
DEST=${2:-/bin/javactl}
DEST_DIR=${DEST%/*}

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 执行，或使用 sudo:" >&2
  echo "  sudo sh install_javactl.sh" >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "源文件不存在: $SRC" >&2
  exit 1
fi

if [ ! -r "$SRC" ]; then
  echo "源文件不可读: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
chmod 755 "$DEST"

if [ ! -x "$DEST" ]; then
  echo "安装失败，目标文件不可执行: $DEST" >&2
  exit 1
fi

case ":$PATH:" in
  *:"$DEST_DIR":*) ;;
  *)
    echo "警告: $DEST_DIR 不在当前 PATH 中" >&2
    echo "当前终端可先执行: export PATH=\"$DEST_DIR:\$PATH\"" >&2
    ;;
esac

if command -v javactl >/dev/null 2>&1; then
  echo "安装成功: $(command -v javactl)"
else
  echo "安装成功: $DEST"
  echo "当前 shell 尚未找到 javactl。请执行下面任一方式:" 
  echo "  hash -r 2>/dev/null || true"
  echo "  export PATH=\"$DEST_DIR:\$PATH\""
  echo "或者重新登录服务器。"
fi

echo "验证命令: javactl --help"
