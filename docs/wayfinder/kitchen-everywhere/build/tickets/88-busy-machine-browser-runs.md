---
title: "Full browser runs stop failing when the machine is busy: one full run at a time per machine, and a lone retry for a failed file"
type: task (AFK)
status: closed
assignee: ke-88
builder: claude
blocked_by: []
---

## Goal

Ke-60's editor PR #289 couldn't land on 2026-10-31. Of nine full browser runs (207 spec files), only three passed. Each failure hit one or two spec files the change doesn't touch, and each failed file passed when rerun alone. They are the timing-sensitive ones, failing while other slices' builds load the machine (load 10–36):
- `native-mcp-menu` (3 times)
- `native-boot-memory` (3)
- `native-edit-latency` (2; for example the next keystroke at 81 ms against 100, the longest task at 54 ms against 50)
- `native-history`
- `native-edit-bar`
- `native-structure-inplace`
- `native-resize-toggle`

The same thing happened to am-21 (one boot-speed failure) and ke-80 (the prompter's file-picker step). A waiver can't help, because a failed browser run always stops `kit pr`. So the more slices run at once, the less any of them can land.

## Decided behaviour

- **One full browser run at a time per machine.** The full run in `kit pr` and `kit specs` (all files) takes a machine-wide lock (in the kit's state folder) and waits for it, printing `waiting for <owner>'s full browser run`. `--affected` runs and unit tests don't take the lock.
- **A lone retry for a failed file.** After a full run, each failed spec file is rerun once on its own, with no other spec running.
  - It passes alone: the run counts as passed. The file is listed on the RESULT line as `flaky under load: <file>`, and one line is appended to `<kit state>/flaky.jsonl` (file, test, load, time).
  - It fails alone too: the run fails as today.
  - A file the change itself touched is never forgiven this way: it must pass in the full run.
- **Timing tests marked.** A project's `kit.json` can list spec files as `timing` (the editor: edit-latency, boot-memory). They run after the rest, alone, with no other kit job allowed to start meanwhile.
- **Report.** `kit status` names files that are flaky three or more times in 7 days, so they get a real fix (a ticket per file).

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/specs` (or the specs runner), `kit.d/pr`, `kit-lib.mjs` (lock), `kit.d/status`, `tests/`. In the editor: `scripts/agents/kit.json` (`timing` list), docs-tier PR.

## Done when

- Tests, failing first:
  - two full runs at once: the second waits;
  - a file that fails in the full run but passes alone: pass, plus the flaky line;
  - one that fails alone: fail;
  - a touched file: no forgiveness;
  - `timing` files run last and alone.
- PR #289 (ke-60's editor half) lands with it; ticket 60 closes.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.

## Done (2026-10-31)

- **Kit PR:** [agent-kit#15](https://github.com/techiesreviews/agent-kit/pull/15) → `RESULT: ok merged #15 ab13d2b`, through the kit's own `kit pr`, Claude review (claude-opus-5-5) and CI (the kit's tests and this editor's from `dev`). Landed with the lead's waiver after three fix rounds (P2s and test gaps left, below). This machine runs it: `kit update` → `RESULT: ok update ab13d2b (was 974ed10)`.
- **Editor PR:** [native-site-editor#298](https://github.com/techiesreviews/native-site-editor/pull/298) → `RESULT: ok merged #298 ae963d5` (waiver after three rounds; the last finding read the unpulled `~/Projects/agent-kit` checkout, not the machine kit). `scripts/agents/kit.json` gets `"timing": ["native-edit-latency", "native-boot-memory"]`; `docs/agents/agent-scripts.md` names the setting; `tests/kit-editor.test.ts` checks each entry names exactly one browser spec file.
- **What it does** (`kit.d/pr`, `browser-runs.mjs`, `kit-lib.mjs`, `kit-lib.sh`, the front door, `kit.d/status`, `kit.d/doctor`):
  - `kit pr`'s browser step takes a machine-wide lock in the kit's state folder (`browser-run.lock`, held with `flock` by a small child process, so it frees itself when the holder ends however it ends) and waits for it, printing `specs: waiting for <owner>'s full browser run`. `kit specs --affected` run by hand and unit tests take no lock. The editor's `kit specs` has no all-files mode, so the lock lives in `kit pr` only.
  - With a `timing` list the selection is listed first (`kit specs --affected --list`): nothing selected takes no lock; the timing files run after the rest, each alone. An empty list must say `none affected` or `0 selected`, else the step fails.
  - A failed file the change did not touch is rerun once alone. Passing alone: the run counts as passed, the file is named `flaky under load: <file>` on the specs line, the PR body and the `RESULT:` line, and one line goes to `<kit state>/flaky.jsonl` (time, project, file, test, load, owner, branch). Failing alone: the run fails (`<file> (failed alone too)`). A touched file is never forgiven (`(this change touches it)`), and once one failed, the other reruns and timing files are not run (`(not rerun)`, `(timing, not run)`). A failed run that did not report every file it ran (a crash part way) is never forgiven.
  - Timing files and lone reruns hold a second lock (`quiet.lock`); while it is held the front door starts no new kit job (`kit: waiting for <owner>'s lone browser run`), except `wait`, `status`, `heartbeat`, `version`, `card`, `rulebook`, help, and that run's own kit calls (`KIT_QUIET_HOLDER`). The wait answers TERM at once.
  - `kit status` prints `flaky: <file> N times in 7 days (give it a fix ticket)` for each of the project's files flaky 3 or more times in 7 days, and adds `, N flaky files` to its `RESULT:` line.
  - Without `flock` the runs go unlocked with a `specs: problem:` line, and `kit doctor` says so (`✗ flock: not installed …`, never a failure).
  - The kitchen rule (`docs/kitchen.md`, station 9, "Browser runs on a busy machine") says all this, including the specs output `kit pr` reads.
- **Tests** (agent-kit), written first and failing before the change (commit `7c5e69e`): two full runs at once (the second waits, says whose run, goes on only after the first ended); a file that fails in the full run but passes alone (pass, the flaky line, the `flaky.jsonl` entry); one that fails alone (fail, nothing logged); a touched file (no rerun); `timing` files run last and alone, under the quiet lock; `kit status` names a file flaky 3 times in 7 days; the front door waits on the quiet lock. From the review rounds: the lock frees itself when its holder is killed; nothing selected takes no lock; a crash part way and an unreadable `✗` line are never forgiven; a timing file that fails then passes alone is flaky; touched failures skip the lone runs; an unreadable `--list` fails; a silent rerun counts as failed; a lone rerun waits for another run's quiet lock; TERM while waiting; no `flock`. `tests/support/kit-env.ts` gives every test a temporary `XDG_STATE_HOME`, so no test reads the machine's locks.
- **Kit commands:** agent-kit `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` (first run, before the review rounds) → `RESULT: fail unit 577/578 (19 files)`, the one failure `kit-status`'s preview-request count, which passes alone (other machine traffic reaching the test's local port under load); in the landing `kit pr`: `npm test` 1457/1457, `npm run lint` ok, `npm run test:kit-clean` 15/15; `kit review` inside each `kit pr` (four rounds: `.scratch/reviews/ke-88/` in `~/Projects/agent-kit`, the waived last one under `ke-lead`). Two `kit pr` attempts failed on flaky kit tests under load (`agent-resume` SIGHUP; a landed-SHA test that failed because the job set `GIT_COMMITTER_*`, making cherry-picks identical within one second): both pass alone, and the landing run set no git identity.
- **It works on the real case:** PR #289 (ticket 60) waited for am-24's full browser run, then ran 207 spec files: `native-edit-bar.spec.ts` failed at load 33.86 and passed alone, so `RESULT: ok merged #289 3aaf8f0 (flaky under load: tests/native-save/native-edit-bar.spec.ts)`; the two timing specs ran last, each alone, and passed.
- **Second look:** skipped on #15 and #298 (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model gave no session within 300 s).
- **Feature list:** no change (agent kit only, nothing in the editor).
- **Found on the way, for the lead:** the shared `node_modules` (`~/Projects/native-site-editor-dev`) is behind `dev`'s lockfile since the DOMPurify and MCP hot fix (`dompurify` 3.4.16 installed, 3.4.17 locked; `@modelcontextprotocol/server` 2.2.0 against 2.3.0), so every editor `kit pr` that rebases onto `dev` fails `tests/monaco-dompurify.test.ts`. `kit deps add` refuses to replace a shared package. This slice's worktrees (and #289's and the ticket 60 close) used their own `npm ci` instead; the shared folder was left untouched.
- **Follow-ups** (waived P2s and gaps from the last kit review):
  - P2: lone reruns have no limit and go on after one has failed alone; with many failures (a dev server that never starts) that holds every other kit job back. Fix: stop after the first file that fails alone, and cap the reruns (say 3), failing the rest as `(not rerun)`.
  - P2: the touched check compares the specs command's paths with git's character for character; a command that printed `./tests/…` would never match a touched file. Fix: normalise both.
  - P3: "jobs already running carry on" in `docs/kitchen.md` overstates it: another `kit pr` already past its lock check carries on, but one starting its next kit step waits.
  - Gaps: both locks free after a crash part way; many untouched failures; a different path form; the front door with `flock` missing while a lock is held; `wait`, `heartbeat`, `version`, `card` and `rulebook` through the quiet wait; `kit pr`'s lone `kit specs` through the real front door; an interrupt during the lone reruns.

