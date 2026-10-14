---
title: Replacing inside picture cleans it up
type: task (AFK)
status: closed
assignee: claude (mm-34 runner)
blocked_by: [33-placed-image-markup]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Replacing inside `<picture>`"; research 03's bug: today the old `<source>` tags stay, so visitors keep seeing the old picture.

- Replacing an image wrapped in `<picture>` removes the `<picture>` and its `<source>` tags and writes the new file as an ordinary placed image (classes and attributes on the `<img>` kept).
- If any `<source>` had `media` (art direction), a short note tells Lex the new picture is now used on all screens.
- One Undo step.

## Done when

- `tests/media-markup.test.ts`: plain picture, picture with type sources, art-directed picture (note raised), attributes kept.
- Nightly in `native-image-markup.spec.ts`: replace inside a `<picture>`; no `<source>` remains.

## Done (2026-10-14)

- **Behaviour.** Replacing an image wrapped in `<picture>` (the picker's Use and agent `place_media`, both through `placeMediaImage`) removes the `<picture>`, its `<source>` tags and anything else inside it except the image, and writes the new file as an ordinary placed image (slice 33's markup). Whitespace around the picture stays. Everything on the `<img>` is kept (class, alt and the description rules, `data-*`, `style`, `id`, `slot`). A `slot` on the `<picture>` moves to an image without its own, so component fills keep their slot. Other `<picture>` attributes are dropped (ticket 08). It stays one Undo step on every path: plain change, records batch (Decorative or description swap) and files added in the picker. The selection follows the image to the picture's old place. If any `<source>` had `media` (art direction), the announcement reads "Image replaced. The new picture is now used on all screens."
- **Measuring.** When a stand-in image is given, the preview's measuring copy replaces the `<picture>` with its image (slot carried), so `sizes` and loading follow the unwrapped layout. Place-frame (slice 38) sends no stand-in image, so its measurement is unchanged.
- **Replace everywhere (slice 53) aligned.** An HTML `<img>` that shows the replaced family (or a switched trimmed family) inside a `<picture>` is unwrapped the same way, including inside `<template>` content. Rewrites inside removed `<source>` tags are skipped. A `<picture>` whose image shows another file keeps its wrapper (its family `srcset` is still rewritten). The plan returns `artDirected` (HTML files). `MediaReplaceRequest.notice?` is called after commit with "The new picture is now used on all screens." The return value (the main path) is unchanged.
- **Shared rule.** `mediaPictureUnwrap` in the lazy `media-markup.ts`.
- **Out of scope.** Component slot pickers (`prepareMediaPath`; a slot image is a direct child of its instance), Site settings, CSS backgrounds.
- **Commits.** 5be95548 claim; 1db1346d build (Sol); f9756cce review 1 fixes; 50b1fcc9 review 2 fix; then this close.
- **Tests.**
  - `media-markup`: plain picture, type sources, art-directed (note raised), blank `media` ignored, attributes kept, slot carried or left, whitespace kept, non-picture parent.
  - `media-controller`: one change with the picture's node selected and the note only for art direction; Decorative records batch; held-files save.
  - `replace-everywhere`: format and art-directed sources outside the family, slots kept, another file's picture untouched, a picture in `<template>`, and adjacent pictures (only the replaced one unwrapped, or both).
  - `media-workspace`: notice after commit, one Undo, no notice on a failed commit.
  - Nightly `native-image-markup.spec.ts`: picker replacement inside a `<picture>` leaves no `<source>`/`<picture>`, keeps the class, and one Undo restores it. A narrow `<picture>` measures 100 px wrapped and wider with a stand-in.
  - Runs: `npm run check`, `npm run lint`, unit 2,812/2,812. Browser: `native-image-markup` 9/9 after the fixes; earlier `native-image-markup`, `native-media-picker`, `native-mcp-media`, `native-components` 34/35, the one failure a wrong node path in the new test, since fixed.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md`): `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-34/round-1/` and `round-2/`.
  - Round 1, fixed 2 (P2): pictures inside `<template>` content were missed; the measurement kept the picture wrapper, so a constrained wrapper gave wrong `sizes`.
  - Round 2 confirmed those fixes and found 1 P1 in the template fix: start-tag ranges bounded by the end of the file could swallow an adjacent picture. Fixed by exact tree ranges, with each template's content read as its own tree, plus adjacency tests.
  - Rejected 0. Not re-reviewed after round 2: it restores round 1's tree logic, and unit tests cover the case.
- **Bytes.** `test:budget` 345 KB gzip before first preview paint (budget 355 KB), the same as this branch before the runtime change. Boot +68 B gzip, all in the preview runtime's measuring branch; the rules are lazy.
- **Follow-ups.** Slice 54: pass `notice` to `workspace.replace` and announce it. Slice 70/72 (Improve images): hand-made `<picture>` sets are adopted there, not unwrapped.
