#!/usr/bin/env bash
# Usage: [ASE_PORTS="5226 5236"] port.sh <cmd...>; wait for 4 GiB and a free port lock.
set -euo pipefail
(( $# )) || { echo "Usage: port.sh <cmd...>" >&2; exit 2; }
ports=${ASE_PORTS:-"5226 5236 5246 5256"}
for p in $ports; do
  [[ $p =~ ^[0-9]+$ ]] && (( p > 0 && p < 65535 )) || { echo "Invalid port: $p" >&2; exit 2; }
done
# exec preserves the lock and PID, so callers can terminate only their own process group.
while true; do
  avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  if (( avail >= 4194304 )); then
    for p in $ports; do
      exec 9>"/tmp/ase-$p.lock"
      if flock -n 9; then
        export ASE_TEST_PORT=$p
        echo "port: running on $p" >&2
        exec "$@"
      fi
      exec 9>&-
    done
  fi
  sleep 15
done
