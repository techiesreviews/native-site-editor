---
title: Undo of removing an unsaved file brings its picture back too
type: task (AFK)
status: open
assignee: claude (mm-90 runner)
blocked_by: [41-popup-trim-zoom-turn]
builder: sol
phase: 3
---

## What

Bug found while testing slice 41 (its Done section): after re-trimming a spot, the earlier trimmed copy is removed (Recently removed). When that copy was never saved to GitHub (an unsaved upload, draft only), pressing Undo brings its draft back but not its bytes: the clean-up after every file change (`sweepUploads`) has already deleted the bytes no current draft points at. Trimming that spot again then fails with "missing from this browser's storage", and Save would fail the same way.

The cause is shared, not trim-specific: any Undo step that removes or overwrites an unsaved upload (Media's Remove file, Clean up, a re-trim's previous copy, Replace everywhere's old picture, and the Files tab's or an agent's Delete) can bring back a draft whose bytes were swept. Fix it once, in the shared path: while an Undo step that can bring an upload back is still in the history, that upload's bytes stay in this browser (released when the step leaves the history, or at once when it is never recorded). Bytes already missing before the step stay missing (as today).

## Done when

- Unit (`tests/media-draft-transaction.test.ts`, and the guarded-edit structural commit's tests): removing and overwriting an unsaved upload, then a sweep, then Undo: the restored draft's bytes are still in storage; released when the step is dropped from the history (a sweep then removes them); a refused or unrecorded step holds nothing.
- Nightly in `native-image-popup.spec.ts`: trim, re-trim, Undo, trim again: works (a new trimmed copy saved, no "missing from this browser's storage").
- `npm run check`, unit, lint, and the full suite (shared plumbing) pass apart from known failures.
