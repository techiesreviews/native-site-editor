#!/usr/bin/env bash
# Usage: full-suite.sh [shards=3]; parallel native-save shards, separate logs and JSON.
set -euo pipefail
[[ $# -le 1 ]] || { echo "Usage: full-suite.sh [shards=3]" >&2; exit 2; }
shards=${1:-3}
[[ $shards =~ ^[1-9][0-9]*$ ]] || { echo "Invalid shard count: $shards" >&2; exit 2; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
mkdir -p .scratch/native-save
pids=()
results=()
cleanup() {
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
start=$SECONDS
for (( k=1; k<=shards; k++ )); do
  result=".scratch/native-save/results-shard-$k.json"
  rm -f "$result"
  results+=("$result")
  PLAYWRIGHT_JSON_OUTPUT_FILE="$root/$result" setsid scripts/agents/port.sh \
    ./node_modules/.bin/playwright test --project=native-save --shard="$k/$shards" \
    --workers=1 --reporter=line,json --output=".scratch/native-save/artifacts-shard-$k" \
    > ".scratch/native-save/shard-$k.log" 2>&1 &
  pids+=("$!")
done
status=0
for pid in "${pids[@]}"; do
  if wait "$pid"; then :; else status=1; fi
done
pids=()
node scripts/agents/suite-summary.mjs "${results[@]}" || status=1
echo "Wall time: $(( SECONDS - start )) seconds"
exit "$status"
