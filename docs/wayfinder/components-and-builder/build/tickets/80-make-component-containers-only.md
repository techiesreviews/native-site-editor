---
title: "Make component only on container elements"
type: task (AFK)
status: open
assignee:
blocked_by: [02-make-component-on-edit-bar, 19-make-component-mcp-tool]
builder: sol
phase: 3
---

## What

Lex (2026-10-09), narrowing handoff decision 10: Make component is offered only on container elements — `section`, `div`, `article`, `aside`, `figure`, `nav`, and a `header`/`footer` that isn't the page's own (inside an article, aside, section…) — not on headings, paragraphs, text elements, images, links, buttons or lists. The existing refusals stay (`<main>`, `<body>`, the page's header/footer, components, anything inside an instance).

- Change `makeComponentOffered` (`src/page-builder/component-model.ts`, slice 02) and everything that uses it: the edit bar, the Structure ⋯ menu and right-click (slice 26), and the `make_component` MCP tool's refusals (slice 19; refuse with a reason naming the allowed elements).
- Update the spec's decision 10 and the Components chapter if it says "any element" (copy into the starter's AGENTS.md and refresh the fixture if the chapter changes).

## Done when

- Unit tests for the offer rule (each allowed and refused kind); the existing browser specs that expect "Make component…" on a heading or paragraph updated to expect none (not loosened); `make_component` refuses a heading with the reason.
