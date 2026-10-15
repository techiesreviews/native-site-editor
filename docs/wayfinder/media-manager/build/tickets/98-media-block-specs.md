---
title: Specs follow the Media block
type: task (AFK)
status: closed
assignee: claude (mm-98 runner)
blocked_by: [63-place-every-kind]
builder: claude
phase: 5
---

## What

Slice 63 renamed the six blocks' **Image** to **Media**: it opens the Media picker ("Choose media") for the spot instead of writing a stand-in picture. `tests/native-save/native-plain-section-drops-actual.spec.ts` ("an image in a selected Div drags itself…", `@actual`) still clicks the rail's "Image" and fails on dev.

- That spec places its picture through Media: choose a picture in the picker, Use, and the rest of the case (drop inside the Div, the Div's box follows, the image drags itself, one Undo) tests the same thing against it.
- Every other spec that clicks or names the rail's Image block follows Media. The edit bar's kind "Image" for a selected `<img>` and the drag ghost's "Image" stay.
- No product change.

## Done when

- The touched specs pass in their fixture groups (`@actual` for the drops spec).

## Done (2026-10-15)

- **Behaviour.** Tests only; no product change. The `@actual` case "an image in a selected Div drags itself…" now follows Lex's steps with **Media**: the rail's Media opens **Choose media**, the starter's `images/studio-desk.svg` is chosen and **Use image** places it in the Div; the rest (drop before the image in the Div, the Div's box follows it as it grows, the image drags itself out to Get in touch with slice 88's re-check, one Undo) is unchanged and expects `studio-desk.svg` instead of the old stand-in `placeholder.svg`. The drag ghost's "Image" for an `<img>` and the edit bar's kind stay. The Add-catalogue checks that refuse the six blocks as options (`native-block-rail`, `native-add-panel-ux`, `native-section-add-host`) now name Media too. No other spec clicks the rail's Image (the "Image" buttons in `native-social-image` are page Settings').
- **Commits.** 06ec0724 claim; 86253386 specs; f7cfeb3e review fix; close.
- **Tests.** `test:browser:actual` (the whole `@actual` group): 58/58, including the fixed case. Default group: `native-block-rail` 4/4, `native-add-panel-ux` + `native-section-add-host` 6/6. `npm run check`, `npm run lint`, unit 3,243/3,243.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: worktree `.scratch/review/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Fixed 1 (P3): `native-add-panel-ux` and `native-section-add-host` exclusion checks also refuse Media. Nothing rejected.
- **Bytes.** Specs only: boot unchanged; `test:budget` 350 KB gzip (budget 355 KB).
