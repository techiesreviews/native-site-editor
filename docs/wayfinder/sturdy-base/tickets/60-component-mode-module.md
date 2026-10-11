---
title: "Edit component mode module, its memory adapter and suite (no callers)"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 6
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/edit-component-mode-design.md (sections 4, 5, 8).

- `src/page-builder/component-mode.ts`: `createComponentMode({ edits, shown, open, share, frame, changed })` → `now`, `entry`, `opened`, `enter`, `open`, `rename`, `keep`/`kept`, `dismissNotes`, `sync`, `leave`, `destroy`, as in design section 4: one opening object per enter, open and followed rename (the guarded edit's `edit-mode` key); `entry()` reads no stamp (it feeds `editModeEntry`); `now()` pure, adding the opening's repository/branch/version-view check, the page shown and (M3) the instance at its place, memoised per page source; latest entry wins; the entry, mode, level and rename history shares with today's lifetimes (a new entry over a mode keeps renames, their shares and kept names until leave); `sync()` suppressed while a transition is in flight; `enter`'s `hooks.mounted`, 8 s deadline from the call and the settle matrix; `drillChain`/`backChain` copied in from `edit-component-chain.ts` (deleted in 61).
- M3 lives in `now()` from the start but nothing calls `sync()` yet, so no behaviour changes in this slice.
- `tests/fakes/memory-workspace.ts`: optional `init.editModeEntry` (a function), so the fake's stamps hold the module's `entry()`; an open hook so a test can run `sync()` while a file opens.
- CONTEXT.md: an **Edit component mode** entry (the instance framed in place, its template edited for every page, slots changed with the chip, renamed from the bar, nested components opened in place, Done leaves; it ends when its template is no longer open or its page no longer shown).
- No caller uses the module; components.ts is not edited.

## Done when

- `tests/component-mode.test.ts` on the memory workspace covers design section 8's first list (enter, superseded, stale, failed, the settle matrix row by row, drill/back with shares and stale stamps, rename with Undo/Redo follow, leaving on another file, another page shown, the branch, version view and a moved instance, kept names, replacement keeping rename shares, dismissal, destroy, `now()` pure, no stamp recursion, `sync()` during an open), counting live shares after every step.
- `npm run check`, `npm test`, full `native-save` suite green; budget delta reported (the module is not imported yet: expect none).

## Done (2026-10-11)

- `src/page-builder/component-mode.ts` (`createComponentMode` → `now`, `entry`, `opened`, `enter`, `open`, `rename`, `keep`/`kept`, `dismissNotes`, `sync`, `leave`, `destroy`; `drillChain`/`backChain` copied in; M3 in `now()`), no callers. One port beyond the design: optional `read` (page tree as the preview counts it, default `readPage`), so the instance check runs in Node on `readSource`. `leave()` also cancels an entry or level still loading. Memory workspace: `init.editModeEntry`, `init.onOpen`. CONTEXT.md: **Edit component mode**.
- Commits: "Add the Edit component mode module, its memory adapter and suite (no callers)" and two "Component mode:" fix commits (Sol's review: seven findings, all fixed with a case each).
- Tests: `tests/component-mode.test.ts` (47 cases, incl. the two chain cases moved from `edit-component-chain.test.ts`, still there until 61). `npm test` green; full `native-save` 887 passed, 56 skipped (group-tagged). Budget delta: none (not imported).
