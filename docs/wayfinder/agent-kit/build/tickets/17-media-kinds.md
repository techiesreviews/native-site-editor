---
title: "One media-kind table, used everywhere"
type: task (AFK)
status: open
assignee:
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
