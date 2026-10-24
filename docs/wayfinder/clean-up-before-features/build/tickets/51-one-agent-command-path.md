---
title: "One agent command path in the tab (N1)"
type: task (AFK)
status: closed
assignee: lead-51
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

## Done (2026-10-24)

Each refusal an agent edit can get is now decided by one layer. Agents see the same results, receipts, duplicate handling and `get_command_status`; a few refusals come later or in other words (listed below).

- **Worker, shape only** (`shared/agent-edit.ts` `editShapeProblem`, called once in `worker/mcp.ts` `edit()` before anything is sent): protected and invalid paths (edit, write, move, delete), media files as text, the 1 MB text limit, the same path for a move, a new page's address, title or description, element or selector, element ids, a new component's name, and before or after (now also "Give before or after, not both." for `add_section` and `move_section`, which the tab used to decide).
- **The tab's preparation** (`prepareAgentEdit`): it no longer reads outlines or components. What is left: finding a page or parent page by name, the page shown (`inspect_preview`), `open_page`'s path, and a file edit's text (missing or existing file, the hash the agent read, replacements, unchanged, a file in the way, the edited text's size). It reads only `pages` and `site.openRoute` of the context (`EditContext`).
- **The live page** (`src/agent-site.ts` `applySiteCommand`): the page's hash, a named section (`No section X on this page. get_page lists them.`), where a section goes (several places or none), and the component (`No component <x>.`, `<x> is not a section component (…)`, checked inside the guarded edit against the site shown). `add_section` and `move_section` commands now carry the agent's `before`/`after`, not `container`/`index`; `move_section` and `remove_section` no longer carry the section's `tag` (`shared/agent.ts` `AgentCommandArgs`). Taken component names, `<main>` and component instances are decided only by the editor's Make component; siblings-only only by Block move.
- The tab's last-line protected-path guard (`refuseProtected`) and the guarded commit's `.github` guard stay as safety guards for commands that did not come through the Worker (`tests/workflow-protection.test.ts` requires them). They are not counted as refusal decisions.
- Wording changes: a stale page hash for make/add/move/remove now says "X changed in the editor since it was read. Read it again." (was "X changed since you read it (its hash is now H)."). "That section is not on the page any more." and "That place for sections is not on the page any more." became "No section X on this page. get_page lists them."; "Say where the section goes." is gone; "<x> is not a section component." became the longer wording that preparation used before. Refusals that moved from preparation to the live page now arrive as a conflict after dispatch, ending "Nothing was changed; your drafts are as they were."
- `agentPresenceTarget` (ticket 33) works out an added section's place from `before`/`after`, or from the page's one place for sections.
- Tests: `tests/agent-tools-edit.test.ts` "every refusal an agent edit can get is decided in one layer…" lists 46 refusals across all 12 edit tools. For each one it checks the wording is spelled once in its deciding file and in no other file on the command's path. It also runs the edit through Worker shape, preparation and live page, and checks that the named layer is the first to refuse, that preparation never re-decides a Worker refusal, and that editor-control rules are decided by none of the three. A hand-added duplicate check fails it. The command-shape test also checks each tool's queued operation against the table. Moved refusal checks: `tests/mcp-runtime.test.ts` (make/add queued for the live page; add's new args), `tests/agent-site.test.ts` (move by anchor), `tests/agent-presence.test.ts` (anchors, one place, several). `tests/support/outline-document.ts` is the shared Node `document` for `pageOutline`. The duplicate and unknown-outcome tests are unchanged.
- No `src/main.ts` change. Outside the Files list: `shared/agent.ts` (the two command args) and `tests/support/outline-document.ts`.
