---
title: "One media-kind table, used everywhere"
type: task (AFK)
status: closed
assignee: ak-17
blocked_by: []
builder: sol
---

## What

- `shared/media-kinds.ts`: one table extension → kind (image, video, audio, document, font…) → MIME type, plus derived helpers (`mediaKind(path)`, `mimeType(path)`, `isImagePath`, `extensionsOf(kind)`, a ready regex per kind where callers need one).
- Switch every existing list over. **Behaviour stays identical**: before switching, record each old list's exact accepted set; where old lists disagree, keep each caller's old set via a named subset in the table (e.g. `optimisableImages`) and list each disagreement in the ticket's Done notes for Lex rather than silently unifying.
- `tests/media-kinds.test.ts`: for every switched caller, the old accepted extension set equals the new one (table-driven, old sets written out literally in the test).
- `tests/media-kinds-guard.test.ts`: source guard (tests/support/source-guard.ts conventions) failing on media-extension regexes or string lists (`jpe?g|png|webp|gif|avif|svg|mp4|webm|mov|mp3|wav|ogg|pdf`…) anywhere in src/shared/worker outside `shared/media-kinds.ts`, with a reasoned allowlist for genuine non-list uses.

## Files

- shared/media-kinds.ts (new)
- every src/, shared/, worker/ file that holds its own media extension list or regex (about 30: shared/agent.ts, src/page-builder/media-names.ts, media-spot-pick.ts, media-video-place.ts, media-storage.ts, native-create.ts, replace-everywhere.ts, image-optimise.worker.ts, video-prepare.ts, media-mentions.ts, media-families.ts, improve-images.ts, improve-heavy.ts, github-trip.ts, media-replace-rules.ts, media-rename.ts, media-limits.ts, native-settings.ts, worker/site-conventions.ts, …)
- `tests/media-kinds.test.ts`
- `tests/media-kinds-guard.test.ts`

## Done when

- check, unit, lint pass; the media browser specs (`kit specs --affected` or the media specs by hand) pass; boot bytes unchanged or smaller (report the delta).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

**Behaviour.** `shared/media-kinds.ts` holds one table (one extension string per kind: image, font,
audio, video, document, archive, binary), the MIME types (`${kind}/${extension}` plus spelled-out
exceptions), the helpers `mediaKind`, `mimeType`, `isImagePath`, `extensionsOf`, and one named
subset per caller policy. 34 files switched: shared/agent.ts, shared/asset-types.ts, src/uploads.ts,
src/native-{settings,structure,create}.ts, src/controllers/file-operations-controller.ts,
src/components/file-type.ts and 26 page-builder modules. Every caller keeps its exact old set,
flags, anchoring and input form; nothing was unified. The ticket's examples github-trip.ts,
media-rename.ts, video-prepare.ts and worker/site-conventions.ts hold no extension list (only
single formats or prose), so they are unchanged. Allowlisted with reasons in the guard: the Vite
`import.meta.glob` in onboarding-media, onboarding screenshot names, Mediabunny container names,
encoder names and labels, user-facing prose and the agent conventions text.

**Disagreements between old lists, for Lex** (base = jpg jpeg png webp avif; each kept as its own subset):

- Pictures: agent previewable pictures = base + gif svg; preview/structure/uploads/assets = base + gif
  svg ico bmp; agent and families image kind = that + tif tiff heic heif; trim, settings social
  picture, file details, older copies, social image/sharing = base + gif bmp; Improve images raster
  = base + gif bmp tif tiff; Replace everywhere = raster + heic heif; adding (needs preparation) =
  base + bmp svg heic heif (no gif); transparency = png webp gif avif svg; palette icons = base + gif
  ico (no svg, bmp).
- Video: placement, play, picker accept and agent spot = mp4 m4v webm mov ogv; agent kind, storage
  preparation and spot names add avi mkv mpeg mpg; Media limits "suitable" accepts only mp4 m4v webm.
- Audio: play/canvas MIME = mp3 m4a aac oga ogg opus wav flac; agent kind adds aif aiff; adding
  converts wav ogg oga opus flac to M4A; limits advises re-export for flac aif aiff ogg oga opus wma;
  "suitable" accepts only mp3 m4a aac wav.
- Binary files: new-file creation = images (no svg, heic) + tif tiff pdf archives fonts and a few
  audio/video; file operations add heic heif; Media mentions' list is far wider (icns, psd, jxl,
  midi, office files, wasm, exe ...).
- Fonts and archives: Files tab fonts include eot, the preview's asset MIME map does not; mentions add
  ttc. Files tab archives = zip tar gz tgz 7z rar; Media tiles add bz2 xz; mentions add br zst.
- Documents: agent documents = pdf doc(x) xls(x) ppt(x) odt ods odp rtf epub csv; rename accepts only
  pdf among documents and no tif/tiff; Media tile type pictures add numbers, key, pages, txt, md.
- Formats: Replace picker MIME accept excludes gif and bmp; social picture accept includes both.
- Two `mediaKind` functions now coexist with different answers: shared/agent.ts (agent policy,
  txt/md/vtt are "other") and the table's own (txt/md/vtt/srt are "document"). Callers still use
  the agent one; unifying is Lex's call.

**Boot bytes.** `test:budget` (report only), cold bytes before first paint: 352 KB on origin/dev,
353 KB on this branch (budget 355 KB; median of 3), requests before paint 35 -> 36. Exact gzip: index.js 227,369 -> 226,929 B, plus the new media-kinds chunk
1,440 B loaded at boot: net about +1,000 B. The ticket asked for unchanged or smaller: the
remainder is lazy-only subsets that share the boot-imported module; splitting them into a second
module (for example `shared/media-kinds-policies.ts`, not in this ticket's Files) would save about
620 B more. Left for the lead.

**Commits.** f604229d (Sol build), 5957db95 (guard review fix).

**Tests.** New tests/media-kinds.test.ts (about 60 caller rows with the old sets written literally,
probed with every table extension in both cases and unknowns, plus MIME maps and accept strings)
and tests/media-kinds-guard.test.ts. npm run check, lint, unit (3,563 pass) pass. Browser specs
through port.sh: 21 media specs plus files, create, file ops, settings, image, improve images,
outside pictures, social, upload and asset-reference specs (39 files): 309 passed, 1 skipped
(@actual); the @actual group, run separately, passed 58 of 58.

**Review.** Sol review (saved under the main root .scratch/reviews/ak-17/review): fixed 1 (the guard
missed archive and office lists and space-separated strings; vocabulary widened, fixtures added);
1 not fixed here (boot bytes, needs a file outside the ticket: lead decision).

