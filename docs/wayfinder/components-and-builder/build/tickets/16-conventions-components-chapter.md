---
title: "Conventions: one Components chapter for agents"
type: task (AFK)
status: closed
assignee:
blocked_by: [03-conventions-header-footer-wording]
builder: claude ★
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §1 and §4: the conventions (`worker/site-conventions.ts`) are the one source.

- Rewrite the Components chapter to cover: the file layout (template plus optional CSS, nothing registered); whole-element slots; the default editables rule ([03](../../tickets/03-default-editables.md)), stretched-link cards and nested instances; a repeated item as its own card component ([04](../../tickets/04-prototype-making-components.md) §7); repeated groups as the items slot so Add card works (an items slot is the unnamed slot or one whose fallback is a `card-…` component; decided at handoff, 5); card links (a link slot, or the title wrapped in a link and stretched by the card link rule of slice 65; decided at handoff, 3); variants ([07](../../tickets/07-variant-contract.md)) with `:host([data-x])`, nesting and the suggested `data-layout`/`data-tone`; tones on page bands only ([08](../../tickets/08-accessible-tone-text.md)); the header, footer and skip link ([02](../../tickets/02-masters-become-components.md)).
- State accurately what `add_section` copies (`src/native-insert.ts`, `slotMarkup` `:40`).
- The tool descriptions (`write_file`, `add_section` `:697`, `get_site` `:309` in `worker/mcp.ts`), `siteInstructions` and `src/agent-prompts.ts` state no rules of their own: they point to the conventions.
- Give the chapter clear bounds (from `## Components` to the next `## `) so slice 18 can compare it.
- Tones are described now; the starter catches up in phase 7.

## Done when

- The chapter covers every point of 05 §4; tool descriptions only point to it.
- `tests/mcp-runtime.test.ts` checks the chapter's key rules and that the tool descriptions hold no slot rules.

## Done (2026-10-09)

- `worker/site-conventions.ts`' Components chapter (from `## Components` to `## Styles and scripts`, cut out by the new `componentsChapter()` for slice 18) covers file layout, whole-element slots and the default editables rule, nested instances, card components in items slots, card links, variants, tones on bands, header/footer/skip link and what `add_section` really copies (`slotMarkup`). `write_file`, `add_section`, `get_site` and `siteInstructions` only point to it.
- Commits "Conventions: one Components chapter for agents (slice 16)" and "Components chapter review: …"; `tests/mcp-runtime.test.ts` asserts the chapter's bounds and key rules and that no tool description or the instructions state slot, fallback, variant or card rules.
- Left open: the starter's card link rule (`.cards > * …`, slice 67) does not reach card instances in a section component's items slot, whose `.cards` is in shadow DOM, so the chapter's own example only links the title.
