---
title: "Make component only on container elements"
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `makeComponentOffered` offers Make component only on `section`, `div`, `article`, `aside`, `figure`, `nav` and a non-page `header`/`footer`; the edit bar follows it, and `make_component` (`makeFromAgent`) refuses other elements with a reason naming the allowed ones, after the plan's own refusals (component, inside an instance, `<main>`). Tool description, spec decision 10 and the Phase-2 bullet updated; the Components chapter had no "any element" wording, so the starter is unchanged. Slice 26's Structure menu had not landed.
- Commit "Make component only on container elements (slice 80)" (Sol built, Claude moved the MCP check after the plan's refusals).
- Tests: `tests/make-component-offer.test.ts` (each allowed kind, 33 refused kinds, containers inside an instance); browser specs `native-components`, `native-edit-bar`, `native-edit-bar-groups` now expect no Make component on a heading, link or paragraph; `native-mcp.spec.ts` "make_component refuses a heading with the allowed containers and writes no drafts".
