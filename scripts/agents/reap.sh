#!/usr/bin/env bash
# Usage: reap.sh [--dry-run]; kill orphan listeners and descendants on unlocked test slots.
set -euo pipefail
[[ $# == 0 || ( $# == 1 && $1 == --dry-run ) ]] || { echo "Usage: reap.sh [--dry-run]" >&2; exit 2; }
dry_run=false
[[ $# == 0 ]] || dry_run=true
# Reaping always uses the real pool, even when test overrides are in the environment.
ASE_POOL="5226 5236 5246 5256 5266 5276 5286 5296" ASE_PORTS= source "$(dirname "${BASH_SOURCE[0]}")/port-common.sh"
free_slots=()
for p in "${pool[@]}" 5216; do
  exec {slot_fd}>>"$lock_dir/ase-$p.lock"
  if flock -n "$slot_fd"; then
    free_slots+=("$p")
  else
    exec {slot_fd}>&-
  fi
  # Hold free locks through inspection and signalling, so a new run cannot claim them.
done
listeners=$(ss -Hltnp) || { echo "reap: ss failed" >&2; exit 1; }
declare -A orphan_ports protected children signalled
while read -r row; do
  address=$(awk '{print $4}' <<< "$row")
  port=${address##*:}
  allowed=false
  for slot in "${free_slots[@]}"; do
    if [[ $port == "$slot" || $port == "$(( slot + 1 ))" ]]; then allowed=true; break; fi
  done
  for pid in $(grep -oE 'pid=[0-9]+' <<< "$row" | cut -d= -f2 || true); do
    if $allowed; then orphan_ports[$pid]=$port; else protected[$pid]=1; fi
  done
done <<< "$listeners"

# Snapshot parent links from /proc. Command text never establishes ownership.
for file in /proc/[0-9]*/stat; do
  if ! { IFS= read -r stat < "$file"; } 2>/dev/null; then continue; fi
  pid=${file#/proc/}
  pid=${pid%/stat}
  # The parent PID follows state; the command may contain spaces or parentheses.
  read -r _ parent _ <<< "${stat##*) }"
  children[$parent]+=" $pid"
done

for listener in "${!orphan_ports[@]}"; do
  if [[ -n ${protected[$listener]:-} ]]; then
    echo "reap: skipped pid $listener (listener outside orphan slots)"
    continue
  fi
  tree=("$listener")
  for (( i=0; i<${#tree[@]}; i++ )); do
    for pid in ${children[${tree[i]}]:-}; do
      # Preserve listeners on held slots or outside the pool, and their children.
      [[ -z ${protected[$pid]:-} ]] || continue
      tree+=("$pid")
    done
  done
  # Signal descendants first, before the listener's death can reparent them.
  for (( i=${#tree[@]}-1; i>=0; i-- )); do
    pid=${tree[i]}
    (( pid > 1 )) && [[ -z ${signalled[$pid]:-} ]] || continue
    signalled[$pid]=1
    command=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    if $dry_run; then
      echo "reap: would kill pid $pid, listener $listener, port ${orphan_ports[$listener]}: $command"
    elif kill -TERM -- "$pid" 2>/dev/null; then
      echo "reap: killed pid $pid, listener $listener, port ${orphan_ports[$listener]}: $command"
    fi
  done
done
