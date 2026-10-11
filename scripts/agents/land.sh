#!/usr/bin/env bash
# Usage: land.sh [--branch dev] [--dry-run [--budget]]; rebase, gate and land finished work.
set -euo pipefail
branch=dev
dry_run=0
budget=0
usage() { echo 'Usage: land.sh [--branch dev] [--dry-run [--budget]]' >&2; exit 2; }
while (( $# )); do
  case $1 in
    --branch) (( $# >= 2 )) || usage; branch=$2; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --budget) budget=1; shift ;;
    *) usage ;;
  esac
done
git check-ref-format "refs/heads/$branch" >/dev/null 2>&1 || usage
(( !budget || dry_run )) || usage
root=$(git rev-parse --show-toplevel)
cd "$root"
run=".scratch/land/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$run"
log="$run/lock.log"
problem() { echo "problem: $1"; tail -n 30 "$log"; exit 1; }
exec 9>"/tmp/ase-land-${branch//\//%2F}.lock"
flock 9 >"$log" 2>&1 || problem lock
step() {
  local name=$1; shift
  log="$run/$attempt-$name.log"
  "$@" >"$log" 2>&1 || problem "$name"
}
attempt=0
step branch git symbolic-ref --quiet HEAD
step status git status --porcelain
[[ ! -s $log ]] || problem 'uncommitted changes'
for attempt in 1 2 3; do
  step fetch git fetch -q origin
  log="$run/$attempt-rebase.log"
  if ! git rebase "origin/$branch" >"$log" 2>&1; then
    git diff --name-only --diff-filter=U >>"$log" 2>&1 || true
    # Keep the conflict list even after abort restores the finished branch.
    git rebase --abort >>"$log" 2>&1 || true
    problem rebase
  fi
  step check npm run check
  step test npm test
  step lint npm run lint
  step diff git diff --name-only --no-renames -z "origin/$branch" HEAD
  touches_ui=0
  while IFS= read -r -d '' file; do
    case $file in
      src/*|shared/*|public/*|index.html|vite.config.ts|vite-monaco-trim.ts|package*.json) touches_ui=1 ;;
    esac
  done <"$log"
  if (( touches_ui && (!dry_run || budget) )); then
    step budget scripts/agents/port.sh bash -c 'ASE_BUDGET_PORT=$ASE_TEST_PORT ASE_BUDGET_REPORT_ONLY=0 npm run test:budget'
  fi
  step sha git rev-parse HEAD
  sha=$(cat "$log")
  if (( dry_run )); then
    echo "dry-run $sha on $branch"
    exit 0
  fi
  log="$run/$attempt-push.log"
  if git push --porcelain origin "HEAD:refs/heads/$branch" >"$log" 2>&1; then
    echo "landed $sha on $branch"
    exit 0
  fi
  if (( attempt == 3 )) || ! grep -Eq '\[rejected\].*\((non-fast-forward|fetch first)\)' "$log"; then
    problem push
  fi
done
