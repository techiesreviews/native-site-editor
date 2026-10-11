---
title: Research the images on existing sites
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The fix-all will bring old images and images from other websites up to standard (settled). What exactly would it face? In `~/Projects/techies-reviews` and `~/Projects/native-site-editor-starter`: list the other websites images load from (hosts, counts, whether they still answer, whether their responses allow a browser to fetch them across origins, which matters because the editor runs in the browser and may need its Worker to fetch for it), images under `images/` that no page uses, duplicates (same bytes or same picture at different sizes), heavy files (over 200 KB, GIFs), images missing `width`/`height` or alt text, CSS background images, `og:image` and `twitter:image` values, and image addresses inside component templates, JSON or JS. Note anything the fix-all must not touch (logos as SVG, images inside `<a>` downloads, third-party embeds). Also check how the editor's Worker could fetch an outside image on the user's behalf today (`worker/`), and any limits there. Give counts and a few typical examples, not full dumps.

## Resolution (2026-10-11)

Full findings: branch `research/mm-05-images-on-sites` (commit e31b6dc8), file `docs/wayfinder/media-manager/research/05-images-on-sites.md`. Counted from a read-only export of techies-reviews `origin/main` (the local checkout is 36 commits behind), so numbers differ from the charting notes.

1. **Images from other websites:** techies-reviews has 77 on 9 pages from 60 sites (67 on the resources page), plus 79 YouTube stills in JSON-LD and a home hero picture a script swaps in. The starter has none.
2. **About one in four is already broken:** 16 of the 60 sites fail. Of the 44 that answer, 24 allow a browser to read them across sites.
3. **The editor blocks every outside image itself.** Its security policy stops them showing in the canvas and stops its code fetching them (tested in a headless browser). The fix-all must fetch through the Worker or loosen that policy.
4. **The Worker has no route for this.** A new one needs guards (no private addresses, check it is a picture, a size cap, a rate limit) and batching, since Cloudflare's free plan allows 50 fetches per request.
5. **Unused files:** 60 files, 13.4 MB, including the 11.2 MB GIF and 33 old logo SVGs. Delete unused misses uses written as full `https://techies.review/...` addresses (all 104 share images), JSON-LD and script-loaded videos.
6. **Duplicates and heavy files:** one exact duplicate and three accidental look-alikes. Eight hand-made responsive sets on the home page are named so the editor doesn't recognise them; the fix-all should adopt them, not copy them. 15 files are over 200 KB, 8 wider than 2400 px.
7. **Alt text and sizes:** 490 of 533 images have empty alt (decorative), so a missing-alt check finds nothing; 113 lack `width`/`height`. No CSS background images, no `twitter:image`. The starter's share images point at Lex's test address.
8. **Must not touch:** SVG logos, affiliate banners, script-driven images, YouTube embeds and stills, sample code inside articles, and component templates (one change reaches 98–104 pages).
