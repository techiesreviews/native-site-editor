---
title: The Social image sharing copy
type: task (AFK)
status: open
assignee:
blocked_by: [25-image-recipe]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Other contexts"; research 03 §7.

- Choosing a Social image (Site settings, page details) makes a separate 1200 × 630 JPEG sharing copy, trimmed around the centre; the chosen image is untouched; the copy has no responsive copies.
- `og:image` points at the copy at a **full address** built from the site's address (today a root link: `src/page-builder/site-settings.ts:405`, `shared/starting-point.ts:165`).
- With no site address set, write a root link and show a note asking for the address ★.
- CSS background images get one prepared file, no copies, no `@media` rules.

## Done when

- `tests/social-image.test.ts`: size, format, centre trim, full address, the no-address note.
- Nightly spec: set a Social image in Site settings; `og:image` is a full `https://…` address of the 1200 × 630 copy.
