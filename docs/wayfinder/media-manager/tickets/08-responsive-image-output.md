---
title: Decide the responsive image output
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-research-responsive-output-crop-focus]
---

## Question

Use the confirmed adding policy in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13) for image preparation, responsive-copy widths, Image families and storage. Those choices are settled; this ticket decides their use on pages.

Given the research, what HTML does the editor write for an image on a page? `srcset` and `sizes` on `<img>`, or `<picture>` with modern formats first? How is `sizes` decided: guessed, measured in the editing preview, or `sizes="auto"`? What happens when Lex replaces an image that is already a `<picture>`, or one that came from WordPress with no copies? What happens inside component slots and for images set in CSS or `og:image`? Lex is not technical, so frame it by what visitors get (speed, sharpness) and what Lex has to do (ideally nothing).

## Comments

- 2026-10-13, Lex: **No backup format.** Everyday page images use one format per file (the format chosen at adding) with the visitor's browser picking the size, not `<picture>` with an older-format fallback. Accepted that the ~3% of browsers without WebP/AVIF support may not show the image.
- 2026-10-13, Lex: **Measure the size hint; the browser fine-tunes.** The editor measures how wide the image appears in the preview at phone, tablet and desktop widths when an image is placed, replaced or moved, and writes `sizes` from that. Images that wait to load also get `auto` first so supporting browsers use the real layout width. Lex does nothing. Rejected: today's single-width guess, and always sending the largest file.
- 2026-10-13, Lex: **Top images load first, automatically.** Images visible on the first screen (checked at phone and desktop widths) load straight away, the first large one with priority, and without `auto` in `sizes`. All others wait until the visitor scrolls near them. Re-checked whenever an image is placed, replaced or moved. No manual switch in the edit bar.
- 2026-10-13, Lex: **Replacing an image inside `<picture>` cleans it up into a plain image.** The `<picture>` and its `<source>` tags are removed and the new file is written as an ordinary placed image (one format, measured `sizes`, loading rule above), so every visitor sees the new picture. If the old `<picture>` was art-directed (`<source media>`), a short note says the new picture is now used on all screens. Rejected: rewriting the sources in place, and asking each time.
- 2026-10-13, Lex: **Older images get responsive copies when placed.** Placing or swapping in an existing raster image without copies makes the missing 480/960/1,600 copies beside it (only widths smaller than the image) and then places it like a new image. The existing file itself is not changed or re-optimised. Copies that already exist, such as WordPress-made sizes, are used instead of making new ones. Rejected: placing at full size until the fix-all, and a manual "Make faster" button.
- 2026-10-13, Lex: **Background images get one prepared file.** CSS backgrounds use the image prepared at adding (or the existing file), with no responsive copies and no extra `@media` rules written into site styles.
- 2026-10-13, Lex: **The social image gets a sharing copy.** Choosing a Social image makes a separate 1200 × 630 JPEG copy, trimmed around the centre by default, and `og:image` points at that copy at a full address. The chosen image is untouched. No responsive copies for it. How the trim is adjusted belongs to [Prototype crop and the focus point](09-prototype-crop-and-focus.md). Rejected: using the chosen file as is.

## Resolution (2026-10-13)

Lex confirmed the complete policy, including the connecting details, by choosing **Yes, confirm and close**. Only this planning ticket closes; implementation, pushes and deployments remain unauthorised. Image preparation, responsive-copy widths, Image families and storage follow [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13).

**Everyday page markup.** A placed image is a plain `<img>` with `srcset` and `sizes`, not `<picture>`. Each file has one format, the one produced at adding (WebP by default, AVIF when chosen); there is no older-format fallback, and Lex accepted that the ~3% of browsers without support may not show it. `srcset` lists the responsive copies that are smaller than the main image plus the main image at its real width; the retained original is never used on pages. `width` and `height` are always written from the file actually used.

**Size hint (`sizes`).** The editor measures how wide the image appears in the preview at phone, tablet and desktop widths (including either side of the site's own breakpoints, using the cover-adjusted width when the image is shaped by `object-fit: cover`) and writes `sizes` from those measurements, rounding up. It measures when an image is placed, replaced or moved. Images that wait to load get `auto, ` before the measured list so supporting browsers use the real layout width. This replaces today's single-width guess and the `960px` default.

**Loading order.** Images whose top is on the first screen at phone or desktop width load straight away, without `loading="lazy"` and without `auto` in `sizes`; the first large one gets `fetchpriority="high"`. All other images get `loading="lazy"`. Re-checked whenever an image is placed, replaced or moved. No manual switch in the edit bar.

**Replacing inside `<picture>`.** Replacing an image wrapped in `<picture>` removes the `<picture>` and its `<source>` tags and writes the new file as an ordinary placed image, fixing the bug where visitors kept seeing the old picture. If the old `<picture>` was art-directed (`<source media>`), a short note tells Lex the new picture is now used on all screens.

**Older images without copies.** Placing or swapping in an existing raster image that has no responsive copies first makes the missing 480/960/1,600 copies beside it (only widths smaller than the image, using the site's selected image recipe and the adding naming rules), then places it like a new image. The existing file itself is not changed or re-optimised. Copies that already exist, such as WordPress-made sizes, are used instead of new ones.

**Other contexts.** SVG needs no responsive copies and is placed as is with `width`/`height`. Images placed in component slots are ordinary places and get the same markup; a component template's own fallback image is left alone. CSS background images use one prepared file, with no responsive copies and no `@media` rules written into site styles. Choosing a Social image makes a separate 1200 × 630 JPEG sharing copy, trimmed around the centre by default, and `og:image` points at it at a full address; the chosen image is untouched and the sharing copy gets no responsive copies. Agents placing images get exactly the same output as Lex.

**Scope.** Adjusting crop, shape, focus point and the social-image trim belongs to [Prototype crop and the focus point](09-prototype-crop-and-focus.md). Bringing old and outside images up to standard, adopting hand-made responsive sets in bulk and re-measuring whole pages belongs to [Decide the fix-all for existing images](11-fix-all-existing-images.md). Animated GIFs become video and belong to [Decide how video, audio and documents are handled](12-video-audio-and-documents.md). Root-relative addresses (`/media/…`) breaking on sites served from a sub-folder (for example GitHub Pages project sites) are a site-wide address question, not specific to images, and are noted on the map under Not yet specified. No editor implementation, push or deployment is authorised.
