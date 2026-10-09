---
title: "Conventions: one Components chapter for agents"
type: task (AFK)
status: open
assignee:
blocked_by: [03-conventions-header-footer-wording]
builder: claude ★
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §1 and §4: the conventions (`worker/site-conventions.ts`) are the one source.

- Rewrite the Components chapter to cover: the file layout (template plus optional CSS, nothing registered); whole-element slots; the default editables rule ([03](../../tickets/03-default-editables.md)), stretched-link cards and nested instances; a repeated item as its own card component ([04](../../tickets/04-prototype-making-components.md) §7); repeated groups as the items slot so Add card works; variants ([07](../../tickets/07-variant-contract.md)) with `:host([data-x])`, nesting and the suggested `data-layout`/`data-tone`; tones on page bands only ([08](../../tickets/08-accessible-tone-text.md)); the header, footer and skip link ([02](../../tickets/02-masters-become-components.md)).
- State accurately what `add_section` copies (`src/native-insert.ts`, `slotMarkup` `:40`).
- The tool descriptions (`write_file`, `add_section` `:697`, `get_site` `:309` in `worker/mcp.ts`), `siteInstructions` and `src/agent-prompts.ts` state no rules of their own: they point to the conventions.
- Give the chapter clear bounds (from `## Components` to the next `## `) so slice 18 can compare it.
- Tones are described now; the starter catches up in phase 7.

## Done when

- The chapter covers every point of 05 §4; tool descriptions only point to it.
- `tests/mcp-runtime.test.ts` checks the chapter's key rules and that the tool descriptions hold no slot rules.
