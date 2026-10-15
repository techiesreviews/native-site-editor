---
title: Specs follow the Media block
type: task (AFK)
status: open
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
