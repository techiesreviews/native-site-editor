#!/usr/bin/env bash
# Usage: reap.sh [--dry-run]; kill orphan test servers on unlocked test slots.
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
# A listener alone cannot prove group ownership: agents and builds may have no socket.
processes=$(ps -eo pid=,ppid=,pgid=,args=) || { echo "reap: ps failed" >&2; exit 1; }
declare -A parents process_groups commands
while read -r pid parent group command; do
  [[ $pid =~ ^[0-9]+$ ]] || continue
  parents[$pid]=$parent
  process_groups[$pid]=$group
  commands[$pid]=$command
done <<< "$processes"

dedicated_group() {
  local group=$1 pid parent command launcher
  shift
  local -A allowed=()
  for pid in "$@"; do
    allowed[$pid]=1
    parent=${parents[$pid]:-}
    while [[ -n $parent && ${process_groups[$parent]:-} == "$group" ]]; do
      command=${commands[$parent]:-}
      launcher=${command%% *}
      launcher=${launcher##*/}
      # Only the server's explicit launcher chain is safe, never an interactive shell
      # or another node program that happens to have started the orphan server.
      case $launcher in node|nodejs|tsx|npm|npx|sh|bash|dash) ;; *) break ;; esac
      [[ $command == *tests/native-save/server.ts* ]] || break
      case $launcher in
        node|nodejs)
          [[ $command =~ ^[^[:space:]]+[[:space:]]+[^[:space:]]*(/tsx/dist/cli\.(mjs|cjs)|/node_modules/\.bin/tsx)[[:space:]] ]] || break ;;
        npm) [[ $command =~ ^[^[:space:]]+[[:space:]]+(exec|x)[[:space:]]+tsx[[:space:]] ]] || break ;;
        npx) [[ $command =~ ^[^[:space:]]+[[:space:]]+tsx[[:space:]] ]] || break ;;
        sh|bash|dash) [[ $command =~ [[:space:]]-c[[:space:]] ]] || break ;;
      esac
      [[ -z ${allowed[$parent]:-} ]] || break
      allowed[$parent]=1
      parent=${parents[$parent]:-}
    done
  done
  for pid in "${!process_groups[@]}"; do
    if [[ ${process_groups[$pid]} == "$group" && -z ${allowed[$pid]:-} ]]; then return 1; fi
  done
}

groups=()
for p in "${free_slots[@]}"; do
  for port in "$p" "$(( p + 1 ))"; do
    rows=$(awk -v port="$port" '$4 ~ (":" port "$")' <<< "$listeners")
    for pid in $(grep -oE 'pid=[0-9]+' <<< "$rows" | cut -d= -f2 || true); do
      group=${process_groups[$pid]:-}
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
            other_group=${process_groups[$other]:-}
            if [[ $other_group == "$group" ]]; then safe=false; fi
          done
        fi
      done <<< "$listeners"
      if ! $safe; then echo "reap: skipped group $group (listener outside orphan slots)"; continue; fi
      server_pids=()
      for other in $(grep -oE 'pid=[0-9]+' <<< "$listeners" | cut -d= -f2 | sort -u || true); do
        if [[ ${process_groups[$other]:-} == "$group" ]]; then server_pids+=("$other"); fi
      done
      command=${commands[$pid]}
      if dedicated_group "$group" "${server_pids[@]}"; then
        if $dry_run; then
          echo "reap: would kill group $group, port $port, pid $pid: $command"
        elif kill -TERM -- "-$group" 2>/dev/null; then
          echo "reap: killed group $group, port $port, pid $pid: $command"
        fi
      else
        echo "reap: group $group has unrelated members; signalling only orphan listener PIDs"
        for server_pid in "${server_pids[@]}"; do
          command=${commands[$server_pid]}
          if $dry_run; then
            echo "reap: would kill pid $server_pid, group $group: $command"
          elif kill -TERM -- "$server_pid" 2>/dev/null; then
            echo "reap: killed pid $server_pid, group $group: $command"
          fi
        done
      fi
    done
  done
done
