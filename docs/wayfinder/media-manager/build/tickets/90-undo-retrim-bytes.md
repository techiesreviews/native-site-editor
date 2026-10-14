---
title: Undo of removing an unsaved file brings its picture back too
type: task (AFK)
status: closed
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

## Done (2026-10-15)

- **Behaviour.** While an Undo step that can bring an unsaved upload back is in the history, that upload's bytes stay in this browser; they are released when the step leaves the history (Redo cleared, history reset, page closed for good, repository change) or at once when the step is refused, rolled back or never recorded. So after a re-trim, Undo puts the earlier trimmed copy back with its picture, and trimming the spot again (or Save) works. One shared seam: `holdUploadDrafts` in `src/uploads.ts` (the same hold `sweepUploads` already respects), taken before the step writes drafts, over the step's **before** side only. Used by the media draft transaction (re-trim's previous copy, Remove file, Clean up, Replace everywhere's overwrite; Redo still re-stages its own new bytes) and the guarded structural commit (Files tab and agent Delete; its after-side uploads are the same bytes moved). Media steps parked with no page open (`media-history-home`) pass their `dispose` on, release steps of another repository, and are cleared on repository/branch reloads and sign-out. Bytes already gone before a step stay gone, as before.
- **Commits.** 88c78c04 claim; 496898d5 build (Sol; runner: a deletion's replaced bytes are held too, as `sweepUploads` keeps them); fb410f8d hold only the before side (full-suite finding below); 03952a08 review round-2 test; then this close.
- **Tests.** `uploads.test.ts` (holds shared, idempotent release, a deletion's replaced bytes kept); `media-draft-transaction.test.ts` (delete and overwrite of an unsaved upload: sweep, Undo, bytes there, released on dispose; hold before draft writes; store and registration refusals release; a step's new upload is not held, so Discard frees it; a failed Redo keeps the hold); `guarded-edit.test.ts` (structural delete: accepted, refused, absent, store failure, opening failure); `media-history-home.test.ts` (dispose travels with adopted steps; other identities and `clear` release). Nightly `native-image-popup.spec.ts` "Undo of a re-trim keeps the unsaved picture available to trim again": failed before the fix (the third trim never saved), passes after. `npm run check`, `npm run lint`, unit 2973/2973 (+2 after). Full suite (`full-suite.sh 3`) on 496898d5: 1017 passed, 1 failed, `native-upload.spec.ts:160` (Discard of a just-added file left its bytes: the step held its after side); fixed in fb410f8d; rerun of native-upload, -image-popup, -media-transaction, -file-ops, -media-cleanup, -media-library: 44/44.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor-build-mm-90-undo-retrim-bytes/.scratch/review/` and `.scratch/review-2/` (copied to `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-90/round-{1,2}/`; `run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` REVIEW_STATUS complete). Round 1: no defects; validation gap (guarded overwrite of an unsaved upload) rejected: a guarded plan cannot overwrite one (opaque drafts read as absent, and a path cannot be both deleted and created in one plan); overwrites exist only in Media batches, which are covered. Round 2 (after fb410f8d): no defects, before-only confirmed safe; validation gap (failed Redo keeps the hold) added in 03952a08.
- **Bytes.** `test:budget` 348 KB gzip before first preview paint of 355 KB; boot entry about +0.1 KB gzip (the hold helper and the history `dispose` wiring).
- **Known limit.** Held bytes stay in this browser's storage until their step leaves the history (or the page reloads), even if the restored draft was meanwhile discarded by hand.
