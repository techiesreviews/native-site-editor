---
title: Decide the fix-all for existing images
type: grilling (HITL)
status: open
assignee:
blocked_by: [05-research-images-on-existing-sites, 07-one-upload-path, 08-responsive-image-output]
---

## Question

The fix-all brings old images and images from other websites up to standard, page by page or all at once, with Undo (settled). What exactly does it do to each image: bring outside images into the site (which folder, which name), optimise, add responsive copies, add missing `width`/`height`, flag missing alt text? Which images does it skip (SVG logos, third-party embeds, ones it cannot fetch)? How does Lex see what it will change before it runs, and how big is one Undo step (one page, one batch, everything)? Where does it live: in the manager, on each page, or both? What does it do with the old outside addresses and with heavy GIFs? Outside images can only be fetched through a new, guarded Worker route or by loosening the editor's security policy (ticket 05): which is acceptable? Should it adopt hand-made responsive sets it finds?
