# Agent scripts

Run from the worktree root; dependencies must already be installed.

Claude tool hooks and session Node PATH: see [Hooks](guardrails.md#hooks).

- `scripts/agents/port.sh <cmd...>` waits for resources, locks a free slot, and sets `ASE_TEST_PORT`. Port rules below.
- `scripts/agents/timing.sh <cmd...>` holds all eight focused slot locks, then `5216`, for an exclusive timing run.
- `scripts/agents/cold.sh <worktree> <outprefix>` serves existing `dist` on `5216`, records the served index asset, measures five cold/warm runs with `ASE_COLD_NET=100/20`, waterfall and JSON; run through `timing.sh`.
- `scripts/agents/full-suite.sh [shards=3]` runs native-save shards in parallel with one worker each, separate artifacts, line logs and JSON; caps shards to currently free slots (at least one), prints the count, waits, summarizes, and fails if any shard fails. Each shard acquires any eligible slot through `port.sh`. `ASE_SHARDS` sets the default. Allow 25–50 minutes with 3 shards on a busy machine.
- `scripts/agents/reap.sh [--dry-run]` kills orphan test servers on unlocked slots; `--dry-run` lists them.
- `scripts/agents/worktree.sh <branch> [base=origin/dev]` creates a sibling worktree with shared dev `node_modules` and native-static fixture symlinks; records UTC time, `${ASE_OWNER:-unknown}`, branch and base in `.scratch/owner`, then prints its path. Set `ASE_OWNER` to the agent/thread identifier.
- `scripts/agents/worktrees.sh [--prune] [--older-than DAYS=3]` lists registered paths, branches, owners, dirtiness, commit age, merge state against local `origin/dev` or `origin/main`, and live cwd state from `/proc`. Listing is the default. Prune removes only clean, merged, inactive worktrees whose commit and creation ages exceed DAYS; unknown state is kept. Root, dev and locked worktrees are kept. It runs `git worktree prune` and keeps branches.
- `scripts/agents/tickets.mjs frontier [map]` prints open wayfinder tickets with all blockers closed, including builder and title; `check` validates statuses and same-map blocker slugs in both `tickets/` and `build/tickets/`, and fails with `file:line`. Lint runs the check.
- `scripts/agents/review.sh <worktree> <brief-file> <out-dir>` sends the brief through stdin to read-only `gpt-6.1-sol` at `medium`; verifies `REVIEW_STATUS: complete` and the logged model.
- `scripts/agents/suite-summary.mjs <results.json> [...]` merges shard counts and prints each failure's file, line, title and first error line; labels and separately counts matches in [tests/known-failures.json](../../tests/known-failures.json) as known flaky or known failing on dev. It exits non-zero for every failure, report error or unreadable input. Registry titles match exactly and survive line moves; line-only entries cover parameterized tests, and spec-only entries cover the file.
- `scripts/agents/ci-fonts.conf` is a fontconfig with only DejaVu Sans, as on the CI runners; `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` before a browser run uses it (cache in `~/.cache/fontconfig-ci`).
- `scripts/agents/land.sh [--branch dev]` locks the target branch, fetches and rebases, runs check, test and lint, then pushes; a non-fast-forward rejection retries up to three attempts. UI/build/package changes also run the byte budget through `port.sh`. Conflicts abort the rebase. Logs: `.scratch/land/<time>-<pid>/`. `--dry-run` stops before pushing and skips the budget unless `--budget` is added; start on a clean branch.
- `scripts/agents/deploy-preview.sh` locks preview deploys, refuses uncommitted changes, fetches and detaches at `origin/dev`, then deploys preview only. Prints `preview <version-id> <sha>`; full output: `.scratch/deploy/<time>-<pid>.log`.
- `scripts/agents/ci-status.sh [branch=dev] [--wait]` prints the latest run per workflow and fails for unsuccessful completed runs, with failed steps and the last 20 log lines. `--wait` checks only the current `origin/<branch>` head every 30 seconds, prints changes, and times out after 20 minutes; requires authenticated `gh`.

## Ports

Pool: eight slots, `5226 5236 5246 5256 5266 5276 5286 5296`. Each slot reserves its base port (native-save) and base + 1 (native-preview). `ASE_PORTS` selects only ports from this pool. Timing holds every pool lock, then `5216` (and checks `5217`); run cold measurements through `timing.sh`.

Gate: at least 4 GiB available memory and 1-minute load at most `nproc`; `ASE_MAX_LOAD` overrides the load limit. Unlocked slots with listeners are skipped, with PID/command when `ss -p` exposes them. Waiting reports memory, load or busy slots at most once per 60 seconds; busy locks report holder PID, cwd and command.

Ownership: lock files are `/tmp/ase-<base>.lock`, containing `pid cwd command`. `exec` keeps the lock and owner PID; the caller's process group owns its servers. Start a separate group (for example `setsid`) when you need to kill the whole run. Stop only your own processes. Test servers poll `ASE_TEST_OWNER_PID` every second and exit when the owner dies; demos without this variable retain their normal lifetime.

Reap: inspect `scripts/agents/reap.sh --dry-run` before cleaning leftovers. Default sends SIGTERM only to orphan listener PIDs and their descendants found through `/proc`, holding free slot locks during cleanup. Descendants are signalled before the listener. Ancestors and other process-group members survive; launcher wrappers may exit when their child dies. It covers pool base/+1 ports and `5216`/`5217`, preserves listeners outside unlocked slots and their descendants, and always leaves `5410` alone. It never expands the pool via `ASE_POOL`.

Tests: `ASE_LOCK_DIR` overrides `/tmp`; `ASE_POOL` is a test-only pool override for isolated high ports. Test-only `ASE_MIN_MEM_KB` overrides the 4194304 KiB memory threshold (`0` bypasses it); `ASE_PORT_POLL` overrides the 15-second resource/slot poll delay. Production runs use the fixed pool and default resource gates.

## Results

Each run of `full-suite.sh` writes to its own `.scratch/native-save/full-<time>-<pid>/` (printed at start): read `shard-k.log` there for progress, and `scripts/agents/suite-summary.mjs <run>/results-shard-*.json` for the combined result. Server output persists in `.scratch/<project>/server-<port>.log`, including stderr, even when the server dies. Configured JSON defaults to `.scratch/<selected-project>/results-<port>.json` (the first project, or native-save, for a multi-project run). CLI `--reporter` overrides the config: include `json` explicitly and set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the desired path, as `full-suite.sh` does.

The scripts assume Lex's layout: worktrees are siblings named `native-site-editor-*` under `~/Projects`, the dev worktree is `~/Projects/native-site-editor-dev`, and the native-static fixture lives in the root checkout's `.scratch/native-static-preview`.
