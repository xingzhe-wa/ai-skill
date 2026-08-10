#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
用法:
  javactl                 # 简洁列出 Java 进程、监听端口和部署位置
  javactl list            # 同上
  javactl list --detail   # 同时显示完整 JVM 命令
  javactl kill PID        # 二次确认后直接 kill -9
  javactl kill 关键字     # 按关键字匹配后选择并结束
  javactl 关键字          # 等同于 kill 关键字

快捷命令:
  直接输入进程名或关键字即可 kill
  也可以先用 javactl list 查 PID，再用 javactl kill PID
EOF
}

have() {
  command -v "$1" >/dev/null 2>&1
}

declare -A PID_PORTS=()
PORT_CACHE_LOADED=false

add_pid_port() {
  local pid="$1" port="$2" current="${PID_PORTS[$pid]:-}"
  [[ -n "$pid" && -n "$port" ]] || return 0
  [[ "$port" =~ ^[0-9]+$ ]] || return 0

  if [[ -z "$current" ]]; then
    PID_PORTS[$pid]="$port"
  elif [[ ",$current," != *",$port,"* ]]; then
    PID_PORTS[$pid]="$current,$port"
  fi
}

load_port_cache() {
  [[ "$PORT_CACHE_LOADED" == true ]] && return 0
  PORT_CACHE_LOADED=true

  if have lsof; then
    while read -r pid port; do
      add_pid_port "$pid" "$port"
    done < <(
      lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null |
        awk 'NR > 1 && match($0, /:([0-9]+) \(LISTEN\)/, m) { print $2, m[1] }'
    )
  fi

  if have ss; then
    while read -r pid port; do
      add_pid_port "$pid" "$port"
    done < <(
      ss -ltnp 2>/dev/null |
        awk '
          NR > 1 && match($4, /:([0-9]+)$/, p) && match($0, /pid=([0-9]+)/, id) {
            print id[1], p[1]
          }
        '
    )
  fi
}

ports_from_pid() {
  local pid="$1"
  load_port_cache
  printf '%s' "${PID_PORTS[$pid]:--}"
}

process_rows() {
  ps -ef
}

parse_ps_ef_row() {
  local line="$1" _ppid _c _tty _time
  read -r ROW_USER ROW_PID _ppid _c ROW_START _tty _time ROW_CMD <<<"$line"
}

app_name_from_cmd() {
  local cmd="$1" name="" jar=""

  if [[ "$cmd" =~ -Dname=([^[:space:]]+) ]]; then
    name="${BASH_REMATCH[1]}"
  elif [[ "$cmd" =~ --name=([^[:space:]]+) ]]; then
    name="${BASH_REMATCH[1]}"
  elif [[ "$cmd" =~ -jar[[:space:]]+([^[:space:]]+) ]]; then
    jar="${BASH_REMATCH[1]}"
    name="${jar##*/}"
    name="${name%.jar}"
  else
    local token
    for token in $cmd; do
      [[ "$token" == java || "$token" == */java ]] && continue
      [[ "$token" == -* ]] && continue
      name="${token##*.}"
      break
    done
  fi

  printf '%s' "${name:-unknown}"
}

location_from_cmd() {
  local cmd="$1" location=""

  if [[ "$cmd" =~ -jar[[:space:]]+([^[:space:]]+) ]]; then
    location="${BASH_REMATCH[1]}"
    location="${location%/boot/*}"
  elif [[ "$cmd" =~ -Dspring\.config\.location=([^[:space:]]+) ]]; then
    location="${BASH_REMATCH[1]}"
    location="${location%/config/*}"
  elif [[ "$cmd" =~ -cp[[:space:]]+[^[:space:]]*:([^[:space:]]+) ]]; then
    location="${BASH_REMATCH[1]}"
    location="${location%/config/*}"
  fi

  printf '%s' "${location:--}"
}

print_footer() {
  cat <<'EOF'

快捷命令:
  1) 直接输入进程名或关键字: javactl tg-admin
  2) 按 PID 杀进程: javactl kill 2588
EOF
}

list_processes() {
  local detail="${1:-false}" line exe name ports location
  local -a rows=()
  load_port_cache

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    parse_ps_ef_row "$line"
    exe="${ROW_CMD%% *}"
    exe="${exe##*/}"
    [[ "$exe" == java || "$exe" == java[0-9]* ]] || continue

    name="$(app_name_from_cmd "$ROW_CMD")"
    ports="$(ports_from_pid "$ROW_PID")"
    location="$(location_from_cmd "$ROW_CMD")"
    rows+=("$name"$'\t'"$ROW_PID"$'\t'"$ROW_START"$'\t'"$ports"$'\t'"$location"$'\t'"$ROW_CMD")
  done < <(process_rows)

  printf '%-8s %-12s %-18s %-42s %s\n' PID START PORTS NAME LOCATION
  printf '%-8s %-12s %-18s %-42s %s\n' ----- ------------ ------------------ ------------------------------------------ --------

  if ((${#rows[@]} > 0)); then
    while IFS=$'\t' read -r name pid start ports location cmd; do
      printf '%-8s %-12s %-18s %-42s %s\n' "$pid" "$start" "$ports" "$name" "$location"
      if [[ "$detail" == true ]]; then
        printf '  CMD: %s\n' "$cmd"
      fi
    done < <(printf '%s\n' "${rows[@]}" | sort -t $'\t' -k1,1)
  fi

  [[ "$detail" == false ]] && print_footer
}

get_cmd_for_pid() {
  local pid="$1" line
  line="$(ps -ef | awk -v pid="$pid" '$2 == pid {print; exit}')"
  [[ -n "$line" ]] || return 1
  parse_ps_ef_row "$line"
  printf '%s' "$ROW_CMD"
}

select_pid_by_keyword() {
  local keyword="$1" line name ports haystack
  local -a pids=() lines=()
  load_port_cache

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    parse_ps_ef_row "$line"
    local exe="${ROW_CMD%% *}"
    exe="${exe##*/}"
    [[ "$exe" == java || "$exe" == java[0-9]* ]] || continue
    name="$(app_name_from_cmd "$ROW_CMD")"
    ports="$(ports_from_pid "$ROW_PID")"
    haystack="$ROW_PID $ROW_USER $name $ports $ROW_CMD"
    if [[ "$haystack" == *"$keyword"* ]]; then
      pids+=("$ROW_PID")
      lines+=("$ROW_PID|$ROW_USER|$ports|$name|$(location_from_cmd "$ROW_CMD")")
    fi
  done < <(process_rows)

  ((${#pids[@]} > 0)) || { echo "未找到匹配关键字: $keyword" >&2; return 1; }

  if ((${#pids[@]} == 1)); then
    printf '%s\n' "${pids[0]}"
    return 0
  fi

  echo "找到多个匹配项，请选择：" >&2
  local i=1 item pid user ports name location
  for item in "${lines[@]}"; do
    IFS='|' read -r pid user ports name location <<<"$item"
    printf '  [%d] PID=%s USER=%s PORTS=%s NAME=%s LOCATION=%s\n' "$i" "$pid" "$user" "$ports" "$name" "$location" >&2
    i=$((i + 1))
  done

  local choice
  read -r -p '选择序号: ' choice
  [[ "$choice" =~ ^[0-9]+$ ]] && ((choice >= 1 && choice <= ${#pids[@]})) || { echo '选择无效' >&2; return 1; }
  printf '%s\n' "${pids[$((choice - 1))]}"
}

kill_pid() {
  local pid="$1" cmd
  cmd="$(get_cmd_for_pid "$pid")"
  [[ -n "$cmd" ]] || { echo "进程不存在: $pid" >&2; return 1; }
  echo "准备结束 PID=$pid"
  echo "NAME: $(app_name_from_cmd "$cmd")"
  echo "CMD: $cmd"
  read -r -p '确认直接执行 kill -9？[y/N] ' answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo '已取消'; return 0; }
  kill -9 "$pid"
  echo '已退出'
}

kill_by_pid() {
  local pid="$1" cmd
  cmd="$(get_cmd_for_pid "$pid")"
  [[ -n "$cmd" ]] || { echo "进程不存在: $pid" >&2; return 1; }
  kill_pid "$pid"
}

main() {
  case "${1:-list}" in
    -h|--help|help)
      usage
      ;;
    list)
      [[ "${2:-}" == --detail ]] && list_processes true || list_processes false
      ;;
    kill)
      shift
      [[ $# -gt 0 ]] || { usage >&2; exit 1; }
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        kill_by_pid "$1"
      else
        kill_pid "$(select_pid_by_keyword "$*")"
      fi
      ;;
    *)
      kill_pid "$(select_pid_by_keyword "$*")"
      ;;
  esac
}

main "$@"
