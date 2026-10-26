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

### Follow-ups

- Standards (P3): 836c6ecc7:scripts/agents/kit.d/review:132 — P3 fault: one `try` (lines 119–133) wraps both the save step and the follow-up calls `countsLine(record)` and `kitSc
- Standards (P3): 836c6ecc7:scripts/agents/kit.d/review:120 — P3 style: `saveReviewEvidence` returns `evidence`, but the caller ignores that value and reads the folder from the s
- Validation gaps (gap): `tests/kit-doctor.test.ts`: every new help test sets `KIT_COMMANDS_DIR`, so the default path (`${KIT_COMMANDS_DIR:-$(dirname -- "${BASH_SOURCE[0]}")}` at `scrip
- Validation gaps (gap): `tests/kit-wait.test.ts`: the new SHA test proves that `--sha` stays on its commit, and the existing branch test proves that branch waits follow the newer head.
- Spec (P2): 432074b46:docs/wayfinder/kitchen-everywhere/build/tickets/10-fixes-from-old-copies.md:53 — P2 ticket: All four `### Follow-ups` lines (53–56) stop mid-word: "`k
- Standards (P3): 69ea19120:scripts/agents/kit.d/review:124 — P3 fault: The open follow-up is still in the code. One `try` (119–133) covers both `saveReviewEvidence` and the late
- Standards (P2): 69ea19120:scripts/agents/kit.d/doctor:136 — P2 fault: `agent.sh:21` gates every `build`/`review` on `kit doctor --quiet`, and `kit fix` starts its builder throu
- Standards (P3): 753e640b4:scripts/agents/kit.d/doctor:144 — P3 fault: `code=$(< "$help_dir/$index.code")` runs under `set -euo pipefail`. If a `.code` file is missing (the subs
- Validation gaps (gap): No test covers the agent.sh gate together with the new `help` check. Add a test in `tests/kit-doctor.test.ts` or the agent.sh test: in a fixture worktree with a
- Validation gaps (gap): No test sets `KIT_COMMANDS_DIR` unset, so the default `$(dirname -- "${BASH_SOURCE[0]}")` path at `doctor:125` is never tested (this is the third follow-up, unr
- Validation gaps (gap): The "kept in" message has no test for scoring throwing after a successful save. Add a `tests/kit-review.test.ts` case that stubs `KIT_LIB_MJS` with a `kitScore`

