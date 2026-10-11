---
title: Research responsive images, crop and focus point in plain HTML
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

What HTML and CSS should the editor write so images are responsive, cropped and focused, using only plain files on a static server? Responsive: `srcset` with `sizes` versus `<picture>` with AVIF/WebP/JPEG sources, how many widths to make and which (fixed 480/960/1600 today versus widths chosen from the image and the layout), and how to get `sizes` right instead of guessing (for example measuring the image's rendered width in the editing preview at a few screen widths, or `sizes="auto"` with `loading="lazy"` and its browser support). Crop: making a new cropped file versus showing a crop with `aspect-ratio` and `object-fit`, and what each means for responsive copies and for the same file used in two places. Focus point (set per place, settled): `object-position` written inline, a CSS custom property, or a data attribute, and how it behaves inside component slots and when the crop changes by screen size (art direction with `<picture media>`). Also: what to do with CSS background images and `og:image`. Survey prior art briefly: WordPress, Webflow, Framer, Squarespace focal point, Sanity hotspot and crop, Cloudinary/imgix gravity. Check today's markup code (`src/page-builder/media-markup.ts`) and say what it would need to change.
