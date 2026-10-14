---
title: Shape and focus point per place
type: task (AFK)
status: closed
assignee: claude (mm-38 runner)
blocked_by: [33-placed-image-markup]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Shapes and what gets saved"; research 03 §5–6.

- Writing a place's shape: inline `aspect-ratio` and `object-fit: cover` for Square, 4:3, 16:9, Tall 4:5; Original removes them. Focus point: inline `object-position` in percent.
- Edits change single declarations inside an existing `style` attribute and keep the rest (research 03's change list).
- `sizes` is re-measured after a shape change (slice 32, cover-adjusted).
- Reading back a place's shape, focus and whether it uses a Trimmed copy, for the popup's state badge.
- Nothing new is saved for a shape or focus change.

## Done when

- `tests/place-frame.test.ts`: each shape, focus, Original clears, other style declarations kept, reading back, slot images.

## Done (2026-10-14)

- **Behaviour.** The engine behind a place's shape and focus point; no popup yet (slice 39 and agents' slice 45 call it). Lazy module `src/page-builder/place-frame.ts`:
  - `writePlaceFrame(tag, { shape?, focus? })`: Square, 4:3, 16:9 and Tall 4:5 write inline `aspect-ratio: a / b` and `object-fit: cover`; Original removes both and `object-position`. Focus is `object-position: X% Y%` in whole percentages clamped to 0..100, removed at the centre. Free is refused (it is a trimmed copy, slices 40/41). Only those three declarations change inside an existing `style`: others keep their text and order (quotes, `url(…;…)`, comments, `{ }` custom-property blocks); duplicates collapse to one at the first; `!important` is replaced; an emptied `style` is removed.
  - `readPlaceFrame(tag, records?, pagePath?)` for the badge: `shape` (one of the five, ratio matched by value; `{ kind: "other", value }` for an unknown ratio or one without `cover`), `focus` (percentages and keywords; non-percent lengths give `focus: undefined` with `focusRaw`), `trimmed` and its `source` from the file's `trimmedFrom` record.
  - `resetPlaceFocus(tag)` for slice 39's Replace (keeps the shape); today's picker is unchanged.
  - `framePlace(ports, { path, node }, change, proof)`: stale page, changed tag, viewing an old version and `components/` templates refuse. A shape change re-measures through a new `style` stand-in on the `measure-image` request (the hidden copy only; the visible preview never changes), then rewrites `sizes` (with `auto, ` when lazy) and loading/priority as slice 33 does; a hand-written image (no `sizes`) changes only if it becomes the priority image. A failed measurement keeps the existing `sizes`. A focus-only change does not measure. One `ports.change` page edit, one Undo step ("Image shape changed" / "Focus point moved"); no uploads, no records write. Slot images on a page work the same.
- **Commits.** 94669475 claim; 78e9b691 build (Sol; runner fix: hand-written images kept their loading); 8aa0ff79 review fix; then this close.
- **Tests.** New `tests/place-frame.test.ts` (24): each shape, focus rounding/clamping/centre, Original clears, other declarations kept (url, quotes, comments, `!important`, duplicates, single-quoted, no style, emptied style, `{ }` blocks), reading back incl. `other`, keywords and trimmed via records, slot images, template refused, orchestration (style stand-in measured, lazy/eager sizes, hand-written image, measurement failure, focus-only, one change, stale refusals). `preview-protocol` and `preview-link` tests extended; nightly `native-image-markup.spec.ts` case: a 16:9 cover stand-in measures its new shape without changing the visible image, an oversized style refuses. `npm run check`, `npm run lint`, unit 2,731/2,731; browser native-image-markup, native-media-picker, native-components 33/33.
- **Review (GPT-6.1 Sol).** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-38/round-1/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md`). Fixed 1 (P2: declarations inside custom-property `{ }` blocks were read and edited as the image's own). Rejected 0. Not re-reviewed: small, unit-tested fix.
- **Bytes.** `test:budget` 344 KB gzip before first preview paint (budget 355 KB), as on dev; boot +60 B (the style stand-in in protocol, runtime and the `main.ts` adapter). Rules are lazy.
- **Follow-ups.** Slice 39: call `framePlace` on Done and `resetPlaceFocus` on Replace; badge from `readPlaceFrame`. Slice 45: agents write through `framePlace`.
