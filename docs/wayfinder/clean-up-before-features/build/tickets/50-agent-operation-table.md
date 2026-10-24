---
title: "Agent operation table"
type: task (AFK)
status: open
assignee: lead-50 (this session)
builder: claude
blocked_by: [41-is-a-file-rule]
---

## Goal

Candidate #4 (research 01 §4). One agent tool is spelled in 6–7 files today: the MCP registration in `worker/mcp.ts`, the union in `shared/agent.ts:15–30`, argument checks in `shared/agent-edit.ts` or `shared/agent-media-args.ts`, the admission set in `src/agent-transport.ts:20`, the atomic list in `src/agent-site.ts:47`, the executor registry in `src/agent-tools-edit.ts:132–135` and the executor case in `applySiteCommand`. Nothing checks that the lists agree.

## Decided behaviour

No visible change ([ticket 05](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) order: #4 with N1 after #3). Agents see the same tools, arguments and answers. The relay (`worker/agent-relay.ts`) and the transport's fencing stay as they are.

## Shape

One table in `shared/agent-tool-table.ts` (new): per tool its name, argument schema, read or edit, text or media, atomic or not. The union type, the admission set, the atomic list and the executor registry derive from it; the Worker registers MCP tools from it. The `any` left in `worker/agent-operations.ts`, `worker/agent-store.ts`, `shared/agent-requests.ts`, `worker/agent-context.ts:421` and `worker/mcp.ts:43` goes where the table types it.

## Files

- New `shared/agent-tool-table.ts`, `tests/agent-tool-table.test.ts`
- `shared/agent.ts`, `shared/agent-edit.ts`, `shared/agent-media-args.ts`, `shared/agent-requests.ts`, `worker/mcp.ts`, `worker/agent-operations.ts`, `worker/agent-store.ts`, `src/agent-transport.ts`, `src/agent-site.ts`, `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`
- `docs/agents/code-map.md`

## Done when

- Adding a tool means one table row plus its executor; a test fails if an executor exists without a row or a row without an executor.
- MCP `tools/list` output is unchanged (snapshot test against `dev`).
- No `main.ts` change. `npm run check`, `npm test`, `kit specs --affected` (agent and MCP specs) green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). First slice of #4: starts when #3 is merged, on preview and checked.

- `kit doctor`; `kit bg slice-50 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/50-agent-operation-table.md --builder claude-opus-5-5`; `kit wait job slice-50 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-mcp.spec.ts native-mcp-media.spec.ts native-agent-edits.spec.ts`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: lists derived (which), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
