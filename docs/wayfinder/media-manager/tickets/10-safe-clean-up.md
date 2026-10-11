---
title: Decide how unused media is cleaned up safely
type: grilling (HITL)
status: open
assignee:
blocked_by: [04-research-media-code-today, 05-research-images-on-existing-sites]
---

## Question

Cleaning up unused images is a chore today. What counts as "used" (pages, component templates, CSS, `og:image`, JSON, JS, sitemaps, `_redirects`; addresses built by scripts can never be seen), and how sure must the editor be before it offers to delete? Does a deleted file go to a bin Lex can restore from, or is Undo before Publish enough? Are duplicates, responsive copies whose original is gone, kept originals and heavy files part of the same clean-up? Is clean-up a button Lex presses, a nudge the manager shows ("12 files unused, 4 MB"), or something done at Publish? How are files that look unused but might be linked from outside the site (shared PDFs, images in emails) protected?
