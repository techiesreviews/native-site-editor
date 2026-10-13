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
- 2026-10-13, files used outside the site: Lex chose an **Always keep** mark only. Any file can be marked Always keep in its details and is then never suggested for clean-up. Every kind, PDFs and other downloads included, can otherwise be suggested; the Recently removed list covers mistakes. (Alternatives declined: never suggesting downloads automatically; no extra protection.)
- 2026-10-13, what clean-up covers: besides files nothing uses, Lex chose only **leftover smaller copies** (responsive copies whose main image is gone). Not in clean-up: same picture twice, large files to shrink (fix-all territory, ticket 11) and kept originals.
- 2026-10-13, how Lex finds out: asked to choose between a quiet note in Media, only a Clean up button, or an offer when saving, Lex answered **"Notification icon, like done on apps"**: a badge rather than a text line. Where it sits is asked next.
- 2026-10-13, badge place: Lex chose **on the Media tab**: a small count, like an unread count on an app icon, visible from anywhere in the editor. Inside Media, Clean up in More shows the same count and opens the review. The badge goes away when nothing is left to tidy or Lex dismisses it. (Alternatives declined: only inside Media; an editor-wide bell.)
- 2026-10-13, local folder projects: Lex chose to **keep a copy in the browser** for 30 days, so Recently removed works the same as on GitHub. Clearing the browser's data loses those copies. (Alternatives declined: Undo only until saving to the folder; moving removed files into a folder on the computer.)
- 2026-10-13, removing a file that is still used: Lex chose **warn, then allow**. The remove screen lists the pages that use it and says their pictures will break; Lex can open a page to swap the picture first or remove anyway. The file still goes to Recently removed. (Alternatives declined: refusing until unused; also taking the picture out of every page.)
