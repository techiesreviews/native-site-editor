#!/usr/bin/env bash
# Usage: source port-common.sh; shared slot checks for agent scripts.
set -euo pipefail
# ASE_POOL is a test-only override; production callers use this fixed pool.
read -r -a pool <<< "${ASE_POOL:-5226 5236 5246 5256 5266 5276 5286 5296}"
read -r -a ports <<< "${ASE_PORTS:-${pool[*]}}"
lock_dir=${ASE_LOCK_DIR:-/tmp}
mkdir -p "$lock_dir"
command -v ss >/dev/null || { echo "port: ss is required" >&2; exit 2; }
seen=()
for p in "${pool[@]}"; do
  [[ $p =~ ^[1-9][0-9]{0,4}$ ]] && (( p < 65535 )) || { echo "Invalid pool port: $p" >&2; exit 2; }
  [[ " ${seen[*]} " != *" $p "* ]] || { echo "Duplicate pool port: $p" >&2; exit 2; }
  seen+=("$p")
  for q in "${pool[@]}"; do
    (( p + 1 != q )) || { echo "Overlapping pool slots: $p $q" >&2; exit 2; }
  done
done
(( ${#ports[@]} )) || { echo "port: ASE_PORTS must name pool ports" >&2; exit 2; }
for p in "${ports[@]}"; do
  [[ " ${pool[*]} " == *" $p "* ]] || { echo "port: ASE_PORTS port $p is outside pool (${pool[*]})" >&2; exit 2; }
done
next_status=0

slot_listeners() {
  slot_busy=
  local port listeners
  for port in "$1" "$(( $1 + 1 ))"; do
    listeners=$(ss -Hltnp "sport = :$port") || { echo "port: ss failed for $port" >&2; exit 1; }
    if [[ -n $listeners ]]; then
      # ss -p includes command and PID when the listener belongs to this user.
      slot_busy+="listener $port: ${listeners//$'\n'/; } "
    fi
  done
  [[ -n $slot_busy ]]
}

slot_holder() {
  local pid cwd command live
  if IFS=$'\t' read -r pid cwd command < "$lock_dir/ase-$1.lock" && [[ $pid =~ ^[0-9]+$ ]]; then
    live=$(ps -p "$pid" -o args= 2>/dev/null || true)
    slot_busy="slot $1: pid $pid cwd $cwd command ${live:-$command}"
  else
    slot_busy="slot $1: lock held (holder info pending)"
  fi
}

write_holder() {
  local command
  printf -v command '%q ' "$@"
  printf '%s\t%s\t%s\n' "$$" "$PWD" "${command% }" > "$lock_dir/ase-$p.lock"
}

load_limit() {
  max_load=${ASE_MAX_LOAD:-$(nproc)}
  [[ $max_load =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "Invalid ASE_MAX_LOAD: $max_load" >&2; exit 2; }
}

resource_wait() {
  local avail load
  avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  read -r load _ < /proc/loadavg
  wait_reason=
  if (( avail < 4194304 )); then wait_reason="memory ${avail} KiB < 4194304 KiB"; fi
  if awk -v load="$load" -v max="$max_load" 'BEGIN {exit !(load > max)}'; then
    wait_reason+="${wait_reason:+; }load $load > $max_load"
  fi
  [[ -n $wait_reason ]]
}

report_wait() {
  if (( SECONDS >= next_status )); then
    echo "port: waiting: $1" >&2
    next_status=$(( SECONDS + 60 ))
  fi
}
