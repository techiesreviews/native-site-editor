---
title: "Agent operation table"
type: task (AFK)
status: closed
assignee: lead-50
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

## Done (2026-10-24)

Agents see the same tools, arguments and answers; MCP `tools/list` is byte-identical to `dev` (3c5518e4).

- `shared/agent-tool-table.ts` (new): `agentTools`, one row per agent tool with its route (read, status, edit, media, requests), effect (read, edit, remove: the MCP hints), the browser operation it becomes, atomic, and the two exceptions (`idempotent: false`, `mcp: false` for `get_request`). The two Astro-era commands stay a short list beside it.
- Derived from it: the `AgentOperation` union (`shared/agent.ts`), the tab's admission of commands, reads and Media tools (`src/agent-transport.ts`), the atomic list (`src/agent-site.ts`), the edit, status and Media registries (`src/agent-tools-edit.ts`, `src/agent-tools-media.ts`), the request tools (`shared/agent-requests.ts`), the command an edit queues (`shared/agent-edit.ts`, so `edit_file` becomes `write_file` there), and the Worker's MCP registration: `worker/mcp.ts` registers in table order with the table's hints, and refuses a tool registered twice, a row without a registration or a registration without a row.
- Argument schemas: each MCP tool's zod `inputSchema` stays with its description and handler in `worker/mcp.ts`, registered by its table name (`register(name: McpToolName, …)`); the browser's own checks stay in `shared/agent-edit.ts` and `shared/agent-media-args.ts`, keyed by the table's types. The table carries no zod: the editor tab loads it (admission, registries), and zod would come along into the browser.
- Types: `applySiteCommand` must handle every table operation; `AgentRead["tool"]`, `AgentEditTool` and `MediaTool` must name the table's tools of their route, both ways. The `any` in `shared/agent-requests.ts` (request actions), `worker/agent-operations.ts` and `worker/agent-store.ts` (hub grant actions) and `pausedMcp` became types.
- `tests/agent-tool-table.test.ts`: `tools/list` against `dev`'s names and SHA-256; the Worker registers exactly the MCP rows; each route's browser registry runs exactly its rows; `applySiteCommand` reaches a case for every operation; the atomic list is as before; registration in table order refuses a tool registered twice, a row without a registration and a registration without a row; the hub refuses a non-grant action (null, a string, an unknown type) with 400 before any storage call.
- Left: `worker/agent-context.ts:421` (`any`, outside this slice's files); `shared/agent-media.ts` `mediaTools`, `shared/agent-read.ts` and `src/agent-tools-read.ts` keep their own lists, held to the table by types and the test.

### Follow-ups

- Spec (P2): ade444ad:shared/agent-tool-table.ts:20 — P2: The ticket's Shape asks for "one table … per tool its name, argument schema, read or edit, text or media, atomic or
- Spec (P2): ade444ad:shared/agent-media.ts:3 — P2: The goal is that a tool's name is spelled in one place. `mediaTools` (shared/agent-media.ts:3) and the `AgentRead["tool"]
- Spec (P2): ade444ad:worker/agent-context.ts:415 — P2: The Shape names `worker/agent-context.ts:421` among the `any`s to remove. It stays `const result: any` (line 422). Al
- Spec (P3): a9bc4c76:docs/wayfinder/clean-up-before-features/build/tickets/50-agent-operation-table.md:43 — P3: runner.md "Review and close" says the Done section records "
- Standards (P2): ade444ad:worker/agent-store.ts:18 — P2: The cited rule is CODING_STANDARDS "Test fixtures": type fakes with `satisfies` or a declared type. The problem is that 
- Validation gaps (gap): `src/agent-transport.ts` admission now uses `isAgentOperation`, `readTools` and `mediaTools`. No test drives `createLiveTransport` itself with a command outside
- Validation gaps (gap): `pausedMcp`'s parameter changed from `any` to `unknown` with a `(body ?? {})` cast. There's no test for non-object bodies. Add one: `pausedMcp(null)`, `pausedMc
- Validation gaps (gap): `prepareAgentEdit` now takes its queued operation from the table. No unit test asserts that `edit_file` queues `write_file`, or that every other edit tool queue
- Spec (P2): 9694212a:docs/wayfinder/clean-up-before-features/build/tickets/50-agent-operation-table.md:56 — P2: All eight `### Follow-ups` lines (56–63) stop mid-sentence. 
- Spec (P2): 9694212a:docs/wayfinder/clean-up-before-features/build/tickets/50-agent-operation-table.md:56 — P2: The follow-ups point at commits `ade444ad` and `a9bc4c76`. N
- Spec (P2): 2394d192:shared/agent-tool-table.ts:286 — P2: The ticket's Shape says the table holds, for each tool, "its name, argument schema, read or edit, text or media, a
- Spec (P3): 2394d192:worker/agent-context.ts:421 — P3: The Shape lists the `any` at `worker/agent-context.ts:421` among those to remove, and it is still there. The ticket's
- Spec (P3): 9694212a:docs/wayfinder/clean-up-before-features/build/tickets/50-agent-operation-table.md:43 — P3: runner.md "Review and close" says the Done section records "
- Validation gaps (gap): `src/agent-transport.ts:24`, `:234` and `:343`: command, read and Media admission now come from the table, but no test sends `createLiveTransport` a message fro
- Validation gaps (gap): `shared/agent-edit.ts:88`: `queue` now takes its operation from `agentTools[request.tool].operation`. No test asserts which command each edit tool queues. Add a
- Validation gaps (gap): `worker/mcp.ts:808`: `pausedMcp` now takes `unknown` and casts `(body ?? {})`. Add a test for `pausedMcp(null)`, `pausedMcp("x")` and `pausedMcp({ method: "tool

