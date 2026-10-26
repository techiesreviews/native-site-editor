---
title: Three fixes from the old copies
type: task (AFK)
status: open
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
