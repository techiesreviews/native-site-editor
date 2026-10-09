---
title: Reword the conventions for the header, footer and skip link
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Ticket [02](../../tickets/02-masters-become-components.md) §3, word for word.

- `worker/site-conventions.ts`: the sentence "The header and footer are components without slots…" becomes ticket 02's text (nav links in the template; the skip link `<a class="skip" href="#main">Skip to content</a>` before `<site-header>` in each page, styled in the shared CSS).
- "Write both files, add the tag to the loader and `site.css` (above), then place it with add_section…" drops the register step: "Write both files, then place it with add_section…".
- Slice 16 rewrites the whole chapter later; this is only the wording ticket 02 fixed.

## Done when

- The conventions say the new header/footer sentence and no longer say "add the tag to the loader".
- `tests/mcp-runtime.test.ts` asserts both.

## Done (2026-10-09)

- `worker/site-conventions.ts` carries ticket 02's header/footer sentence (nav links in the template, skip link before `<site-header>`, its style in the shared CSS) and "Write both files, then place it with add_section…" without the loader/`site.css` step.
- `tests/mcp-runtime.test.ts` asserts the new sentence and that "add the tag to the loader" is gone.
