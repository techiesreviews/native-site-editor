---
title: Controller API tidy-ups from the reviews
status: closed
assignee: td-0807
blocked_by: []
---

# Controller API tidy-ups from the reviews

## What

Optional findings from the Phase 5 reviews (check first: slice 17, dead code,
may already have removed some):

- `page-structure-controller.ts` exposes each function under two names (`renderEditBar`/`renderNativeEditBar`, `moveSection`/`moveNativeSection`, `editSharedRoot`/`nativeStructureEdit`, `linkedAncestor`/`nativeLinkedAncestor`, `repaint`/`repaintNativeStructure`); exports `removeEmptyNewLink`, `nativeTextSourceEdit`, `prepareNativeTextEdit` used nowhere outside; passes some pure parsers as ports while importing others; types `editorModule` as required but uses `?.`.
- `cards-controller.ts`: `mounted()` is used only by tests.
- `file-operations-controller.ts`: returns internals only for tests (`nativeAssetSnapshot`, `nativeAssetReferences`, `planFileMoveUrls`, `nativeMovePins`, `moveFilesWithUrls`).
- `save-publish-controller.ts`: discard messages use counts gathered before the dialog, so after a same-branch refresh they can overstate what was discarded; a superseded refresh's error still shows (as before).
- `main.ts`: thin forwarding wrappers left by slices 11–15; `nativePageWithDetail` imported but unused (as of `6482e65`).

## Done (2026-10-17)

Built by Sol (gpt-6.1-sol, high), checked and finished by Claude (td-0807).

- **Already fixed on dev, skipped:** slice 17 had removed the `moveSection`,
  `editSharedRoot`, `linkedAncestor` and `repaint` duplicates; `nativeMovePins`
  was gone; main.ts no longer imported `nativePageWithDetail`.
- **page-structure-controller:** `renderEditBar` is the one edit-bar name;
  `removeEmptyNewLink`, `nativeTextSourceEdit`, `prepareNativeTextEdit` are no
  longer returned; `editorModule?.` became `editorModule.` (it is always
  `sourceEditor`). The pure `startTagAttribute` and `textRangeInSource` are
  imported from `shared/html-source`; `locateNativeElementRange`,
  `elementPathAt` and `wrapperAround` stay ports (browser DOM parser, faked in
  tests), as the ports comment now says.
- **cards-controller:** `mounted()` removed; the tests check behaviour instead
  (unmounted `createWithCard` gives undefined, mounted it refuses).
- **file-operations-controller:** `nativeAssetSnapshot`, `nativeAssetReferences`,
  `planFileMoveUrls`, `moveFilesWithUrls` are no longer returned.
- **main.ts:** 32 thin forwarding wrappers removed; call sites call the
  controller at call time (arrows where evaluated before the controller's
  `const`). Kept: the lazy setup adapters that await an import
  (`createSiteInWizard`, `findWizardRepository`, `wizardPreview`, `createSite`)
  and `listRepositoryFiles` (adds `api`).
- **save-publish-controller (behaviour fix):** Discard all and Discard file
  announce the changes actually discarded after the dialog; a same-branch save
  refresh that pruned drafts meanwhile no longer gets an overstated count, and
  nothing left means no "Discarded" line. The question text and the
  superseded-refresh error are unchanged.
- **docs/agents/code-map.md:** removed the `renderNativeEditBar` row (the
  code-map test requires declared names).
- **Commits:** 51b52689 (tidy + fix), cards test follow-up.
- **Tests:** new save-publish tests (1 left / 0 left after a refresh, discard
  file pruned, rename counted once). `npm run check`, `npm run lint`,
  `scripts/agents/unit.sh` 3956 pass; Sol's `kit specs --affected` 504 cases pass.
- **Size:** boot 352 KB (±0) vs origin/dev, total -1 KB; entry JS -321 B raw / -218 B gzip.
- **Review (Sol, kit review):** no defects. Acted on both notes: added the
  `kit size` delta above; the cards mounting test now fails if mount breaks.
  Evidence: `.scratch/reviews/td-0807/20261017T061045Z` (main root).
