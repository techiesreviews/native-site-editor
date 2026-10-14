---
title: Alt text specs after Descriptions and Decorative
type: task (AFK)
status: closed
assignee: claude (mm-83 runner)
blocked_by: [13-descriptions-and-decorative]
builder: claude
phase: 1
---

## What

Follow-up to slice [13](13-descriptions-and-decorative.md). Since slice 13 landed (fab89ba4), two browser tests fail on plain `origin/dev`:

- `tests/native-save/native-structure.spec.ts` (about line 134): after emptying an image's Alt text it expects the status "Image marked decorative" but sees "Alt text removed".
- `tests/native-save/native-block-bars.spec.ts` (about line 76): after Escape closes the image chooser, it times out finding the Edit bar's "Alt text" button.

Map ticket [13's resolution](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) decided that old empty descriptions count as **not described yet** until the picture or place is marked **Decorative**, and that the editor remembers that mark because `alt=""` alone cannot tell the two apart. So emptying the Alt text no longer means Decorative; Decorative is its own Edit bar toggle.

For each failure, decide whether the test is stale (slice 13's new wording or flow is the decided behaviour: update the spec) or slice 13 broke something (fix the code).

## Done when

- Each failure is classified as a stale test or a regression, with the reason.
- Both specs pass, three runs in a row, on the default fixture group.
- `npm run check`, the unit suite and `npm run lint` are green.

## Done (2026-10-14)

- **Finding: both were stale tests, no regression.** Slice 13's build (b8c1d339) changed the Edit bar on purpose, following map ticket 13's resolution: an emptied alt reports "Alt text removed" (no longer "Image marked decorative"), an empty alt without a Decorative mark warns **Not described yet**, and Decorative is its own toggle. Reproduced on unchanged `origin/dev` (07b5328d): the structure spec saw "Alt text removed"; in the block-bars spec the bar was still showing after Escape with the image selected, but the fixture's `alt=""` button is named "Not described yet", so the "Alt text" lookup timed out.
- **Change (tests only).** `native-structure.spec.ts`: emptying the alt expects "Alt text removed", the "Not described yet" warning and an unpressed Decorative toggle; the empty alt is still kept through a replacement; still seven Undo steps. `native-block-bars.spec.ts`: opens the field through "Not described yet" and checks it reads "Alt text" once described. Marking Decorative stays covered by `native-image-alt-refusal.spec.ts`.
- **Commits.** d5b66846 claim; 3785129a specs.
- **Tests.** Before: 2 failed, 9 passed. After: `native-structure`, `native-block-bars` and `native-image-alt-refusal` with `--repeat-each=3`, 39/39 passed. `npm run check`, `npm run lint`, unit suite (2437 pass, 0 fail) green.
- **Review (GPT-6.1 Sol).** Complete, no defects, no validation gaps: fixed 0, rejected 0.
- **Bytes.** No source change; first-paint budget 347 KB of 355 KB (delta 0).
- **Follow-up for the lead (not a regression).** After a replacement, a place's Decorative mark stays with the old file (`files[old].places[page]`), so a Decorative image that is swapped keeps `alt=""` but reads Not described yet until marked again. Slice 13's Done does not decide this; slice 18 (shared picker) or 52 may want to carry the mark over.
