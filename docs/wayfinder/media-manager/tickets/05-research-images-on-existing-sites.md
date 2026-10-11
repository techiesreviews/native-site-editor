---
title: Research the images on existing sites
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

The fix-all will bring old images and images from other websites up to standard (settled). What exactly would it face? In `~/Projects/techies-reviews` and `~/Projects/native-site-editor-starter`: list the other websites images load from (hosts, counts, whether they still answer, whether their responses allow a browser to fetch them across origins, which matters because the editor runs in the browser and may need its Worker to fetch for it), images under `images/` that no page uses, duplicates (same bytes or same picture at different sizes), heavy files (over 200 KB, GIFs), images missing `width`/`height` or alt text, CSS background images, `og:image` and `twitter:image` values, and image addresses inside component templates, JSON or JS. Note anything the fix-all must not touch (logos as SVG, images inside `<a>` downloads, third-party embeds). Also check how the editor's Worker could fetch an outside image on the user's behalf today (`worker/`), and any limits there. Give counts and a few typical examples, not full dumps.
