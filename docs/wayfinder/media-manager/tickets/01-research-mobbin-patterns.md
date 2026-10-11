---
title: Research media manager designs on Mobbin
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex wants a fresh, nicer design for every media screen, with Mobbin as the inspiration guide. Using the `mcp__mobbin__*` tools, collect the strongest patterns from real products for: a media library (grid and list, search, filters, folders, tags, bulk selection, empty state), uploading with progress and an optimise step, a detail panel for one file (preview, name, alt text, size, where it is used), a "choose media" picker opened from a spot on a page, crop and focus point tools, and a clean-up view for unused or heavy files. Good sources: Framer, Webflow, Squarespace, Wix, Shopify Files, WordPress, Notion, Google Photos, Dropbox, Figma, Canva, Sanity, Contentful. For each pattern, save the screenshot link, name the product, and say in one line what makes it work. End with a short list of five to eight patterns that would suit an editor whose only user is not technical and often works on a tablet or phone. This feeds the look prototype.

## Resolution (2026-10-11)

Full findings: branch `research/mm-01-mobbin-patterns` (commit d0c211b7), file `docs/wayfinder/media-manager/research/01-mobbin-patterns.md`: about 70 Mobbin screens with one line each. The full-size image links expire around 2026-11-10 (the Mobbin page links don't), so the look prototype should download what it shows before then.

1. **Mobbin has no tablet screens**, only web and iPhone, so tablet advice comes from web layouts and iPhone patterns. Sanity, Contentful, Figma and WordPress have no media screens there.
2. **Detail panel: Shopify's file editor is the closest model.** Big preview, then name, alt text, size and dimensions, and a "Used in" line; crop and focus point right below.
3. **Optimise step: Klaviyo.** Original and optimised copy side by side with "−82%", the smaller one already chosen and marked Recommended; detailed settings behind a small button.
4. **Upload progress drawn on the new tile itself** (Savee, Canva on phone), plus a small corner tray (Shopify, Proton) where failed files stay easy to find.
5. **Picker: Squarespace's Replace menu (Upload / From library) and Shopify's phone picker**, with search, "Used in" and "File size" filters and a big add button at the bottom.
6. **Focus point on the placed image, not in the library (Squarespace)**, matching the edit-bar decision; Eventbrite adds live square and wide previews. **Crop as a few named shapes on big tiles** with one recommended (Pinterest, Klaviyo), not number boxes.
7. **Clean-up as grouped suggestions with sizes, reviewed card by card** (Google One, Google Photos' swipe to keep); warn when in use and allow undo (Squarespace's 30-day Trash). Wix's step-by-step fixer is a model for the fix-all.
8. **Shortlist of eight patterns:** the plain detail card with where it is used, before/after optimise, progress on the tile, a thumb-friendly picker, focus point per place with previews, named crop shapes, clean-up with suggestions and Undo, and a floating bar for selecting many files.
