# Phase 5.22: Save/publish controller (slice 15)

Base: `a47abed` (dev).

`src/controllers/save-publish-controller.ts` (`createSavePublishController(ports)`) owns save and publish orchestration:

- Head trust: `seeHead`, `trustedHead`, `headFor(scope)` (was the inline `publishHead` expression in `mountSource`), and `checkHead(force)` (was `checkBranchHead`) with its 15-second throttle. The visibilitychange/focus listeners are registered through the `onWake` port.
- Deleted-upstream reconciliation: `findDeletedUpstream` (internal), `checkDeleted(epoch)` (was `checkDeletedUpstream`, once per snapshot load), `isDeleted(path)`, `resetDeleted()` (for `loadSnapshot`), and `settleDeleted(path, keep)` (was `settleDeletedDraft`). The deleted-upstream set moved into the controller.
- After a save: `published(proof, scope, result, submitted)` (was the `onPublished` body) and the internal refresh (was `refreshPublishedSnapshot`).
- Discard: `discard(paths?)` (was `discardDrafts`), `discardFile(path)` (was `discardOneFile`) and `discardAll()` (was `discardAllChanges`), which share one confirm-then-guard helper.

`mountSource` takes `savePublish.proof()` where `saveEpoch` was taken and wires `onPublished`, `publishHead`, `onRefused`, `onDiscardAll`, `deletedUpstream` and `onSettleDeleted` straight to the controller. In `loadSnapshot`, four call sites change by prefix only.

## What stayed in the host and why

- `afterFileChanges` stays in main as the `changed` port. Nine host transactions call it (file operations, media and the undo/redo of file changes). Every step in it is a host view, so moving the sequence would only add ports. The lead's brief listed it as a move, so this needs the lead's decision.
- `mountSource`/`openCodeEditor` wiring, `loadSnapshot`, `draftScope`, `api`, `findEntry`, `releaseFiles`, `openAfter`, `resyncNativeSite`, `nativeFallbackPage`, `discardFileChange` and the file transactions stay in the host. Rendering also stays there and reaches the controller through closures: `redraw`, `saved` (adopt native base sources, sweep uploads, track the site action), `adopt` (snapshot and repository index), `showSaved` (agent, revision, tree, text index) and `reopen` (preview sources, `openAfter`, or reopening the linked stylesheet).
- `settleDeletedUpstream`, `pruneUnchanged`, `keepAsNewFile` and `listChanges` are imported directly from `src/file-changes.ts`, which was already in main's graph. The controller has no editor, Monaco or lazy imports.

## Guards

- A proof is `{ epoch, scope: draftScope(), snapshot }`. `live(proof)` checks the generation, account, repository ID, branch and snapshot identity. A save result passes when only the snapshot moved: a refreshed snapshot of the same branch, which matches the old `onPublished` guard. Every check uses the proof taken before the await. After a refresh adopts its own snapshot, the check uses `{ ...proof, snapshot: result }`.
- Snapshot identity is not required after a discard question or after the deleted-upstream check's second await (`live(was, false)`). A save's refresh that adopts a snapshot of the same branch meanwhile no longer turns a confirmed discard into a no-op, and no longer skips forgetting and redrawing pruned drafts (review fixes).
- `published` keeps base order: `seeHead`, then the refresh request, then the host's `saved` steps (adopt native base sources, sweep uploads, track the site action).
- Operation tokens: a newer head check, refresh or discard question supersedes an older one. Stricter than before:
  - An older save's snapshot answer can no longer overwrite a newer one.
  - The row-menu discard checks the scope again after its question; before, it did not.
  - Discard all checks the full scope after its question; before, it checked only the branch.
- The recovery order is unchanged: the rename's other half is chosen, then the open file and style pane are released, then each draft is dropped (the editor drops it when it can, else the store does) and the deleted-upstream mark is cleared. After that the editor history is cleared, then `afterFileChanges`, then the native resync (which returns early), then the preview sources, then the reopen.
- `findDeletedUpstream` has no operation token, so the boot check and a refresh's check both finish, as before. A file waiting on `checkDeleted` still sees the result.

## Verification

Node `24`:

- `npm run check`: passed.
- `npm test`: 1,119 passed after the rebase onto `311168a` (10 in `tests/save-publish-controller.test.ts`), 0 failures.
- `npm run build:ui`: passed.
- `npm run test:budget`: 348 KB gzip (356,286 B) against 347 KB (355,423 B) at `a47abed`. The cost is +863 B, mostly the port object and the controller's API keys. This is still within the 350 KB budget but breaks the "must not grow" target. Short port names already saved about 100 B. Not resolved.
- Browser (port 5226, one worker, flock): 13 save/publish specs, 62 passed. `@smoke`: 32 passed. After the review fixes: native-discard, native-deleted-upstream, native-save and native-change-status, 23 passed; `@smoke`, 32 passed.
- Budget after the review fixes, on `311168a`: 356,516 B (348 KB).

`src/main.ts`: 8,215 lines before, 8,048 after (-167).
