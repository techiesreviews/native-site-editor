---
title: Decide the responsive image output
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [03-research-responsive-output-crop-focus]
---

## Question

Use the confirmed adding policy in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13) for image preparation, responsive-copy widths, Image families and storage. Those choices are settled; this ticket decides their use on pages.

Given the research, what HTML does the editor write for an image on a page? `srcset` and `sizes` on `<img>`, or `<picture>` with modern formats first? How is `sizes` decided: guessed, measured in the editing preview, or `sizes="auto"`? What happens when Lex replaces an image that is already a `<picture>`, or one that came from WordPress with no copies? What happens inside component slots and for images set in CSS or `og:image`? Lex is not technical, so frame it by what visitors get (speed, sharpness) and what Lex has to do (ideally nothing).

## Comments

- 2026-10-13, Lex: **No backup format.** Everyday page images use one format per file (the format chosen at adding) with the visitor's browser picking the size, not `<picture>` with an older-format fallback. Accepted that the ~3% of browsers without WebP/AVIF support may not show the image.
- 2026-10-13, Lex: **Measure the size hint; the browser fine-tunes.** The editor measures how wide the image appears in the preview at phone, tablet and desktop widths when an image is placed, replaced or moved, and writes `sizes` from that. Images that wait to load also get `auto` first so supporting browsers use the real layout width. Lex does nothing. Rejected: today's single-width guess, and always sending the largest file.
