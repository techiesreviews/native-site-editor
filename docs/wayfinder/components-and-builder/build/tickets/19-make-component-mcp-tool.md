---
title: "MCP: make_component"
type: task (AFK)
status: open
assignee:
blocked_by: [10-card-becomes-component]
builder: sol
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §5, without the copies flag (ticket 15).

- A new tool in `worker/mcp.ts`, queued to the editor tab like `add_section` (`:697`, `queue` `:721`), with its fields in `shared/agent.ts`, run by `src/agent-site.ts` (beside `add_section`, `:476`).
- It takes a page, an element (addressed the way the other element tools address one), a tag and an optional list of slots to keep fixed. It runs `makeComponentPlan` (slices 07–10), writes the component files and replaces that element on that page only, as one undo step.
- Its description points to the conventions and states no rules.

## Done when

- Unit test in `tests/mcp-runtime.test.ts` for the tool's schema and command.
- `@smoke` test in `tests/native-save/native-mcp.spec.ts`: `make_component` turns a section into an instance with whole-element slots and drafts the files.
