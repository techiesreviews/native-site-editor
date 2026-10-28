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
- Commits: 9fe26caba (fix, test and docs).
- Validation: `scripts/agents/kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `scripts/agents/kit unit --affected` → `RESULT: ok unit 131/131 (3 files)`; `scripts/agents/kit status` → `RESULT: ok status all 778 tickets, 604 closed, 0 open PRs`; `npm run lint` clean.
- Review round 1 added two tests. `tests/agent-scripts.test.ts` runs a fake OpenCode through `agent.sh`: a fresh review whose first call opens no session records `silent: true` in `status.json`; `--resume` of a run that opened a session, silent again, prints `problem: opencode unavailable: no session within 0.5s` but records no `silent` key. It fails if a resumed run's calls start at 0. `tests/kit-review.test.ts` runs a `--second-look` with the free OpenCode model first and `FAKE_MODE=retry-silent`: `second look: grok-4.7 takes it (opencode/deepseek-v4.1-flash-free opencode unavailable: no session within 0.5s)`, two OpenCode calls, and only Grok's own count in the ledger. It fails if the handover reads the runner's `silent` mark instead of the problem text. Unit at this round: `RESULT: ok unit 133/133 (3 files)` from `scripts/agents/kit unit --affected`; `npm run lint` clean.
- Feature list: no change (agent kit review counting, nothing in the editor).
