#!/usr/bin/env bash
# Usage: [ASE_PORTS="5226 5236"] port.sh <cmd...>; wait for resources and a free slot.
# The caller's process group owns the servers. exec preserves the lock and PID.
set -euo pipefail
(( $# )) || { echo "Usage: port.sh <cmd...>" >&2; exit 2; }
source "$(dirname "${BASH_SOURCE[0]}")/port-common.sh"
load_limit
while true; do
  if resource_wait; then
    report_wait "$wait_reason"
  else
    busy=
    for p in "${ports[@]}"; do
      # Append opens without erasing another holder's metadata.
      exec 9>>"$lock_dir/ase-$p.lock"
      if flock -n 9; then
        if slot_listeners "$p"; then
          if (( SECONDS >= next_status )); then echo "port: skipping slot $p: $slot_busy" >&2; fi
        else
          write_holder "$@"
          export ASE_TEST_PORT=$p ASE_TEST_OWNER_PID=$$
          echo "port: running on $p" >&2
          exec "$@"
        fi
      else
        slot_holder "$p"
      fi
      busy+="${busy:+; }$slot_busy"
      exec 9>&-
    done
    report_wait "all slots busy; $busy"
  fi
  sleep 15
done
