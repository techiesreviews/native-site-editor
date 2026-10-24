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
- Wording changes: a stale hash has one wording, file or page: "X changed in the editor since it was read. Read it again." (`changedSinceRead`, `shared/agent-edit.ts`; was "X changed since you read it (its hash is now H)." for files and pages alike). Moving or deleting a missing file says "No file or folder at X." (was "X does not exist."). "That section is not on the page any more." and "That place for sections is not on the page any more." became "No section X on this page. get_page lists them."; "Say where the section goes." is gone; "<x> is not a section component." became the longer wording that preparation used before. Refusals that moved from preparation to the live page now arrive as a conflict after dispatch, ending "Nothing was changed; your drafts are as they were."
- `agentPresenceTarget` (ticket 33) works out an added section's place from `before`/`after`, or from the page's one place for sections. This is a best guess for the picture only, and the code comment says so: where the browser repairs markup it can differ from `placement`, which alone decides.
- A refused page change never moves Lex to its page: the live page checks the page's text (its hash, the component's being a section component, then the named section and where a section goes, a section's exact place for removal) before `openPage` opens it. A wrong component is told before a wrong place, as preparation did, and the text must be the same once opened. Make component's own rules for the element and the name (`<main>`, an instance, a taken name, its plan's refusals) still run on the opened page, because that control works on the page shown. A mistyped element or name there opens the page and is then refused. This is an accepted change; before, preparation caught `<main>`, instances and taken names from the context without opening.
- Whether a component is a section component is now read from the site's template (`r`, or `peek` before opening), not from the section tags taken before the step.
- A command that did not come through the Worker and has a bad element id (`make_component`, `inspect_preview`) is refused as malformed ("This change is malformed: X is no element id. Nothing was changed.") before anything opens. This is a guard like `refuseProtected`, not an agent's refusal.
- Tests: `tests/agent-tools-edit.test.ts` "each refusal listed for an agent edit is decided in one layer…" lists 54 refusals across all 12 edit tools. That covers every one the Worker, preparation and the live page's own checks give, plus examples from the editor controls the command runs through (their other rules are in their own tests). Not listed: the add and remove "could not be placed or located exactly" refusals, which come only from markup the editor cannot locate. For each one it checks the wording is spelled once in its deciding file and in no other file on the command's path. It also runs the edit through Worker shape, preparation and live page, and checks that the named layer is the first to refuse, that preparation never re-decides a Worker refusal, and that editor-control rules are decided by none of the three. A hand-added duplicate check fails it. The command-shape test also checks each tool's queued operation against the table. Moved refusal checks: `tests/mcp-runtime.test.ts` (make/add queued for the live page; add's new args), `tests/agent-site.test.ts` (move by `after` and by `before`, the bad-id guard), and in `tests/agent-tools-edit.test.ts` "a section goes before or after the section named" (also with none named: the end of `<main>`, or of the page itself) and "a page change refused by the page's text never opens the page". The one-layer test also runs each Worker refusal (other than the declared protected-path guards) on the live page and checks that it is not decided there. Where preparation's command can still be made without its check (a stale or oversized file edit, an existing, missing or blocked file write, a missing parent page), the test runs that command on the live page and checks that it is not refused the same way. `make_component`'s bad-id test checks that the page is not opened, `tests/agent-presence.test.ts` (anchors, one place, several). `tests/support/outline-document.ts` is the shared Node `document` for `pageOutline`. The duplicate and unknown-outcome tests are unchanged.
- No `src/main.ts` change. Outside the Files list: `shared/agent.ts` (the two command args) and `tests/support/outline-document.ts`.
