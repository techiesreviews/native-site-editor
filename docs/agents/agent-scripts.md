# Agent scripts

Run from the worktree root; dependencies must already be installed. These scripts do not build, commit, push, merge, or deploy.

- `scripts/agents/port.sh <cmd...>` waits for at least 4 GiB available memory, locks the first available port in `5226 5236 5246 5256`, and sets `ASE_TEST_PORT`; override with `ASE_PORTS`.
- `scripts/agents/timing.sh <cmd...>` holds all four focused port locks, then `5216`, for an exclusive timing run.
- `scripts/agents/cold.sh <worktree> <outprefix>` serves existing `dist` on `5216`, records the served index asset, measures five cold/warm runs with `ASE_COLD_NET=100/20`, waterfall and JSON; run through `timing.sh`.
- `scripts/agents/full-suite.sh [shards=3]` runs native-save shards in parallel with one worker each, separate artifacts, line logs and JSON; waits, summarizes, and fails if any shard fails.
- `scripts/agents/worktree.sh <branch> [base=origin/dev]` creates a sibling worktree with shared dev `node_modules` and native-static fixture symlinks; prints its path.
- `scripts/agents/review.sh <worktree> <brief-file> <out-dir>` sends the brief through stdin to read-only `gpt-6.1-sol` at `medium`; verifies `REVIEW_STATUS: complete` and the logged model.
- `scripts/agents/suite-summary.mjs <results.json> [...]` merges shard counts and prints each failure's file, line, title and first error line; exits non-zero for failures, report errors, or unreadable input.
- `scripts/agents/ci-fonts.conf` is a fontconfig with only DejaVu Sans, as on the CI runners; `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` before a browser run uses it (cache in `~/.cache/fontconfig-ci`).

Each run of `full-suite.sh` writes to its own `.scratch/native-save/full-<time>-<pid>/` (printed at start): read `shard-k.log` there for progress, and `scripts/agents/suite-summary.mjs <run>/results-shard-*.json` for the combined result. Server output persists in `.scratch/<project>/server-<port>.log`, including stderr, even when the server dies. Configured JSON defaults to `.scratch/<selected-project>/results-<port>.json` (the first project, or native-save, for a multi-project run). CLI `--reporter` overrides the config: include `json` explicitly and set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the desired path, as `full-suite.sh` does.

The scripts assume Lex's layout: worktrees are siblings named `native-site-editor-*` under `~/Projects`, the dev worktree is `~/Projects/native-site-editor-dev`, and the native-static fixture lives in the root checkout's `.scratch/native-static-preview`.
