---
title: Decide how unused media is cleaned up safely
type: grilling (HITL)
status: closed
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

## Resolution (2026-10-13)

Lex confirmed the complete plan, including the connecting details marked ★ here, by choosing **Yes, confirm and close**. Only this planning ticket closes; implementation, pushes and deployments remain unauthorised. The clean-up screens follow the selected [Tiles mockup](../prototype/tiles.html) (ticket 06).

**What counts as used.** A media file counts as used if its name or address appears anywhere in the site's text files: pages, styles, component templates, sharing-picture tags (including full addresses on the site's own domain), scripts, `sitemap.xml`, feeds, data files, `_redirects`/`_headers` and notes such as `AGENTS.md`. Keeping an unneeded file is preferred to offering a needed one. Details list where each mention was found. ★ The editor checks by itself when a site opens. A file not yet checked shows **Not checked yet** and is never suggested; if any site file cannot be read, nothing is suggested until it can (as today's scanner refuses). Zero page uses alone never means unused (ticket 06's badge rules stand).

**Always keep.** Any file can be marked **Always keep** in its details and is then never suggested for clean-up; ★ a small mark on the file shows it. This is the only protection for files used from outside the site (shared PDFs, newsletter pictures, addresses built by scripts). Every kind can otherwise be suggested, downloads included.

**What clean-up offers.** Files nothing uses, including trimmed copies no place uses (ticket 09), and leftover responsive copies whose main image is gone. Duplicates, large files (shrinking belongs to the [fix-all](11-fix-all-existing-images.md)) and kept originals are not part of clean-up.

**How Lex finds out.** A small count badge on the **Media tab**, like an unread count on an app icon, visible from anywhere in the editor. Inside Media, Clean up in More shows the same count and opens the review. The badge goes away when nothing is left or Lex dismisses it; ★ after dismissing it returns only when new unused files appear. ★ The review follows the mockup: groups with preview collages, count and size, larger previews, file-level selection, confirmation and Undo.

**Removing and getting files back.** Removed files appear in a **Recently removed** list in Media for 30 days, and one click restores a file, even after saving. GitHub projects restore from the repository's history, so the site does not grow and removed files are not reachable by visitors. Local folder projects keep a copy in the browser for 30 days; clearing the browser's data loses it. ★ Before saving, Undo works as for other changes. ★ A restored file returns to the same address, so pages that used it work again. Removing a file that is still used, from its details, warns with the pages that use it and that their pictures will break, then allows it; Lex can open a page to swap the picture first.

**Image families.** ★ Removing an image removes its whole Image family (responsive copies and any retained original) as one item, and restoring brings the family back. Trimmed copies made from it are separate media files and stay while a place uses them. ★ When re-cropping replaces an old trimmed copy (ticket 09), the old one also goes to Recently removed.

**Scope.** What agents may do with clean-up belongs to [Decide what agents may do with media](13-what-agents-may-do.md). Existing-file renames and collection operations stay with [ticket 15](15-collections-and-file-names.md); removing a file from a collection is not removing the file. No editor implementation, push or deployment is authorised.
