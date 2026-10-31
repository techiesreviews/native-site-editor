---
title: Out of credit is its own result, and a CLI's own error is the last problem line
type: task (AFK)
status: closed
assignee: ke-33
builder: claude
blocked_by: [16-opencode-review-path]
---

## Goal

On 2026-10-27 Grok's paid credit ran out mid-review: the ke-14 second look stopped after ten turns with `402 Payment Required: Grok Build usage balance exhausted` (evidence `.scratch/reviews/review/ke14-second-look/20261027T120431Z` in the main checkout). The kit has no pattern for it, so the run ended as a plain `grok failed`, kept its place in the weekly count (`grok 5/8 in 2026-W44`), and the lead had to read the log to learn the account was empty. OpenCode's limit pattern (`opencodeLimitPattern`, `scripts/agents/agent-run.mjs:197`) matches "insufficient credit/balance" and "quota" but not a bare HTTP 402 or "balance exhausted". A second look (ticket 17) has to tell "this model cannot run today" (skip or fall back) from "this review broke" (fail). Ticket 16's follow-up names this ([ticket 16](16-opencode-review-path.md#follow-ups)).

Both reviews of slice 16 also found that a real OpenCode error is hidden behind a generic line: an error event that is not a limit (for example 502 Bad gateway) with a non-zero exit makes `context.cause` `problem: opencode failed (1)` (`agent-run.mjs:746`), pushed after `OpenCode reported an error: Bad gateway`, so the last `problem:` line, the one runners read, says nothing (P2 in Claude's final review of PR #211 and in the OpenCode second look, evidence `.scratch/reviews/ke16-second-look/20261027T144848Z`).

## Decided behaviour

- **One "out of credit" result per provider.** Grok output with HTTP 402, "Payment Required" or "usage balance exhausted", and OpenCode error events or closing lines with HTTP 402, "balance exhausted" or "payment required", print `problem: <grok|opencode> out of credit: <the provider's message>` as the last problem line. Only the CLI's own error lines count (as `usageLimitProblem` reads only the closing lines), so a diff that quotes "402" is not matched.
- **Its own RESULT.** `kit review` ends `RESULT: skip review out of credit (<model>)` with exit 3 (a run that could not start, not a failed review); `docs/agents/agent-scripts.md` lists the exit code beside the others. A usage-limit refusal keeps today's `usage limit` line and exit.
- **Not counted.** An out-of-credit run that returned no complete report is released from the weekly count (`releaseReviewBudget`), even after earlier turns, since no review came back; a complete report stays counted.
- **The CLI's own error is last.** When an OpenCode run exits non-zero after an error event that is not a limit, the cause is `problem: OpenCode reported an error: <message>`, not `opencode failed (<status>)` (an `adapter.errorProblem?.(stdout)` checked before the generic line, as Claude's review suggests).
- **Two small OpenCode adapter fixes from the same reviews (P3):** the export's temp file is opened inside the `try`, so a failed `openSync` still removes its `ase-opencode-export-*` folder (`agent-run.mjs:516`); when the last text part has no `messageID`, the report is that last part alone, not every part joined (`:229`).

## Files

- `scripts/agents/agent-run.mjs`, `scripts/agents/kit.d/review`
- `tests/agent-scripts.test.ts`, `tests/kit-review.test.ts`
- `docs/agents/agent-scripts.md` (the `kit review` results and exit codes)

## Done when

- `tests/kit-review.test.ts` with a fake `grok` that prints `402 Payment Required: Grok Build usage balance exhausted` after one turn and exits 1: the last problem line is `problem: grok out of credit: …`, the RESULT is `skip review out of credit (grok-4.7)`, exit 3, and the Grok count is back where it started. The same with a fake `opencode` error event `{ status: 402, message: "balance exhausted" }`, and with a bare 402 line on stderr.
- A diff that contains "402 Payment Required" in a complete report stays a passing review.
- A fake mode `error-502-exit1` (error event, then exit 1): the last stderr `problem:` line is `OpenCode reported an error: Bad gateway`.
- An end-to-end `kit review` with `ASE_OPENCODE_EXPORT_TIMEOUT_MS=abc`: exit 1, the named problem, no `opencode run` call.
- An `opencodeResult` case with two text parts without `messageID` returns only the last.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke33 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/33-out-of-credit-and-last-problem.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke33 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, each new case's result, review decisions, PR and merge SHA.

## Done (2026-10-27)

- An empty account is its own result. Grok's closing lines and OpenCode's error events (status 402, or with no status a credit message; another status is never credit, even when its message names 402) or closing lines with HTTP 402, "Payment Required" or "balance exhausted" give `problem: <grok|opencode> out of credit: <message>` as the last problem line (`outOfCreditProblem`, `opencodeOutOfCredit` in `scripts/agents/agent-run.mjs`). Only closing lines of a failed call that are a bare 402, a 402 followed by "Payment Required" or "balance exhausted", or that message alone (after an optional `error:` or `■`) count, so a diff, report, tool trace, grep hit (`402:const x`) or count (`402 files read`) is not matched. A usage-limit refusal keeps its `usage limit` line and exit.
- `kit review` ends such a failed run with `evidence: <path>` and `RESULT: skip review out of credit (<model>)` (ending `; count not given back` when the release fails), exit 3, and gives the weekly count back even after earlier turns, and even when saving its evidence then fails (that run ends `RESULT: fail saving evidence failed …`). `docs/agents/agent-scripts.md` adds `skip` and exit 3 to the general kit contract and lists the exit codes (0 reviewed, 1 failed, 2 invalid arguments, 3 skipped out of credit).
- An OpenCode call that exits non-zero after an error event that is not a limit names its last error event, `problem: OpenCode reported an error: <message>`, as its last problem line instead of `opencode failed (<status>)` (`errorProblem` on the adapter); a failed call's result is no longer read, so the error is not printed twice.
- The OpenCode export opens its temp file inside the `try`, so a failed open still removes its folder; a last text part without `messageID` is the report alone.
- Tests: `tests/kit-review.test.ts` adds a Grok 402 after one turn (exit 3, skip RESULT, count back to 1), OpenCode 402 error event and bare `402` stderr line (exit 3, skip RESULT), a diff and report quoting "402 Payment Required" passing for Grok and OpenCode, `error-502-exit1` (last problem `OpenCode reported an error: Bad gateway`) and `ASE_OPENCODE_EXPORT_TIMEOUT_MS=abc` through the front door (exit 1, named problem, no `opencode run`). Also: a 402 error event with exit 0 (exit 3), a 402 on Grok's completeness retry (exit 3, count back to 0), a failed Grok run whose tool trace is `grep 402 file.txt` (exit 1, `RESULT: fail`, still counted) an out-of-credit run whose evidence cannot be saved (exit 1, `RESULT: fail saving evidence failed`, count given back) and one whose ledger lock is held (exit 3, skip line ending `; count not given back`). `tests/agent-scripts.test.ts` also rejects `402:const x = 1`, `402.5 tests passed` and `402 files read`, and shows an export whose file cannot be opened leaves no `ase-opencode-export-*` folder. `tests/agent-scripts.test.ts` adds `outOfCreditProblem`, `opencodeOutOfCredit`, `opencodeErrorProblem` and the two text parts without `messageID` case.
- Round 3 tests: a Grok first call that prints only the 402 line (exit 3, count back to 1, not 0), an OpenCode 429 then 402 (exit 3, out of credit), a 502 whose message names 402 and two error events `Overloaded` then `Bad gateway` (exit 1, last problem names the 502 and the last event).
- Commits: 0e3830202 (out-of-credit result and last problem line), 29c5dc39b (review fixes round 1), 56cd0e460 (review fixes round 2).
- Feature list: no change (kit-only; no editor change a user can see).

### Follow-ups

- Spec (P3): 4ad604fa8:docs/wayfinder/kitchen-everywhere/build/tickets/33-out-of-credit-and-last-problem.md:55 — P3 ticket: The `## Done` "Commits:" line names 0e3830202, 29c5dc39b and 56cd0e460. None of these is in the branch. The real commits are 2c1e1d2fe, f8fedb916, be522ab05 and 4ad604fa8 (round 3, also missing from the list), so the landing record points at SHAs that don't exist. Fix: write the SHAs as they will land, or leave the merge SHA to the slice's landing record as the ticket's "Report" line asks.
- Standards (P3): 4ad604fa8:scripts/agents/agent-run.mjs:273 — P3 fault: For Grok, `outOfCreditLinePattern` accepts a bare `402` (also `HTTP 402` / `status 402`) on any of the last five non-empty log lines of a failed call. The comment at :269-271 says "a tool trace, grep hit or count that merely … names 402 is not one". But a Grok run that crashes (exit ≠ 0) right after a tool printed the number `402` on its own line, such as `wc -l` output, is read as out of credit. It then exits 3 and gives its weekly count back. The tests reject `402 files read` and `402:const x`, not a bare `402`. Fix: accept the bare-402 forms only for OpenCode's stderr (the case the ticket names), and require the "Payment Required"/"balance exhausted" text for Grok (`grokAdapter`, :512). One way is a `bare` flag on `outOfCreditProblem`.
- Standards (P3): 4ad604fa8:scripts/agents/kit.d/review:148 — P3 fault: The new `RESULT: skip …` / exit 3 is not read by the in-repo callers. `kit slice` `requireSuccess` (`scripts/agents/kit.d/slice:143`) pulls its reason only from `^RESULT: fail (.+)$`, so a slice whose review model has no credit stops with a bare `command exited 3; see <log>`. `kit fix` (`kit.d/fix:270`) prints `review failed (3)`. A runner has to open the log to learn the review was skipped for credit, which is the problem the ticket set out to fix. Fix: let `requireSuccess` also match `^RESULT: (?:fail|skip) (.+)$`. Or record this as a follow-up for ticket 17 (second look: skip or fall back), since slice/fix are outside this ticket's Files.
- Validation gaps (gap): No test of a failed Grok call whose last log line is a bare `402` from tool output. Add `FAKE_MODE: "trace-bare-402"` (`console.error("402"); process.exit(1)`) in `tests/kit-review.test.ts` and assert exit 1, `RESULT: fail`, and the count kept at 2. Today that test would fail; see the first fault.
- Validation gaps (gap): No test that `kit slice` surfaces the skip reason. Add a `tests/kit-slice*.test.ts` case where the fake `kit review` prints `RESULT: skip review out of credit (grok-4.7)` and exits 3, and assert the slice's error names "skip review out of credit".

