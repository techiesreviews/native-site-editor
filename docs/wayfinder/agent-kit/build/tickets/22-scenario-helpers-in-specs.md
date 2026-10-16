---
title: "Specs reuse the shared scenario helpers"
type: task (AFK)
status: open
assignee:
blocked_by: [06-kit-shots-core]
builder: sol
---

## What

- Replace hand-rolled copies of "open the editor and wait", "open Media", "pick a picture", "switch site mid-upload" in the media specs with `tests/support/scenarios.ts` helpers, adding helpers there as needed (kit shots uses the same file).
- No test meaning changes; same assertions.

## Files

- `tests/support/scenarios.ts`
- media browser specs under tests/native-save/ that hand-roll opening Media, picking a picture or switching sites (list them before editing)

## Done when

- The touched specs pass (twice), and `kit shots media-gallery` still works.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
