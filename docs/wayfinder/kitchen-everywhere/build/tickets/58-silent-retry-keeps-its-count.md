---
title: "A counted review that already worked keeps its count when a retry goes silent (follow-up on 34)"
type: task (AFK)
status: closed
assignee: ke-58
builder: claude
blocked_by: [34-review-counts-honest]
---

## Goal

Slice 34's final review left a P2 ([ticket 34 Follow-ups](34-review-counts-honest.md#follow-ups)): the new `silent` refund in `scripts/agents/kit.d/review` (about lines 147–155) gives a weekly count back on any call that opened no session, including the completeness retry after a first call that already did a full review. The start timer in `invokeAgent` (`scripts/agents/agent-run.mjs`, about line 868) is armed on every call with no `previousCalls` check, unlike the usage-limit refund (about line 893). So a counted `openai/…` or `xai/…` OpenCode review that worked on call 1 and hung on its retry ends uncounted, which breaks the "review counts cannot be dodged" rule.

## Decided behaviour

- The silent-start refund applies only when no earlier call in the same review opened a session (the same `previousCalls` rule as the usage-limit refund).
- The free `opencode/deepseek-v4.1-flash-free` stays uncounted either way.

## Files

- `scripts/agents/agent-run.mjs`, `scripts/agents/kit.d/review`
- `tests/kit-review.test.ts` (and `tests/agent-scripts.test.ts` if the timer test lives there)

## Done when

- A fake counted OpenCode model that answers on call 1 and stays silent on the retry ends with its count kept; one silent on call 1 still gets it back; both fail as expected before the fix.
- `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-28)

- `invokeAgent` (`scripts/agents/agent-run.mjs`) now marks a call that opened no OpenCode session within its start limit as `silent: true` in the run record only when it was the review's first call (the same `previousCalls` rule as the usage-limit refusal). `kit review` gives the weekly count back on that mark instead of on the `no session within` message, so a counted `openai/…` or `xai/…` review that answered on call 1 and went silent on its completeness retry keeps its count. The `opencode unavailable: no session within …` problem line is printed either way.
- The free `opencode/deepseek-v4.1-flash-free` stays uncounted either way (no ledger written).
- Tests (`tests/kit-review.test.ts`): a new fake OpenCode mode `retry-silent` (incomplete reply on call 1, no event on the resumed call). The new test runs it for `openai/gpt-6.1` and `xai/grok-4.7` (count stays 1, two calls, the silent problem line) and for the free model (no budget line, no ledger). Before the fix it failed: the count went back to 0. The existing test where call 1 is silent (count back to 0, one call) passes before and after and guards the refund.
- `docs/agents/agent-scripts.md`: the `kit review` budget text says a silent start is refunded only on the first call.
- Commits: 9fe26caba (fix, test and docs), a97ff32b6 (this Done section), 21a8c03a7 "Review fixes round 1" (two more tests), 7934956ac "Review fixes round 2" (this commit list), "Review fixes round 3" (two more checks).
- Validation: `scripts/agents/kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `scripts/agents/kit unit --affected` → `RESULT: ok unit 131/131 (3 files)`; `scripts/agents/kit status` → `RESULT: ok status all 778 tickets, 604 closed, 0 open PRs`; `npm run lint` clean.
- Review round 1 added two tests. `tests/agent-scripts.test.ts` runs a fake OpenCode through `agent.sh`: a fresh review whose first call opens no session records `silent: true` in `status.json`; `--resume` of a run that opened a session, silent again, prints `problem: opencode unavailable: no session within 0.5s` but records no `silent` key. It fails if a resumed run's calls start at 0. `tests/kit-review.test.ts` runs a `--second-look` with the free OpenCode model first and `FAKE_MODE=retry-silent`: `second look: grok-4.7 takes it (opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 0.5s)`, two OpenCode calls, and only Grok's own count in the ledger. It fails if the handover reads the runner's `silent` mark instead of the problem text. Unit at this round: `RESULT: ok unit 133/133 (3 files)` from `scripts/agents/kit unit --affected`; `npm run lint` clean.
- Review round 2 listed the round 1 commit here. Review round 3 added two checks to the counted retry-silent test: each counted run ends `RESULT: fail opencode unavailable: no session within 0.5s …`, and two such `openai/gpt-6.1` runs in one fixture (budget 2) count 2, so no `silent` mark carries from one review to the next. Unit at this round: `RESULT: ok unit 133/133 (3 files)`.
- CI fix: "Kit tests leave no trace" failed twice on PR 240 (and on slice 22's PR) because its child suite hit the 230s limit (230054ms; slice 34's run took 219s for 1503 tests) and the killed kit-pr test left its folder. Slice 22 (PR 239) raised the limit to 480s first, so this slice keeps its value and only moves the child's timeout assertion before the leftovers in `tests/kit-tests-clean.test.ts`, so a slow suite names the timeout. Local guard: 1506 tests from 40 files, 8/8 pass.
- Feature list: no change (agent kit review counting, nothing in the editor).

### Follow-ups

- Validation gaps (gap): `tests/kit-review.test.ts`: the refund on a silent first call is covered only for `openai/gpt-6.1` (the existing "no session within the start limit" case). Add the same case for `ASE_AGENT_CLI=opencode ASE_REVIEW_MODEL=xai/grok-4.7 ASE_REVIEW_BUDGET_GROK=1`, with `FAKE_OPENCODE_SILENT=1` and `ASE_OPENCODE_START_TIMEOUT_MS=500`. Assert `opencodeCalls(f).length === 1` and `f.counts()` deep-equals `{ grok: { "kit-review": 0 } }` (or the empty shape the gpt case asserts). That shows the mark-based refund works for both counted OpenCode families, as the new keep-count test already does.
- Spec (P3): e10f5b720:tests/kit-tests-clean.test.ts:221 — P3 ticket: the ticket's `## Files` (58-silent-retry-keeps-its-count.md:19-22) lists only `scripts/agents/agent-run.mjs`, `scripts/agents/kit.d/review`, `tests/kit-review.test.ts` and `tests/agent-scripts.test.ts`. This commit also changes `tests/kit-tests-clean.test.ts`, and 9fe26caba changes `docs/agents/agent-scripts.md`. `kit next` uses the Files list to keep slices that share a file from running at the same time, so a slice that touches the clean guard could have run alongside this one unnoticed. The CI reason is written up in the Done section, and the change itself is sound. Fix: add `tests/kit-tests-clean.test.ts` and `docs/agents/agent-scripts.md` to `## Files`, or move the clean-guard timeout into its own ticket.
- Validation gaps (gap): `tests/kit-review.test.ts`: the refund when the first call is silent is still covered only for `openai/gpt-6.1`. Add the `xai/grok-4.7` case with `ASE_AGENT_CLI=opencode ASE_REVIEW_MODEL=xai/grok-4.7 ASE_REVIEW_BUDGET_GROK=1 FAKE_OPENCODE_SILENT=1 ASE_OPENCODE_START_TIMEOUT_MS=500`. Assert `opencodeCalls(f).length === 1` and that the grok count is back to 0, in the same shape the gpt case asserts. The ticket's own Follow-ups list this gap but the change does not close it, and the refund now depends on the runner's `silent` mark rather than the problem text, so each counted family should prove its refund once.
- Validation gaps (gap): `tests/agent-scripts.test.ts`: nothing checks that a `silent: true` mark appears only after a silent call. Add a fresh `opencode/deepseek-v4.1-flash-free` review whose first call opens a session (no `FAKE_OPENCODE_SILENT`) and assert `"silent" in status(out) === false`. The new test only checks this on the resumed record. A regression that marks every first call, for example `update({ silent: !previousCalls })`, writes the key on every first call and would still pass the current assertions.

