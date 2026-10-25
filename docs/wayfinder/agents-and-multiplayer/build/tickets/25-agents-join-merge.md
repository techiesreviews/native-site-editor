---
title: "Agents join the merge"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [21-shared-copy-per-file, 10-exact-part-edits]
---

## Goal

Agent changes merge like typing instead of replacing text.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 4 and [ticket 05, item 2](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- In the receiving tab, an agent's edit is applied to the shared copy as the smallest change.
- True clashes still refuse with the fresh part (slice 10), and the wait rule for the element someone types in stays.

## Files

Expected (confirm while designing): `src/agent-tools-edit.ts`, `src/live-text.ts`, `src/agent-records.ts`; tests and a spec with an agent and two people.

## Done when

- A spec: an agent edits one sentence while Lex types in the next; both land and every copy matches.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-25 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-25 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
