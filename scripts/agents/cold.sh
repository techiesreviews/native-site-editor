#!/usr/bin/env bash
# Usage: timing.sh cold.sh <worktree> <outprefix>; measure existing dist, never build.
set -euo pipefail
[[ $# == 2 ]] || { echo "Usage: cold.sh <worktree> <outprefix>" >&2; exit 2; }
worktree=$(realpath "$1")
outprefix=$(realpath -m "$2")
mkdir -p "$(dirname "$outprefix")"
cd "$worktree"
srv=
cleanup() {
  if [[ -n $srv ]]; then
    kill -- "-$srv" 2>/dev/null || true
    wait "$srv" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=5216 setsid ./node_modules/.bin/tsx tests/native-save/server.ts > "$outprefix.server.log" 2>&1 &
srv=$!
ready=false
for (( i=0; i<100; i++ )); do
  if curl -fsS --max-time 2 http://127.0.0.1:5216/ -o "$outprefix.index.html" 2>/dev/null; then ready=true; break; fi
  sleep 0.2
done
$ready || { echo "Server did not become ready; see $outprefix.server.log" >&2; exit 1; }
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const p=process.argv[1]; const asset=readFileSync(p+".index.html","utf8").match(/index-[A-Za-z0-9_-]+\.js/); if (!asset) throw new Error("No served index asset"); writeFileSync(p+".served", asset[0]+"\n");' "$outprefix"
ASE_COLD_BASE=http://127.0.0.1:5216 ASE_COLD_NET=100/20 ASE_COLD_WATERFALL=1 ASE_COLD_JSON="$outprefix.json" ./node_modules/.bin/tsx tests/perf/cold-start.ts 5 > "$outprefix.txt" 2>&1
