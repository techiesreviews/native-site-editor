#!/usr/bin/env bash
# Usage: shots.sh <out-dir> <scratch-spec>; screenshot the real starter through a locked fake-GitHub server.
set -euo pipefail
[[ $# == 2 && -f $2 && $2 == *.spec.ts ]] || { echo "Usage: shots.sh <out-dir> <scratch-spec.spec.ts>" >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
spec=$(realpath "$2")
[[ $spec == "$root"/.scratch/* ]] || { echo "problem: scenario must live under $root/.scratch/" >&2; exit 2; }
export ASE_NATIVE_SAVE_FIXTURE=${ASE_NATIVE_SAVE_FIXTURE:-$HOME/Projects/native-site-editor-starter}
[[ -d $ASE_NATIVE_SAVE_FIXTURE ]] || { echo "problem: fixture missing: $ASE_NATIVE_SAVE_FIXTURE" >&2; exit 2; }
export ASE_NATIVE_SAVE_FIXTURE=$(realpath "$ASE_NATIVE_SAVE_FIXTURE")
mkdir -p "$1"
export ASE_SHOTS_OUT_DIR=$(realpath "$1") ASE_SHOTS_SPEC=$spec
# The dedicated config owns the server; Playwright stops its process group on
# success, failure or interruption before port.sh releases the slot lock.
status=0
"$root/scripts/agents/port.sh" "$root/node_modules/.bin/playwright" test \
  --config "$root/scripts/agents/shots.config.ts" --workers=1 || status=$?
find "$ASE_SHOTS_OUT_DIR" -type f -name '*.png' -print | sort
exit "$status"
