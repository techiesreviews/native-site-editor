#!/usr/bin/env bash
# Usage: timing.sh <cmd...>; hold all focused test locks, then the cold-test lock.
set -euo pipefail
(( $# )) || { echo "Usage: timing.sh <cmd...>" >&2; exit 2; }
source "$(dirname "${BASH_SOURCE[0]}")/port-common.sh"
load_limit
# Keep every descriptor open across exec; acquire in pool order to avoid deadlocks.
for p in "${pool[@]}" 5216; do
  exec {slot_fd}>>"$lock_dir/ase-$p.lock"
  while true; do
    if flock -n "$slot_fd"; then
      if ! slot_listeners "$p"; then break; fi
      flock -u "$slot_fd"
    else
      slot_holder "$p"
    fi
    report_wait "$slot_busy"
    sleep "$port_poll"
  done
  write_holder "$@"
done
while resource_wait; do report_wait "$wait_reason"; sleep "$port_poll"; done
export ASE_TEST_OWNER_PID=$$ ASE_TEST_PORT=5216
exec "$@"
