---
title: "MCP: make_component"
type: task (AFK)
status: closed
assignee:
blocked_by: [10-card-becomes-component]
builder: sol
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §5, without the copies flag (ticket 15).

- A new tool in `worker/mcp.ts`, queued to the editor tab like `add_section` (`:697`, `queue` `:721`), with its fields in `shared/agent.ts`, run by `src/agent-site.ts` (beside `add_section`, `:476`).
- It takes a page, an element (addressed the way the other element tools address one), a tag and an optional list of slots to keep fixed. It runs `makeComponentPlan` (slices 07–10, and slice 64's CSS once it has landed), writes the component files and replaces that element on that page only (its repeated items becoming card instances, decided at handoff 4), as one undo step. It refuses `<main>`, `<body>`, the header and footer components, and anything inside an instance, with the reason.
- Its description points to the conventions and states no rules.

## Done when

- Unit test in `tests/mcp-runtime.test.ts` for the tool's schema and command.
- `@smoke` test in `tests/native-save/native-mcp.spec.ts`: `make_component` turns a section into an instance with whole-element slots and drafts the files.

## Done (2026-10-09)

- `make_component` (`worker/mcp.ts`): page, element id, tag, optional `fixed` slot names, page hash; the Worker refuses bad ids and tags, taken tags, `<main>`/`<body>` and existing components (the header and footer by name), then queues it. The tab (`applySiteCommand` → `makeFromAgent` in `src/page-builder/components.ts`) plans against the hashed source, maps `fixed` names to paths (`fixedSlotPaths`), refuses with the plan's reason, and reuses Make component's one-undo-step write; the result lists files, slots, cards, notes and the new hash.
- Commits "MCP: make_component turns one element of a page into a component" and a review-fix commit on `dev` (Sol built, Claude reviewed). Slice 64's CSS reaches it through `makeComponentPlan` once landed; its notes come back in `result.notes`.
- Tests: `tests/mcp-runtime.test.ts` (schema, refusals, queued command), `tests/agent-site.test.ts`, `tests/component-model.test.ts` (`fixedSlotPaths`), `@smoke` "make_component drafts files and whole-element slots in one undo step" in `tests/native-save/native-mcp.spec.ts`.
