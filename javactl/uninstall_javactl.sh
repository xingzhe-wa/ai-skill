#!/bin/sh
set -eu

# 用法:
#   sh uninstall_javactl.sh [命令路径]
# 默认:
#   命令路径: /bin/javactl
# 会尝试清理:
#   - 目标命令文件
#   - ~/.bashrc
#   - ~/.bash_profile
#   - ~/.profile

DEST=${1:-/bin/javactl}
BASHRC=${HOME}/.bashrc
BASHPROFILE=${HOME}/.bash_profile
PROFILE=${HOME}/.profile
PATH_LINE='export PATH="$HOME/bin:$PATH"'

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 执行，或使用 sudo:" >&2
  echo "  sudo sh uninstall_javactl.sh" >&2
  exit 1
fi

if [ -e "$DEST" ]; then
  rm -f "$DEST"
  echo "已删除: $DEST"
else
  echo "未找到目标文件: $DEST"
fi

cleanup_path_line() {
  file="$1"
  if [ -f "$file" ]; then
    if grep -Fqx "$PATH_LINE" "$file"; then
      tmp="${file}.tmp.$$"
      grep -Fvx "$PATH_LINE" "$file" > "$tmp"
      mv "$tmp" "$file"
      echo "已清理 PATH 行: $file"
    fi
  fi
}

cleanup_path_line "$BASHRC"
cleanup_path_line "$BASHPROFILE"
cleanup_path_line "$PROFILE"

hash -r 2>/dev/null || true

echo "卸载完成"
echo "如当前终端仍显示旧命令，可重新登录或执行: hash -r"
