---
title: "Agent changes target the exact part they change"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Several agents on one page must not refuse each other. Today every edit carries the whole file's `expectedHash` (`shared/agent-edit.ts`), so any change elsewhere on the page refuses it.

## Decided behaviour

[Ticket 05, item 2](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- An edit targets the exact words (`edit_file` old/new text) or section it changes and lands while that part is unchanged, whatever else changed.
- Every reply tells the agent what changed since its last read.
- Only a true clash (that same part changed meanwhile) is refused, and the refusal carries the part's new version so the agent retries at once.
- Clean-up slice 52's rule stays: an edit to the part Lex is typing in waits until he clicks away.

## Files

Expected (confirm while designing): `shared/agent-edit.ts`, `shared/agent-read.ts`, `shared/agent.ts`, `src/agent-tools-edit.ts`, `src/agent-records.ts` (a per-agent read mark for the catch-up), `worker/mcp.ts` (result text only), `docs/mcp.md`; tests `tests/agent-*.test.ts` and a new `tests/native-save/native-agent-exact-part.spec.ts`.

## Done when

- A spec runs two agents editing different sections of one page; both land with no refusal.
- Two agents change the same words: the second is refused with the fresh part, retries and lands.
- Replies carry a catch-up of changes since the agent's last read (unit test on its shape and size cap).
- Slice 52's waiting spec still passes.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- Big, delicate slice: one second-opinion review of the final version (`ASE_REVIEW_MODEL=grok-4.7` or `gpt-6.1-sol` `kit review --ticket <this ticket>`), within the weekly budget.
