#!/usr/bin/env bash
# Usage: deploy-preview.sh; deploy origin/dev quietly from a clean detached checkout.
set -euo pipefail
(( $# == 0 )) || { echo 'Usage: deploy-preview.sh' >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
cd "$root"
mkdir -p .scratch/deploy
log=".scratch/deploy/$(date +%Y%m%d-%H%M%S)-$$.log"
problem() { echo "problem: $1"; tail -n 30 "$log"; exit 1; }
exec 9>/tmp/ase-deploy-preview.lock
flock 9 >"$log" 2>&1 || problem lock
git status --porcelain >"$log" 2>&1 || problem status
[[ ! -s $log ]] || problem 'uncommitted changes'
git fetch -q origin >>"$log" 2>&1 || problem fetch
git checkout -q --detach origin/dev >>"$log" 2>&1 || problem checkout
sha=$(git rev-parse HEAD 2>>"$log") || problem sha
NO_COLOR=1 CI=1 npm run deploy:preview >>"$log" 2>&1 || problem deploy
version=$(sed -nE 's/.*Version ID: *([[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}).*/\1/p' "$log" | tail -n 1)
[[ -n $version ]] || problem 'missing Version ID'
echo "preview $version $sha"
