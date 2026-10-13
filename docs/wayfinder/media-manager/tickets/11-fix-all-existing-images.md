---
title: Decide the fix-all for existing images
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [05-research-images-on-existing-sites, 07-one-upload-path, 08-responsive-image-output]
---

## Question

The fix-all brings old images and images from other websites up to standard, page by page or all at once, with Undo (settled). What exactly does it do to each image: bring outside images into the site (which folder, which name), optimise, add responsive copies, add missing `width`/`height`, flag missing alt text? Which images does it skip (SVG logos, third-party embeds, ones it cannot fetch)? How does Lex see what it will change before it runs, and how big is one Undo step (one page, one batch, everything)? Where does it live: in the manager, on each page, or both? What does it do with the old outside addresses and with heavy GIFs? Outside images can only be fetched through a new, guarded Worker route or by loosening the editor's security policy (ticket 05): which is acceptable? Should it adopt hand-made responsive sets it finds?

## Comments

- 2026-10-13, where it lives: Lex chose **in Media, next to Clean up**. **Improve images** in Media's More menu opens a list of pages, each saying what would change (for example "6 pictures from other websites, 3 heavy"). Lex fixes one page or all of them. The Media tab's count badge (ticket 10) also counts this work. (Alternatives declined: a button on each page; both equally.)
- 2026-10-13, how outside pictures are fetched: Lex chose **the browser fetches them**, not a new Worker route. This means widening the editor's security policy so its code may load and read images from any website, and only hosts that allow cross-site reading can be brought in (24 of 44 live hosts on techies-reviews, research 05). A side effect: outside pictures would then show in the editor canvas. (Alternative declined: a guarded Worker route that fetches nearly every live host.)
- 2026-10-13, pictures it cannot bring in: Lex chose **leave and list them**. The picture stays as it is; the page's row says "Couldn't bring in N", marking each as website gone or not allowed, and Lex can drop in an own copy to replace one. (Alternatives declined: also removing dead pictures; skipping silently.)
- 2026-10-13, Undo size: Lex chose **per page, plus Undo all**. After a run, a list of the changed pages gives each its own Undo and one Undo all, so Lex can check a page and take back just that one. Nothing goes live until saved. (Alternatives declined: one Undo for the whole run; Undo per picture.)
