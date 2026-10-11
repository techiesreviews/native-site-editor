---
title: Research responsive images, crop and focus point in plain HTML
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What HTML and CSS should the editor write so images are responsive, cropped and focused, using only plain files on a static server? Responsive: `srcset` with `sizes` versus `<picture>` with AVIF/WebP/JPEG sources, how many widths to make and which (fixed 480/960/1600 today versus widths chosen from the image and the layout), and how to get `sizes` right instead of guessing (for example measuring the image's rendered width in the editing preview at a few screen widths, or `sizes="auto"` with `loading="lazy"` and its browser support). Crop: making a new cropped file versus showing a crop with `aspect-ratio` and `object-fit`, and what each means for responsive copies and for the same file used in two places. Focus point (set per place, settled): `object-position` written inline, a CSS custom property, or a data attribute, and how it behaves inside component slots and when the crop changes by screen size (art direction with `<picture media>`). Also: what to do with CSS background images and `og:image`. Survey prior art briefly: WordPress, Webflow, Framer, Squarespace focal point, Sanity hotspot and crop, Cloudinary/imgix gravity. Check today's markup code (`src/page-builder/media-markup.ts`) and say what it would need to change.

## Resolution (2026-10-11)

Full findings: branch `research/mm-03-responsive-crop-focus` (commit 87e5100b), file `docs/wayfinder/media-manager/research/03-responsive-crop-focus.md`. A few prior-art facts (Webflow widths, Squarespace focal point) come from forums and third-party guides.

1. **Plain `<img srcset sizes>` for everyday images, not `<picture>`.** About 97% of browsers show WebP, so a format fallback gains little. `<picture>` is only worth it for a different crop on phones, or for AVIF if ticket 02 makes it practical. Safari cannot make WebP in the browser, so today it uploads PNG (ticket 02).
2. **Copies belong to the file, `sizes` belongs to the place.** Each file gets one width set (proposed 480, 800, 1200, 1600, 2400, never above its own width), shared by every place it is used.
3. **Measure `sizes`, don't guess it.** The editor measures the image at several screen widths in the preview and writes the list; lazy images also get `sizes="auto, …"` (Chrome/Edge 126+, Firefox 150+, Safari 27 partial). `auto` needs `loading="lazy"` and `width`/`height`.
4. **Stop lazy-loading every image.** The first big image should load straight away with high priority; lazy-loading it slowed page load 13–15% in web.dev's test.
5. **Two kinds of crop.** A *shape* (square, 4:3, 16:9) is CSS per place (`aspect-ratio` + `object-fit: cover` + the focus point), with no new file. *Cutting* (zoom on a detail, trim an edge, rotate, a social card) makes a new media file and leaves the original alone. Cutting per place in CSS (`object-view-box`) is Chromium-only, so it is ruled out for plain files.
6. **The focus point is inline `object-position` on the image.** It needs no site stylesheet, works inside components, and only has an effect when the image is shaped by CSS. One focus point per place is enough for a first version.
7. **CSS backgrounds and `og:image` stay outside.** Backgrounds get Optimise only (CSS can't pick a background by width). The social image should be a 1200×630 JPEG crop at a full address, with no copies or focus point.
8. **`media-markup.ts` needs seven changes:** measured `sizes`, eager top images, `width`/`height` always set, editing single declarations inside `style`, the new width set, a check of root-relative addresses on GitHub Pages project sites, and a real bug fix: replacing an image inside an existing `<picture>` leaves the old `<source>` tags, so many visitors keep seeing the old image.
