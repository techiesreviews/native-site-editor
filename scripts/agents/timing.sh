#!/usr/bin/env bash
# Usage: timing.sh <cmd...>; hold all focused test locks, then the cold-test lock.
set -euo pipefail
(( $# )) || { echo "Usage: timing.sh <cmd...>" >&2; exit 2; }
exec flock /tmp/ase-5226.lock flock /tmp/ase-5236.lock flock /tmp/ase-5246.lock flock /tmp/ase-5256.lock flock /tmp/ase-5216.lock "$@"
