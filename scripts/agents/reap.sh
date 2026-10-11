#!/usr/bin/env bash
# Usage: reap.sh [--dry-run]; kill orphan test server groups on unlocked test slots.
set -euo pipefail
[[ $# == 0 || ( $# == 1 && $1 == --dry-run ) ]] || { echo "Usage: reap.sh [--dry-run]" >&2; exit 2; }
dry_run=false
[[ $# == 0 ]] || dry_run=true
# Reaping always uses the real pool, even when test overrides are in the environment.
ASE_POOL="5226 5236 5246 5256 5266 5276 5286 5296" ASE_PORTS= source "$(dirname "${BASH_SOURCE[0]}")/port-common.sh"
free_slots=()
owned_groups=()
for p in "${pool[@]}" 5216; do
  exec {slot_fd}>>"$lock_dir/ase-$p.lock"
  if flock -n "$slot_fd"; then
    free_slots+=("$p")
  else
    if read -r holder _ < "$lock_dir/ase-$p.lock" && [[ $holder =~ ^[0-9]+$ ]]; then
      holder_group=$(ps -p "$holder" -o pgid= | tr -d ' ' || true)
      owned_groups+=("$holder_group")
    fi
    exec {slot_fd}>&-
  fi
  # Hold free locks through inspection and signalling, so a new run cannot claim them.
done
listeners=$(ss -Hltnp) || { echo "reap: ss failed" >&2; exit 1; }
own_group=$(ps -p $$ -o pgid= | tr -d ' ')
groups=()
for p in "${free_slots[@]}"; do
  for port in "$p" "$(( p + 1 ))"; do
    rows=$(awk -v port="$port" '$4 ~ (":" port "$")' <<< "$listeners")
    for pid in $(grep -oE 'pid=[0-9]+' <<< "$rows" | cut -d= -f2 || true); do
      group=$(ps -p "$pid" -o pgid= | tr -d ' ' || true)
      [[ $group =~ ^[0-9]+$ ]] && (( group > 1 )) || continue
      [[ $group != "$own_group" && " ${groups[*]} " != *" $group "* && " ${owned_groups[*]} " != *" $group "* ]] || continue
      groups+=("$group")
      safe=true
      # A shared group with a listener outside free slots belongs to someone else.
      while read -r row; do
        address=$(awk '{print $4}' <<< "$row")
        listener_port=${address##*:}
        allowed=false
        for slot in "${free_slots[@]}"; do
          if [[ $listener_port == "$slot" || $listener_port == "$(( slot + 1 ))" ]]; then allowed=true; break; fi
        done
        if ! $allowed; then
          for other in $(grep -oE 'pid=[0-9]+' <<< "$row" | cut -d= -f2 || true); do
            other_group=$(ps -p "$other" -o pgid= | tr -d ' ' || true)
            if [[ $other_group == "$group" ]]; then safe=false; fi
          done
        fi
      done <<< "$listeners"
      if ! $safe; then echo "reap: skipped group $group (listener outside orphan slots)"; continue; fi
      command=$(ps -p "$pid" -o args= || true)
      if $dry_run; then
        echo "reap: would kill group $group, port $port, pid $pid: $command"
      elif kill -TERM -- "-$group" 2>/dev/null; then
        echo "reap: killed group $group, port $port, pid $pid: $command"
      fi
    done
  done
done
