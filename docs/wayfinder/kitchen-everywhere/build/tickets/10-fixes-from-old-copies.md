---
title: Three fixes from the old copies
type: task (AFK)
status: closed
assignee: runner-ke10
builder: claude
blocked_by: []
---

## Goal

The three hand copies of the kit in `chat`, `techies-playground` and `techies-reviews` each fixed something our kit still gets wrong. Bring those three fixes in before the copies are replaced, so nothing they learned is lost (research 03, "Bring into the shared kit"; [ticket 03 resolution](../../tickets/03-research-old-kit-copies.md#resolution-2026-10-26)).

## Decided behaviour

- **Review files survive a failed save.** `kit review` copies its files to the evidence folder first and deletes the temporary folder only after every copy worked; when a copy fails it keeps the temporary folder and prints its path (`problem: review files kept in <path>`). Today a `finally` deletes it, so a full disk or a bad `findings.json` write loses the review. Model: `~/Projects/chat/scripts/agents/review-evidence.mjs` and its test `~/Projects/chat/tests/video-content/kit-review.test.mjs` (read only).
- **`kit wait ci --sha <sha>` stays on that commit.** After a cancelled run it keeps waiting for the asked commit; following a newer head stays for branch and PR waits only. Model: `~/Projects/techies-playground/scripts/agents/kit.d/wait` lines 185–191 and `scripts/agents/kit-wait.test.mjs` there (read only).
- **`kit doctor` runs every command's `--help`** and fails naming each command whose help errors or is missing, so a broken pull or a missing import shows at once (all three copies do this).

## Files

- `scripts/agents/kit.d/review`, a new `scripts/agents/review-evidence.mjs` if the copy-then-delete step needs its own file
- `scripts/agents/kit.d/wait`
- `scripts/agents/kit.d/doctor`
- `tests/kit-review.test.ts`, `tests/kit-wait.test.ts`, `tests/kit-doctor.test.ts`
- `docs/agents/agent-scripts.md` (the three lines that change)

## Done when

- Tests prove: a failing copy keeps the temporary review folder and names it, and a good save removes it; `wait ci --sha` with a fake `gh` showing a cancelled run and a newer head keeps waiting for the asked commit, while a branch wait follows the newer head; `doctor` fails on a fake command whose `--help` exits non-zero and passes when every help works.
- `scripts/agents/kit unit --affected` green; one real `scripts/agents/kit doctor` run passes.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; reads the other projects, writes nothing there.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke10 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/10-fixes-from-old-copies.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke10 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit and doctor `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-26)

- `kit review` removes its temporary review folder only after every evidence copy and `findings.json` are saved (the save step is `saveReviewEvidence` in the new `scripts/agents/review-evidence.mjs`); when saving fails it keeps the folder and prints `problem: review files kept in <path>` (the RESULT line still names the failure and the evidence folder). When only removing the folder fails after a full save, the review keeps its result and prints `problem: removing <path> failed: …`.
- `kit wait ci --sha <sha>` stays on the asked commit after a cancelled run and reports that run's failure; branch and PR waits still follow a newer head as "superseded".
- `kit doctor` has an eighth check, `help`: every kit command must exit 0 with a `Usage:` line from `--help` within `KIT_HELP_TIMEOUT` seconds (default 10). The helps run side by side (real run about 1 s for 23 commands); each broken one is named with `(exit N)`, `(no usage)` or `(timed out)`. RESULT now reads `doctor 8/8 checks passed`.
- Tests: `tests/kit-review.test.ts` (a good save leaves no `kit-review-*` folder; an unreadable `diff.patch` keeps the folder, names it and keeps `out.md`; a `findings.json.tmp` directory in the evidence folder fails the save after all four copies and keeps every original, and a good save removes them; a read-only parent that stops the removal leaves the evidence complete and returns the error as `cleanup`, and `kit review` with a read-only `.scratch/agent` ends `RESULT: ok` with `findings.json` saved and prints `problem: removing <path> failed: EACCES`), `tests/kit-wait.test.ts` (a `--sha` wait on a cancelled run with a newer branch head fails on the asked commit and never reads the branch head; the existing branch test still follows it), `tests/kit-doctor.test.ts` (fixture uses a two-command set; failing, silent and hanging helps are each named; every real command passes the help check; `--quiet` still fails and names a broken help; a help that ignores SIGTERM is killed 2 s after its timeout and named `(timed out)`; a command folder with no commands fails `help` and names the folder).
- `docs/agents/agent-scripts.md`: the doctor, review and wait lines.
- Validation: `RESULT: ok unit 110/110 (3 files)`; `RESULT: ok doctor 8/8 checks passed` (real run); `npm run lint` exit 0.
- Feature list: no change (agent kit only, nothing a site editor user sees).
- Second look (Grok 4.7, 2026-10-27, `.scratch/reviews/review/ke10-range/20261027T061559Z`): P2 clipped follow-ups → [ticket 18](18-full-follow-ups.md); the open P2 doctor gate on the fix builder and the untested default `KIT_COMMANDS_DIR` → [ticket 19](19-doctor-gate-and-fix-builder.md); two P3 nits (one `try` around save and scoring; a missing `.code` file ends `doctor` with no `RESULT:`) stay as follow-ups.

### Follow-ups

Written in full from the slice's saved `findings.json` (rounds `20261026T220248Z` and `20261026T221751Z`). The commits they cite were rebased on landing: the code is in ddbf77dc3 and 3cb082ba5, with the `try` now at `scripts/agents/kit.d/review:120–133` and the `.code` read at `scripts/agents/kit.d/doctor:242`.

- Standards (P3): 836c6ecc7:scripts/agents/kit.d/review:132 — P3 fault: one `try` (lines 119–133) wraps both the save step and the follow-up calls `countsLine(record)` and `kitScore(...)`. Those calls run after `saveReviewEvidence` has already removed the temporary folder. If either one threw, the `catch` would print `problem: review files kept in <temporary>` for a folder that no longer exists, and would turn a fully saved review into `RESULT: fail saving evidence failed`. Today `kitScore` catches its own errors (`scripts/agents/kit-lib.mjs:363`) and `countsLine` is pure, so nothing triggers this yet. Fix: limit the `try` to the `saveReviewEvidence` call and run `countsLine`/`kitScore` after it. Or print the "kept" line only when `existsSync(temporary)` is true. No CODING_STANDARDS section covers kit scripts; this is a plain correctness note.
- Standards (P3): 836c6ecc7:scripts/agents/kit.d/review:120 — P3 style: `saveReviewEvidence` returns `evidence`, but the caller ignores that value and reads the folder from the side effect in its `createDirectory` callback (`() => (evidence = evidenceDirectory())`). That leaves two sources for the same value. The side effect is needed because the failure path must still name a partly filled folder. Fix: say so in a short comment at the call, or attach `evidence` to the thrown error and drop the assignment inside the callback. No CODING_STANDARDS rule applies (readability only).
- Validation gaps (gap): `tests/kit-doctor.test.ts`: every new help test sets `KIT_COMMANDS_DIR`, so the default path (`${KIT_COMMANDS_DIR:-$(dirname -- "${BASH_SOURCE[0]}")}` at `scripts/agents/kit.d/doctor:125`) is never tested. That default is the path real runs take, because the `kit` front door keeps its own `commands_dir` and does not export it. Today only the manual "real run" in the ticket's Done section covers it. Test to add: run `kit doctor` from the repo with `KIT_COMMANDS_DIR` removed from the env, and assert `✓ help: <count of executable kit.d entries> commands answer --help`. Fixed in 498334975 (`tests/kit-doctor.test.ts` runs doctor from the repo with `KIT_COMMANDS_DIR` unset).
- Validation gaps (gap): `tests/kit-wait.test.ts`: the new SHA test proves that `--sha` stays on its commit, and the existing branch test proves that branch waits follow the newer head. No test covers `--pr` after a cancelled run, even though the changed condition (`cancelled && !options.sha`) also controls the PR path. Test to add: use `fakeGh(t, "superseded")` with `["ci", "--pr", "<n>"]` and a fake `pr view` that returns the newer `headRefOid`, then assert `superseded by <newer>`.
- Spec (P2): 432074b46:docs/wayfinder/kitchen-everywhere/build/tickets/10-fixes-from-old-copies.md:53 — P2 ticket: All four `### Follow-ups` lines (53–56) stop mid-word: "`kitSc", "from the s", "at `scrip", and line 56 has no stated gap. The first two also cite commit `836c6ecc7`, which is not in this branch's history (commits.log has 69ea19120…753e640b4). The ticket's record of what was left open is therefore unreadable and points at a SHA that doesn't exist here. runner.md/kit pr treat the Done section's follow-ups as the hand-off for P2/P3 and gaps. Fix: rewrite each line in full and cite a commit on this branch (69ea19120 or b00b4b763) with the current line numbers (`scripts/agents/kit.d/review:119–133`, `:120`). Fixed by [ticket 18](18-full-follow-ups.md): these bullets are now written in full.
- Standards (P3): 69ea19120:scripts/agents/kit.d/review:124 — P3 fault: The open follow-up is still in the code. One `try` (119–133) covers both `saveReviewEvidence` and the later `countsLine(record)` / `kitScore(...)` calls. If scoring throws after a full save and after the temporary folder is gone, the review reports `saving evidence failed`, sets status 1 and prints `problem: review files kept in <temporary>` for a folder that no longer exists. That breaks the ticket's "names it" contract. This is a general correctness rule; CODING_STANDARDS.md has no section for kit scripts, so no standards section applies. Fix: put the countsLine/kitScore step in its own `try` after the save, reported as `problem: scoring failed: …`. Print "kept in" only when `existsSync(temporary)` is true.
- Standards (P2): 69ea19120:scripts/agents/kit.d/doctor:136 — P2 fault: `agent.sh:21` gates every `build`/`review` on `kit doctor --quiet`, and `kit fix` starts its builder through `agent.sh` (`kit.d/fix:14`). The new `help` check runs this worktree's own `kit.d`. So a slice whose builder breaks one kit command's `--help` (a syntax error or missing import) can't run its fix-round builder: agent.sh exits 3. The slice stops with "kit doctor failed" instead of letting the builder repair what review flagged. This hits runners on exactly the kit-editing tickets this map is full of. No CODING_STANDARDS.md section applies (kit shell script). Fix: in `agent.sh`, skip the `help` check for `build` runs, for example with a `KIT_DOCTOR_SKIP=help` that doctor honours. Or have doctor check `--help` against the dev worktree's `kit.d` when it gates a builder. Document it in agent-scripts.md. Open in [ticket 19](19-doctor-gate-and-fix-builder.md).
- Standards (P3): 753e640b4:scripts/agents/kit.d/doctor:144 — P3 fault: `code=$(< "$help_dir/$index.code")` runs under `set -euo pipefail`. If a `.code` file is missing (the subshell's `printf` failed on a full `/tmp`, or the subshell was killed), doctor exits right there. It never prints its `✗ help` line, and the front door adds `doctor exited 1 without a RESULT line`. No CODING_STANDARDS.md section applies. Fix: `code=$(cat -- "$help_dir/$index.code" 2>/dev/null) || code=missing`, then name that command `(no result)`.
- Validation gaps (gap): No test covers the agent.sh gate together with the new `help` check. Add a test in `tests/kit-doctor.test.ts` or the agent.sh test: in a fixture worktree with a kit command whose `--help` exits 1, run `scripts/agents/agent.sh build <worktree> <brief>` and assert the documented outcome (exit 3 naming `help`, or a pass if `build` skips the check per the fix above). Open in [ticket 19](19-doctor-gate-and-fix-builder.md).
- Validation gaps (gap): No test sets `KIT_COMMANDS_DIR` unset, so the default `$(dirname -- "${BASH_SOURCE[0]}")` path at `doctor:125` is never tested (this is the third follow-up, unresolved). Add a test that runs `scripts/agents/kit doctor` from the repo with `KIT_COMMANDS_DIR` deleted from `env`, and asserts `✓ help: <readdir count> commands answer --help`. Fixed in 498334975, as in the third follow-up.
- Validation gaps (gap): The "kept in" message has no test for scoring throwing after a successful save. Add a `tests/kit-review.test.ts` case that stubs `KIT_LIB_MJS` with a `kitScore` that throws. Assert `findings.json` exists, no `problem: review files kept in` line is printed, and the exit status matches the decided behaviour.
