---
title: Controller API tidy-ups from the reviews
status: ready-for-agent
assignee:
blocked_by: []
---

# Controller API tidy-ups from the reviews

## What

Optional findings from the Phase 5 reviews (check first: slice 17, dead code,
may already have removed some):

- `page-structure-controller.ts` exposes each function under two names (`renderEditBar`/`renderNativeEditBar`, `moveSection`/`moveNativeSection`, `editSharedRoot`/`nativeStructureEdit`, `linkedAncestor`/`nativeLinkedAncestor`, `repaint`/`repaintNativeStructure`); exports `removeEmptyNewLink`, `nativeTextSourceEdit`, `prepareNativeTextEdit` used nowhere outside; passes some pure parsers as ports while importing others; types `editorModule` as required but uses `?.`.
- `cards-controller.ts`: `mounted()` is used only by tests; `withoutCardMoves` casts `control.icon as string`.
- `file-operations-controller.ts`: returns internals only for tests (`nativeAssetSnapshot`, `nativeAssetReferences`, `planFileMoveUrls`, `nativeMovePins`, `moveFilesWithUrls`).
- `save-publish-controller.ts`: discard messages use counts gathered before the dialog, so after a same-branch refresh they can overstate what was discarded; a superseded refresh's error still shows (as before).
- `main.ts`: thin forwarding wrappers left by slices 11–15; `nativePageWithDetail` imported but unused (as of `6482e65`).
