---
title: Decide how unused media is cleaned up safely
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [04-research-media-code-today, 05-research-images-on-existing-sites]
---

## Question

Cleaning up unused images is a chore today. What counts as "used" (pages, component templates, CSS, `og:image`, JSON, JS, sitemaps, `_redirects`; addresses built by scripts can never be seen), and how sure must the editor be before it offers to delete? Does a deleted file go to a bin Lex can restore from, or is Undo before Publish enough? Are duplicates, responsive copies whose original is gone, kept originals and heavy files part of the same clean-up? Is clean-up a button Lex presses, a nudge the manager shows ("12 files unused, 4 MB"), or something done at Publish? How are files that look unused but might be linked from outside the site (shared PDFs, images in emails) protected?

## Comments

- 2026-10-13, getting files back: Lex chose a **Recently removed** list in Media. Removed files stay listed for 30 days and come back with one click, even after saving. The editor restores them from the site's saved history (GitHub), so the site does not grow and removed files are not reachable by visitors. (Alternatives declined: Undo only until saving; a hidden bin folder inside the site.)
- 2026-10-13, what counts as used: Lex chose **any mention counts**. A file counts as used if its name or address appears anywhere in the site: pages, styles, components, sharing pictures (including full addresses on the site's own domain), scripts, sitemap, feeds, data files and notes such as AGENTS.md. Keeping an unneeded file is preferred to offering a needed one; details say where each mention was found. (Alternatives declined: only real website uses, ignoring notes; today's pages-and-styles check plus a warning.)
