---
title: "A typed page URL is turned into a valid one, not refused"
type: task (AFK)
status: open
assignee: lead-39 (this session)
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-25): "When a person types in a new url, change it to use the right rules." Slice 40 made new page addresses strict (lowercase letters, digits and dashes, at most 80 characters, starting with a letter or digit) and refuses anything else. Instead, the field converts what is typed.

## Decided behaviour

- Wherever a new page address is typed (New page, New subpage, Change URL, and the name that becomes the address), the input is converted to the rules: lowercase; spaces, underscores and other separators become one dash; accents are dropped (é → e); anything else is removed; no dash at the start or end; at most 80 characters.
- The field shows the converted address as Lex types, so what he sees is what is saved; no refusal message, no toast. Converting runs as he types without moving the caret unexpectedly.
- An address that converts to nothing (only symbols) keeps the Create button disabled, as an empty field does today.
- Agents' `make_page` and other tools keep refusing invalid addresses (agents get a clear error); only the typed field converts.

## Files

The page-address rule from slice 40 (one function that converts, beside the one that checks), the New page / Change URL fields, their unit tests and the Pages specs.

## Done when

- Unit tests: "About Us!" → `about-us`, "Café Menü" → `cafe-menu`, "  --Hello__World--  " → `hello-world`, 100 letters → 80, "!!!" → empty.
- A Pages spec types "About Us" into New page and gets the page at `/about-us`.
- `npm run check`, `kit unit --affected`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-39 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/39-typed-url-is-converted.md --builder claude-opus-5-5`; `kit wait job slice-39 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size` (at or under 362 KB), `kit ux --ticket <this ticket>` for the visible change.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5`. Land: `kit pr --ticket <this ticket>`.
