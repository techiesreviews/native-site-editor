---
title: "A counted review that already worked keeps its count when a retry goes silent (follow-up on 34)"
type: task (AFK)
status: open
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
