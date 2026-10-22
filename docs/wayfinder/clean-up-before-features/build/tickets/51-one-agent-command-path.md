---
title: "One agent command path in the tab (N1)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [50-agent-operation-table]
---

## Goal

N1 (research 01, new candidate). An agent edit is prepared twice in the same tab: `prepareAgentEdit` (`shared/agent-edit.ts:83`) checks a snapshot `EditorContext` read through `SiteFiles`, then `applySiteCommand` (`src/agent-site.ts`) re-reads the outline and refuses again against the live editor (for example `agent-site.ts:714–720` after `agent-edit.ts:189–201`). The Worker runs `writablePathProblem` before forwarding too: three layers for a path.

## Decided behaviour

[Ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) (round 3): **one real check of an agent's change, in the tab, against what the preview shows; the Worker keeps shape checks only** (schema, size, protected paths, ids). An agent's refusal wording may change slightly (to slice 40/41's one wording); results, receipts, duplicate handling and `get_command_status` keep their contracts.

## Shape

Each table row (slice 50) names its checks once; they run in the tab against the live workspace (the runtime of slice 31 and the overlay of slice 32), under one session stamp (slices 20–22), inside the guarded edit. `prepareAgentEdit`'s snapshot pass and its `EditorContext` go, or shrink to the receipt identity it still needs.

## Files

- `shared/agent-edit.ts`, `shared/site-files.ts`, `src/agent-tools-edit.ts`, `src/agent-site.ts`, `worker/mcp.ts`, `shared/agent-tool-table.ts`
- Tests: `tests/agent-tools-edit.test.ts`, `tests/agent-site.test.ts`, `tests/mcp-runtime.test.ts`; specs `native-agent-edits.spec.ts`, `native-mcp.spec.ts`, `native-mcp-media.spec.ts`

## Done when

- Every refusal an agent edit can get is decided once (a test lists them per tool and finds each in exactly one place).
- Duplicate commands still apply once; unknown outcomes are still never replayed (the existing tests stay green unchanged, except refusal wording).
- No `main.ts` change expected; if one is needed, `kit size` and the ceiling.
- `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-51 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/51-one-agent-command-path.md --builder claude-opus-5-5`; `kit wait job slice-51 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-agent-edits.spec.ts native-mcp.spec.ts native-mcp-media.spec.ts`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: refusals moved or merged (list with old and new wording), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
