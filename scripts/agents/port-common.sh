#!/usr/bin/env bash
# Usage: source port-common.sh; shared slot checks for agent scripts.
set -euo pipefail
# ASE_POOL is a test-only override; production callers use this fixed pool.
read -r -a pool <<< "${ASE_POOL:-5226 5236 5246 5256 5266 5276 5286 5296}"
read -r -a ports <<< "${ASE_PORTS:-${pool[*]}}"
# Slot locks live in the repository's Git folder: every worktree of this repository shares it, so two of its runs
# never take the same slot, and the kit's key lock (kit pr's checks write only the worktree and the Git folder) keeps
# it writable where /tmp is read-only. Outside a Git checkout: /tmp.
if [[ -n ${ASE_LOCK_DIR:-} ]]; then
  lock_dir=$ASE_LOCK_DIR
elif git_common=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
  lock_dir=$git_common/ase-locks
else
  echo "port: no Git folder found; slot locks in /tmp" >&2
  lock_dir=/tmp
fi
mkdir -p "$lock_dir"
# Checkouts from before TOOLS-458 still lock slots in /tmp. Until none is left, a slot is taken only when its old /tmp
# lock is free too; flock needs only a read-only descriptor, so this works inside the key lock.
# ASE_LEGACY_LOCK_DIR is a test-only override.
legacy_lock_dir=${ASE_LEGACY_LOCK_DIR:-/tmp}
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
# Test-only overrides keep isolated allocation tests independent of host resources.
min_mem=${ASE_MIN_MEM_KB:-4194304}
port_poll=${ASE_PORT_POLL:-15}
[[ $min_mem =~ ^[0-9]+$ ]] || { echo "Invalid ASE_MIN_MEM_KB: $min_mem" >&2; exit 2; }
[[ $port_poll =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "Invalid ASE_PORT_POLL: $port_poll" >&2; exit 2; }

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

# slot_lock <port>: take the slot's lock (and its old /tmp lock) without waiting. On success the descriptors in
# slot_fd and legacy_fd stay open, holding the lock across exec, until slot_unlock. On failure nothing stays open and
# held_file names the lock file another run holds.
slot_lock() {
  local legacy=$legacy_lock_dir/ase-$1.lock
  held_file=$lock_dir/ase-$1.lock legacy_fd=
  # Append opens without erasing another holder's metadata.
  exec {slot_fd}>>"$held_file"
  flock -n "$slot_fd" || { slot_unlock; return 1; }
  # Create the old lock where /tmp is writable, so an older checkout always meets it; read it where /tmp is read-only.
  if [[ ! $legacy -ef $held_file ]] && { exec {legacy_fd}>>"$legacy" || exec {legacy_fd}<"$legacy"; } 2>/dev/null && ! flock -n "$legacy_fd"; then
    held_file=$legacy
    slot_unlock
    return 1
  fi
}

slot_unlock() {
  exec {slot_fd}>&-
  if [[ -n $legacy_fd ]]; then exec {legacy_fd}>&-; fi
  legacy_fd=
}

slot_holder() {
  local pid cwd command live
  if IFS=$'\t' read -r pid cwd command < "${held_file:-$lock_dir/ase-$1.lock}" && [[ $pid =~ ^[0-9]+$ ]]; then
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
  if awk -v avail="$avail" -v min="$min_mem" 'BEGIN {exit !(avail < min)}'; then
    wait_reason="memory ${avail} KiB < $min_mem KiB"
  fi
  if awk -v cur="$load" -v max="$max_load" 'BEGIN {exit !(cur > max)}'; then # "load" is a gawk builtin name
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
