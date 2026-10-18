# Agent scripts

Run from the worktree root; dependencies must already be installed.
The order runners use these in: [runner.md](runner.md).

Agent tool hooks and session Node PATH: see [Hooks](guardrails.md#hooks).

## Kit

`scripts/agents/kit <command> [args]` is the front door. Bare `kit` lists the commands;
`kit <command> --help` prints that command's usage and is the source of truth for its flags.
Every run ends with one `RESULT: ok|fail …` line (the kit adds one when a command does not, or
is interrupted); exit 0 ok, 1 failure, 2 usage error. Each command is one file in
`scripts/agents/kit.d/` with a `# kit: <summary>` line and its own `tests/kit-<command>.test.ts`;
shared helpers live in `kit-lib.sh` and `kit-lib.mjs`. Owner: `ASE_OWNER`, else `.scratch/owner`.

- `kit doctor [--quiet]` checks place, base, hook config, live hooks, Node, `node_modules` and conflict markers, each ✗ with a fix. The base passes when the branch contains `origin/dev`, or its base was the dev tip less than 24 hours ago ("N commits behind; rebase before landing"; `kit pr` rebases). `agent.sh` runs `--quiet` on its worktree and exits 3 on failure.
- `kit review [--base REF | --commit SHA] [--ticket FILE] [--pr N]` runs one read-only review (default `--base origin/dev`; model `ASE_REVIEW_MODEL`, else `gpt-6.1-sol`; Codex gets a fresh `CODEX_HOME` with no skills, plugins or MCP servers). It saves `result.md`, `run.log`, `diff.patch` and `refs.txt` in the main root `.scratch/reviews/<owner>/<UTC time>/`, named in the RESULT line. An empty diff fails before the model; an incomplete answer is re-asked once.
- `kit pr [--base dev] [--title T] [--ticket FILE] [--no-merge] [--dry-run] [--release] [--full]` lands a branch. It refuses a detached HEAD, `dev`/`main`, a dirty tree and `--base main` without `--release`; runs `kit deps check`, rebases on `origin/<base>`, then prints `tier: <tier> (<why>)` for the PR's own diff and runs that tier's checks (`--dry-run` stops here). Tiers, highest present wins ([pr-tier.mjs](../../scripts/agents/pr-tier.mjs)): **docs** (only `*.md` and `docs/**`) runs `tickets.mjs check`, the doc-reading guard unit files and any unit file naming a changed docs path, with no review; **css** (only existing `*.css`) runs `check-colours.mjs` and `kit specs --affected`, and reminds you about `kit shots`; **tests** (only `tests/**`, `fixtures/**`) runs `npm run check`, the changed unit files plus those naming a changed helper or fixture (`unit.sh`), `npm run lint` and `kit specs --affected`; **full** (anything else, or `--full`) runs `npm run check`, `npm test`, `npm run lint` and `kit specs --affected`. The tier and skipped checks go in the PR body; CI still runs everything. It pushes, opens or reuses the PR, posts the newest saved review that covers this exact HEAD and merge base (else runs `kit review --pr N`; not for docs), waits with `kit wait ci --pr N`, and rebase-merges pinned to that head, deleting the branch. A "behind" refusal rebases and retries up to 3 times. `--release` opens `dev` → `main` and never merges. The `gh` token needs Pull requests: Read and write ([github-settings.md](github-settings.md)).
- `kit wait pid <pid>`, `kit wait output <file> [--until RE] [--quiet D]` and `kit wait ci [--branch B | --pr N | --sha S]`, each with `--timeout D` (default 30m), wait on a process, a log (until the regex, or until its writers exit and it stays unchanged for 5 s; prints its last 20 lines) or the CI runs of one head (failed steps and the last 20 log lines; a cancelled run on a moved head is followed as "superseded"). At most one status line a minute.
- `kit specs <spec…> | --affected [--base REF]` with `[--list]` runs browser specs by name, or those a diff against the merge-base reaches (reasons: import, fixture, removed string, defined string, name match; `--list` prints them and runs nothing). Each fixture group runs through `port.sh`; one ✓/✗ line per spec with known-failure labels from `ASE_KNOWN_FAILURES` (default `tests/known-failures.json`). Logs: `.scratch/kit-specs/run-*/`.
- `kit shots <screen…> | --steps FILE | --spec FILE` with `[--width W,…] [--theme T] [--out DIR] [--compare REF]` shoots named screens (13; bare `kit shots` lists them) on the real starter over fake GitHub, 390/768/1280 × light/dark by default, a failed screen retaken once. Output in the main root `.scratch/shots/<owner>/<time>/`: PNGs, webp copies under 40 KB, `contact.html`/`contact.webp`, `index.json`, and up to 20 layout findings (clipped, overlap, tap-target, contrast, overflow). `--compare` shoots the ref with today's tooling from a cached base worktree and pairs before | after rows.
- `kit size [--no-base] [--base REF]` builds and measures boot bytes before first paint against the base (default `origin/dev`) and fails above the 355 KB budget. Per-commit cache: main root `.scratch/size-cache/`.
- `kit deps check [--lock F] [--modules D]` compares the shared `node_modules` with the lockfile; `kit deps add <pkg>[@version] [--dev]` adds a package without npm ever writing to the shared folder.
- `kit status [map] [--ref REF] [--no-fetch]` prints one row per ticket (status, owner, LANDED commit and PR, CI) under a header with the ref's CI and the live preview bundle; offline it still prints the git table.
- `kit preview [--dry-run]` is for the lead: deploys `origin/dev` from the main root `.scratch/preview-deploy` worktree under a lock and checks the live bundle (`RESULT: ok preview <version-id> <sha>`).
- `kit version` prints the kit's commit, owner and Node version.

## Other scripts

- `scripts/agents/port.sh <cmd...>` waits for resources, locks a free slot, and sets `ASE_TEST_PORT`. Port rules below.
- `scripts/agents/timing.sh <cmd...>` holds all eight focused slot locks, then `5216`, for an exclusive timing run.
- `scripts/agents/cold.sh <worktree> <outprefix>` serves existing `dist` on `5216`, records the served index asset, measures five cold/warm runs with `ASE_COLD_NET=100/20`, waterfall and JSON; run through `timing.sh`.
- `scripts/agents/full-suite.sh [shards=3]` runs native-save shards in parallel with one worker each, separate artifacts, line logs and JSON; caps shards to currently free slots (at least one), prints the count, waits, summarizes, and fails if any shard fails. Each shard acquires any eligible slot through `port.sh`. `ASE_SHARDS` sets the default. Allow 25–50 minutes with 3 shards on a busy machine.
- `scripts/agents/reap.sh [--dry-run]` kills orphan test servers on unlocked slots; `--dry-run` lists them.
- `scripts/agents/worktree.sh <branch> [base=origin/dev]` creates a sibling worktree with shared dev `node_modules` and native-static fixture symlinks; records UTC time, `${ASE_OWNER:-unknown}`, branch and base in `.scratch/owner`, then prints its path. Set `ASE_OWNER` to the agent/thread identifier.
- `scripts/agents/worktrees.sh [--prune] [--older-than DAYS=3]` lists registered paths, branches, owners, dirtiness, commit age, merge state against local `origin/dev` or `origin/main`, and live cwd state from `/proc`. Listing is the default. Prune removes only clean, merged, inactive worktrees whose commit and creation ages exceed DAYS; unknown state is kept. Root, dev and locked worktrees are kept. It runs `git worktree prune` and keeps branches.
- `scripts/agents/tickets.mjs frontier [map]` prints open wayfinder tickets with all blockers closed, including builder and title; `check` validates statuses and same-map blocker slugs in both `tickets/` and `build/tickets/`, and fails with `file:line`. Lint runs the check.
- `scripts/agents/review.sh <worktree> <brief-file> <out-dir> [--base REF]` is the older form of `kit review` (a thin wrapper that saves no main-root evidence); it wraps the agent runner in review mode; copies its invocation's `out.md` to `<out-dir>/result.md` and `run.log` there, and verifies `REVIEW_STATUS: complete`. Model and CLI overrides below apply.
- `scripts/agents/review-brief.sh <ticket-file> [base=origin/dev]` (`kit review --ticket` builds the same brief itself) prints the standard slice brief: diff scope, ticket/linked spec, standards, finding format and the author's validation contract. Review completion accepts the first non-blank line, stripping a leading BOM or markdown fence.
- `scripts/agents/agent.sh build|review <worktree> <brief> [--model M] [--cli codex|claude] [--effort E] [--base REF] [--out DIR]` runs the selected agent; `agent.sh --resume <out-dir>` continues a stopped run. Defaults, adapters and resume below.
- `scripts/agents/sol.sh <worktree> <brief-file> [effort=medium]` is a compatibility wrapper for `agent.sh build`; model/CLI environment overrides apply. The runner prints its artifact directory.
- `scripts/agents/unit.sh [files...]` runs all unit tests via `npm test`, or selected files via `tsx --test`; prints pass/fail counts and each failure's name and first four error lines. Preserves the command's exit status; full log: `.scratch/unit/<time>-<pid>.log`. A test that never settles fails after `ASE_UNIT_TIMEOUT_MS` (default 120000), naming the test.
- `scripts/agents/shots.sh <out-dir> <scratch-spec.spec.ts>` (what `kit shots --spec` calls) runs only that `.scratch/` scenario through a dedicated Playwright config on a `port.sh` slot. Serves the real starter over fake GitHub, stops its server on completion/failure, and prints PNG paths. Fixture: `${ASE_NATIVE_SAVE_FIXTURE:-$HOME/Projects/native-site-editor-starter}`; screenshot destination: `ASE_SHOTS_OUT_DIR`. Example below.
- `scripts/agents/suite-summary.mjs <results.json> [...]` merges shard counts and prints each failure's file, line, title and first error line; labels and separately counts matches in [tests/known-failures.json](../../tests/known-failures.json) (or the registry at `ASE_KNOWN_FAILURES`) as known flaky or known failing on dev. It exits non-zero for every failure, report error or unreadable input. Registry titles match exactly and survive line moves; line-only entries cover parameterized tests, and spec-only entries cover the file.
- `scripts/agents/ci-fonts.conf` is a fontconfig with only DejaVu Sans, as on the CI runners; `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` before a browser run uses it (cache in `~/.cache/fontconfig-ci`).
- `scripts/agents/land.sh` is replaced by `kit pr` and prints a notice pointing there. It still pushes straight to `dev` after check, test and lint; only the lead uses it, when `kit pr` cannot run.
- `scripts/agents/deploy-preview.sh` is a wrapper: `exec kit preview "$@"`.
- `scripts/agents/ci-status.sh [branch=dev]` prints the latest run per workflow and fails for unsuccessful completed runs, with failed steps and the last 20 log lines. To wait for CI, use `kit wait ci`.

## Agent runner

Build and review default to `codex`, `gpt-6.1-sol`, effort `medium`. Set
`ASE_BUILD_MODEL` or `ASE_REVIEW_MODEL` to change the model. CLI precedence is
`--cli`, then `ASE_AGENT_CLI`, then model inference: `claude-*`, `opus`, `sonnet`,
`haiku`, `fable` select Claude; all others select Codex. `--model` overrides the
kind's environment default. `--effort` is passed to the selected CLI; the CLI/model
validates its supported levels.

Every run writes `<out>/status.json` (pids, model, CLI, worktree, brief, state
`running`/`done`/`failed`/`timeout`/`interrupted`, exit code, session id). After a
crash or app restart, `agent.sh --resume <out-dir>` waits on a run that is still
alive, or continues its session (`codex exec resume` or `claude --resume`) with
"Continue where you stopped; the brief is unchanged.", appending to `run.log` and
`out.md`. Codex reviews are not resumed (their private home holds credentials);
rerun them. `agent.sh` refuses a worktree that fails `kit doctor --quiet` (exit 3;
`ASE_SKIP_DOCTOR=1` is for tests).

Both modes read the brief on stdin with cwd set to the worktree. Build appends the
unstaged-work and validation contract. Both adapters verify the actual model
(Codex's `model:` log line; Claude's JSON `modelUsage` keys or `model` field).
Claude aliases permit their family; full names permit a dated snapshot suffix.
The `[1m]` context suffix is preserved for the CLI and ignored for model inference and verification.
Missing metadata, fallback models, CLI errors and empty reports fail the run.
Each invocation prints its directory at start, then writes `out.md` and `run.log`
in `<worktree>/.scratch/agent/<kind>-<time>-<pid>-<unique>/`. `--out DIR` selects
an invocation directory explicitly; callers must give each concurrent run its own directory.
Reviews also save `diff.patch`, `commits.log` and `refs.txt` for both adapters to read.
Scope defaults to `origin/dev`, or the brief's `git diff <base>...HEAD`; `--base REF` overrides it.
The runner prints the report and `git status --short`.

Codex build uses `workspace-write`, network access and `--add-dir` for the shared
Git directory; review uses `read-only`. Both automatically trust the vetted repo
hooks; interactive Codex asks once to approve new or changed hooks.
Claude build uses `acceptEdits` and adds the shared Git directory. Review uses
`plan` permissions, exposes only Read/Grep/Glob, excludes inherited settings with
`--setting-sources ""`, and disables MCP servers with `--strict-mcp-config`
and `--mcp-config '{"mcpServers":{}}'`. Claude returns JSON; the runner extracts
the result text. The lead commits builders' unstaged work.

`ASE_AGENT_TIMEOUT` defaults to `90m`, with legacy `SOL_TIMEOUT` as fallback.
Use positive integer seconds or `s/m/h/d` (at most 2147483 seconds). Expiry or
interruption kills the CLI's whole process group. How callers wait:
[runner.md](runner.md#waiting).

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

`kit shots` covers the named screens and steps files. For anything else, write a raw
spec at `.scratch/shots.spec.ts`; `shots.sh` supplies `baseURL` and `ASE_SHOTS_OUT_DIR`.
Run `scripts/agents/kit shots --spec .scratch/shots.spec.ts` (or
`scripts/agents/shots.sh .scratch/shots/example .scratch/shots.spec.ts`).
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
