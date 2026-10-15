---
title: Sharing pictures follow the lighter file, as a JPEG
type: task (AFK)
status: open
assignee: claude (mm-95 runner)
blocked_by: [72-improve-heavy-files]
builder: sol
phase: 6
---

## What

Follow-up from slice [72](72-improve-heavy-files.md#done-2026-10-15) (eb6ff20b, "Assumptions"). When Improve images makes a lighter AVIF file (Smallest files), `og:image`/`twitter:image` keep the old heavy file, because many sharing services cannot read AVIF. The old file then stays "used" and Clean up never offers it. Lead decision (2026-10-15): sharing tags get a lighter JPEG of the same picture.

- **WebP too.** Checked 2026-10-15: X lists WebP for cards, but LinkedIn does not show WebP sharing pictures, and Facebook's documentation names only JPEG, PNG and GIF (its apps show WebP anyway). LinkedIn is a major service, so the rule covers every lighter main that is AVIF or WebP. Today a WebP main is written into sharing tags; that changes. A lighter main that came out as JPEG or PNG (slice 25's smaller-main rule) is used as it is.
- **The sharing JPEG.** It is made from the old file's bytes, with the same width and height as the new lighter main: the old picture is shrunk only as far as the recipe's max width, never cropped or enlarged ★. Transparency goes on white, as in slice 36. JPEG quality is 82 ★ (no responsive copies, no kept original). It is named `<lighter main's name>-sharing.jpg` (e.g. `media/images/hero.avif` → `media/images/hero-sharing.jpg`), numbered when the name is taken. The record is `sharing: true`, so the Social image picker reuses it instead of making a slice 36 copy.
- **One family.** The JPEG belongs to the lighter main's family by name (a new `sharing` member beside copies, originals, still and subtitles). It is removed, restored, renamed, kept and counted as used together with that main. Slice 36's `-social.jpg` copies stay families of their own.
- **Repointing.** Every own-site `og:image`, `og:image:url`, `og:image:secure_url` and `twitter:image` (`property` or `name`) that the row's batch repoints from the old file goes to the JPEG at a **full address** built from the site's address (slice 36's `socialImageAddress`). With no site address it gets a root link, and the result notes slice 36's no-address message. A matching `og:image:type`, `og:image:width` or `og:image:height` beside it is updated to `image/jpeg` and the JPEG's size. Other mentions (pages, components, sitemaps, CSS, …) still go to the lighter main and its copies, as in slice 72.
- **When it is made.** It is made in the same batch (the same Undo) as the lighter main, and only when a sharing tag that batch rewrites mentions the old file. A later row, or a later run, that reuses the lighter file (`lighterFrom`) reuses its JPEG, or makes it then if it is missing. If the JPEG is not lighter than the old file, the sharing tags keep the old file and the result says so (the old file then stays in use).
- **Clean up.** Once nothing mentions the old file, Clean up offers it (Always keep still protects it). The slice 72 note "Sharing pictures keep … because many sharing services cannot read AVIF." goes away.
- **Unchanged.** JSON-LD, sample code, script-swapped and unticked pictures stay as they are (slices 70 and 72). Outside addresses stay as written. A sharing tag that already points at a slice 36 `-social.jpg` copy is not touched.

## Done when

- `tests/improve-heavy.test.ts`: under AVIF and under WebP, a page's own-site `og:image` and `twitter:image` point at `<main>-sharing.jpg` at a full address. The JPEG is a JPEG with the main's width and height, and it is in the same batch and Undo. `og:image:type/width/height` follow. No site address gives a root link plus the note. A JPEG lighter main gets no extra file. A later row reuses the JPEG. A JPEG that is not lighter keeps the old file with a note. Clean up offers the old family, and the lighter family (JPEG included) is removed and restored together.
- `tests/media-families.test.ts` (or its current home): `x-sharing.jpg` joins `x.avif`/`x.webp`. It does not join a JPEG or PNG main, and does not join slice 36's `-social.jpg`. Renaming the family renames it.
- `npm run check`, unit, lint, and the media library and social image specs stay green. Boot grows by well under 1 KB.
