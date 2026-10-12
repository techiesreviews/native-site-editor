# Agent scripts

Run from the worktree root; dependencies must already be installed.

Agent tool hooks and session Node PATH: see [Hooks](guardrails.md#hooks).

- `scripts/agents/port.sh <cmd...>` waits for resources, locks a free slot, and sets `ASE_TEST_PORT`. Port rules below.
- `scripts/agents/timing.sh <cmd...>` holds all eight focused slot locks, then `5216`, for an exclusive timing run.
- `scripts/agents/cold.sh <worktree> <outprefix>` serves existing `dist` on `5216`, records the served index asset, measures five cold/warm runs with `ASE_COLD_NET=100/20`, waterfall and JSON; run through `timing.sh`.
- `scripts/agents/full-suite.sh [shards=3]` runs native-save shards in parallel with one worker each, separate artifacts, line logs and JSON; caps shards to currently free slots (at least one), prints the count, waits, summarizes, and fails if any shard fails. Each shard acquires any eligible slot through `port.sh`. `ASE_SHARDS` sets the default. Allow 25–50 minutes with 3 shards on a busy machine.
- `scripts/agents/reap.sh [--dry-run]` kills orphan test servers on unlocked slots; `--dry-run` lists them.
- `scripts/agents/worktree.sh <branch> [base=origin/dev]` creates a sibling worktree with shared dev `node_modules` and native-static fixture symlinks; records UTC time, `${ASE_OWNER:-unknown}`, branch and base in `.scratch/owner`, then prints its path. Set `ASE_OWNER` to the agent/thread identifier.
- `scripts/agents/worktrees.sh [--prune] [--older-than DAYS=3]` lists registered paths, branches, owners, dirtiness, commit age, merge state against local `origin/dev` or `origin/main`, and live cwd state from `/proc`. Listing is the default. Prune removes only clean, merged, inactive worktrees whose commit and creation ages exceed DAYS; unknown state is kept. Root, dev and locked worktrees are kept. It runs `git worktree prune` and keeps branches.
- `scripts/agents/tickets.mjs frontier [map]` prints open wayfinder tickets with all blockers closed, including builder and title; `check` validates statuses and same-map blocker slugs in both `tickets/` and `build/tickets/`, and fails with `file:line`. Lint runs the check.
- `scripts/agents/review.sh <worktree> <brief-file> <out-dir>` wraps the agent runner in review mode; copies `out.md` to `<out-dir>/result.md` and `run.log` there, and verifies `REVIEW_STATUS: complete`. Model and CLI overrides below apply.
- `scripts/agents/review-brief.sh <ticket-file> [base=origin/dev]` prints the standard slice brief: diff scope, ticket/linked spec, standards, finding format and the author's validation contract. Review completion accepts the first non-blank line, stripping a leading BOM or markdown fence.
- `scripts/agents/agent.sh build|review <worktree> <brief> [--model M] [--cli codex|claude] [--effort E]` runs the selected agent; defaults and adapters below.
- `scripts/agents/sol.sh <worktree> <brief-file> [effort=medium]` is a compatibility wrapper for `agent.sh build`; model/CLI environment overrides apply. Logs now live in `.scratch/agent/build/`.
- `scripts/agents/unit.sh [files...]` runs all unit tests via `npm test`, or selected files via `tsx --test`; prints pass/fail counts and each failure's name and first four error lines. Preserves the command's exit status; full log: `.scratch/unit/<time>-<pid>.log`.
- `scripts/agents/shots.sh <out-dir> <scratch-spec.spec.ts>` runs only that `.scratch/` scenario through a dedicated Playwright config on a `port.sh` slot. Serves the real starter over fake GitHub, stops its server on completion/failure, and prints PNG paths. Fixture: `${ASE_NATIVE_SAVE_FIXTURE:-$HOME/Projects/native-site-editor-starter}`; screenshot destination: `ASE_SHOTS_OUT_DIR`. Example below.
- `scripts/agents/suite-summary.mjs <results.json> [...]` merges shard counts and prints each failure's file, line, title and first error line; labels and separately counts matches in [tests/known-failures.json](../../tests/known-failures.json) as known flaky or known failing on dev. It exits non-zero for every failure, report error or unreadable input. Registry titles match exactly and survive line moves; line-only entries cover parameterized tests, and spec-only entries cover the file.
- `scripts/agents/ci-fonts.conf` is a fontconfig with only DejaVu Sans, as on the CI runners; `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` before a browser run uses it (cache in `~/.cache/fontconfig-ci`).
- `scripts/agents/land.sh [--branch dev]` locks the target branch, fetches and rebases, runs check, test and lint, then pushes; a non-fast-forward rejection retries up to three attempts. UI/build/package changes also run the byte budget through `port.sh`. Conflicts abort the rebase. Logs: `.scratch/land/<time>-<pid>/`. `--dry-run` stops before pushing and skips the budget unless `--budget` is added; start on a clean branch.
- `scripts/agents/deploy-preview.sh` locks preview deploys, refuses uncommitted changes, fetches and detaches at `origin/dev`, then deploys preview only. Prints `preview <version-id> <sha>`; full output: `.scratch/deploy/<time>-<pid>.log`.
- `scripts/agents/ci-status.sh [branch=dev] [--wait]` prints the latest run per workflow and fails for unsuccessful completed runs, with failed steps and the last 20 log lines. `--wait` checks only the current `origin/<branch>` head every 30 seconds, prints changes, and times out after 20 minutes; requires authenticated `gh`.

## Agent runner

Build and review default to `codex`, `gpt-6.1-sol`, effort `medium`. Set
`ASE_BUILD_MODEL` or `ASE_REVIEW_MODEL` to change the model. CLI precedence is
`--cli`, then `ASE_AGENT_CLI`, then model inference: `claude-*`, `opus`, `sonnet`,
`haiku`, `fable` select Claude; all others select Codex. `--model` overrides the
kind's environment default. `--effort` is passed to the selected CLI; the CLI/model
validates its supported levels.

Both modes read the brief on stdin with cwd set to the worktree. Build appends the
unstaged-work and validation contract. Both adapters verify the actual model
(Codex's `model:` log line; Claude's JSON `modelUsage` keys or `model` field).
Claude aliases permit their family; full names permit a dated snapshot suffix.
Missing metadata, fallback models, CLI errors and empty reports fail the run.
Outputs are `<worktree>/.scratch/agent/<build|review>/out.md` and `run.log`.
The runner prints the report and `git status --short`.

Codex build uses `workspace-write`, network access and `--add-dir` for the shared
Git directory; review uses `read-only`. Both automatically trust the vetted repo
hooks; interactive Codex asks once to approve new or changed hooks.
Claude build uses `acceptEdits` and adds the shared Git directory. Review uses
`default` permissions, exposes only Read/Grep/Glob/Bash, and allows only read tools
and Bash `git diff`, `git log`, `git show`. Claude returns JSON; the runner extracts
the result text. The lead commits builders' unstaged work.

`ASE_AGENT_TIMEOUT` defaults to `90m`, with legacy `SOL_TIMEOUT` as fallback.
Use positive integer seconds or `s/m/h/d` (at most 2147483 seconds). Expiry or
interruption kills the CLI's whole process group. Claude callers use
`run_in_background: true`; Codex callers wait in the foreground or its background
terminal. Helpers themselves stay in the foreground.

To add another CLI, add one adapter function in `agent-run.mjs` and register it in
the adapter registry (plus inference if wanted). Contract:
accept `{kind, worktree, model, effort}`, Git common dir and output path; return
`{command, args, capture, finish(stdout, runLog)}`. Read stdin; honor build versus
read-only review permissions; verify the actual model in `finish`. Return final
text, or null if the CLI wrote `out.md`. Set `capture` for stdout parsing. Shared
code owns cwd, brief/footer, logging, deadlines, cleanup and Git status. Add pure
argument/result tests plus fake CLI coverage; no other CLIs are installed here.
Instruction imports use `AGENTS.md`: `CLAUDE.md` and `GEMINI.md` contain `@AGENTS.md`.

## Screenshots

Write `.scratch/shots.spec.ts`; `shots.sh` supplies `baseURL` and `ASE_SHOTS_OUT_DIR`.
Run `scripts/agents/shots.sh .scratch/shots/example .scratch/shots.spec.ts`.
This 20-line scenario saves the editor and its Add panel:

```ts
import { expect, test } from "@playwright/test";
import { join } from "node:path";

test("starter screenshots", { tag: "@actual" }, async ({ page }) => {
  const out = process.env.ASE_SHOTS_OUT_DIR;
  if (!out) throw new Error("Run through shots.sh");
  await page.goto("/#repo=501&branch=main&file=index.html");
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const preview = page.frameLocator(".native-preview-frame");
  await expect(preview.locator("body")).toBeVisible();
  await page.screenshot({ path: join(out, "editor.png"), fullPage: true });

  const structure = page.getByRole("complementary", { name: "Page structure" });
  await expect(structure).toBeVisible();
  await structure.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to the page", exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: join(out, "add-panel.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});
```

## Ports

Pool: eight slots, `5226 5236 5246 5256 5266 5276 5286 5296`. Each slot reserves its base port (native-save) and base + 1 (native-preview). `ASE_PORTS` selects only ports from this pool. Timing holds every pool lock, then `5216` (and checks `5217`); run cold measurements through `timing.sh`.

Gate: at least 4 GiB available memory and 1-minute load at most `nproc`; `ASE_MAX_LOAD` overrides the load limit. Unlocked slots with listeners are skipped, with PID/command when `ss -p` exposes them. Waiting reports memory, load or busy slots at most once per 60 seconds; busy locks report holder PID, cwd and command.

Ownership: lock files are `/tmp/ase-<base>.lock`, containing `pid cwd command`. `exec` keeps the lock and owner PID; the caller's process group owns its servers. Start a separate group (for example `setsid`) when you need to kill the whole run. Stop only your own processes. Test servers poll `ASE_TEST_OWNER_PID` every second and exit when the owner dies; demos without this variable retain their normal lifetime.

Reap: inspect `scripts/agents/reap.sh --dry-run` before cleaning leftovers. Default sends SIGTERM only to orphan listener PIDs and their descendants found through `/proc`, holding free slot locks during cleanup. Descendants are signalled before the listener. Ancestors and other process-group members survive; launcher wrappers may exit when their child dies. It covers pool base/+1 ports and `5216`/`5217`, preserves listeners outside unlocked slots and their descendants, and always leaves `5410` alone. It never expands the pool via `ASE_POOL`.

Tests: `ASE_LOCK_DIR` overrides `/tmp`; `ASE_POOL` is a test-only pool override for isolated high ports. Test-only `ASE_MIN_MEM_KB` overrides the 4194304 KiB memory threshold (`0` bypasses it); `ASE_PORT_POLL` overrides the 15-second resource/slot poll delay. Production runs use the fixed pool and default resource gates.

## Results

Each run of `full-suite.sh` writes to its own `.scratch/native-save/full-<time>-<pid>/` (printed at start): read `shard-k.log` there for progress, and `scripts/agents/suite-summary.mjs <run>/results-shard-*.json` for the combined result. Server output persists in `.scratch/<project>/server-<port>.log`, including stderr, even when the server dies. Configured JSON defaults to `.scratch/<selected-project>/results-<port>.json` (the first project, or native-save, for a multi-project run). CLI `--reporter` overrides the config: include `json` explicitly and set `PLAYWRIGHT_JSON_OUTPUT_FILE` to the desired path, as `full-suite.sh` does.

The scripts assume Lex's layout: worktrees are siblings named `native-site-editor-*` under `~/Projects`, the dev worktree is `~/Projects/native-site-editor-dev`, and the native-static fixture lives in the root checkout's `.scratch/native-static-preview`.
