---
title: The Media tab badge and the Always keep mark
type: task (AFK)
status: closed
assignee: claude (mm-49 runner)
blocked_by: [47-clean-up-suggestions]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "How Lex finds out" and "Always keep".

- A small count badge on the **Media** tab, visible from anywhere, like an unread count. Clean up in More shows the same count.
- It goes away when nothing is left or Lex dismisses it; after dismissing it returns only when new unused files appear.
- A small Always keep mark on the file's tile and in details.
- Phase 6 adds Improve images to the count.

## Done when

- Nightly in `native-media-cleanup.spec.ts`: the badge counts an unused file; dismiss hides it; a new unused file brings it back; an Always keep file is not counted and shows its mark.

## Done (2026-10-14)

- **Behaviour.** Once the wide use check (slice 46) publishes, a lazy controller `src/controllers/media-clean-up-controller.ts` reads `.editor/media.json` (held draft first, else the branch file; unreadable or malformed blocks) and runs slice 47's `mediaCleanUpSuggestions`. Pure rules in `src/page-builder/media-badge.ts`: the count is Clean up's count (unused files, trimmed copies, leftover copies) and shows only when the check is ready and something is suggested. **Dismiss** stores the files suggested then, per repository and branch, in localStorage (memory if the browser refuses); the count returns only when a file not suggested then is; with nothing left the memory is cleared, so a file coming back later counts as new. While the same site is checked again the badge keeps its last count (no flicker) but nothing unchecked is offered; another repository or branch starts empty; a draft change invalidates a records read in flight. **Where it shows** (`src/page-builder/media-clean-up-view.ts`, `media-clean-up.css`): a small count chip on the **Media** tab and on the page picker button that opens the explorer, so it is visible from anywhere while the dropdown is closed. The chip is `aria-hidden`; the controls get `aria-describedby` "N files to clean up", so the tab's name stays "Media". **More** (slices 10, 12) has **Clean up (N)** right after Add new file, the same count, disabled with a reason while checking, while a file cannot be read, or with nothing to suggest. It opens a Clean up panel above the grid (pane only, not the picker) listing the suggested files by group, with **Dismiss** while the badge shows and **Close** (focus back to More). **Always keep mark**: `MediaLibrary.keep`, from the workspace load folded over every path (`alwaysKeptFiles` in `media-families.ts`, so a kept copy or HEIC original marks its family's main), puts a pin in the tile's bottom-right corner (role img "Always keep"; the name leaves room; in slice 12's list, on the thumbnail's corner) and "Always keep: Clean up never suggests this file." under the file line in details. The mark is read-only until slice 14 adds the toggle.
- **Commits.** d037820a claim; slice commit (built before slices 10 and 12 landed, rebased and squashed onto them: Clean up moved from a strip above the grid into More); review fix; close.
- **Tests.** New `tests/media-badge.test.ts` (count, hidden states, dismiss/return, stored values, label, More item and its reasons) and `tests/media-clean-up-controller.test.ts` (Always keep excluded, held draft wins, no records file, unreadable/malformed/failed read block, dismiss remembered across visits, cleared when nothing is left, recheck keeps the badge but offers nothing, place change, overtaken updates, refused storage, invalidated read). `media-families` gains `alwaysKeptFiles`; `media-workspace` gains a kept HEIC original marking its main. New nightly `tests/native-save/native-media-cleanup.spec.ts`: the count on the page picker and Media tab with descriptions; More's Clean up (2) opens the panel listing the unused files, not the Always keep one, which is marked on its tile and in details; Dismiss hides the count everywhere and survives a reload while More keeps the count; a new unused file brings it back (3); placing files lowers the count and an empty Clean up is disabled with its reason. `native-media-tab.spec.ts` tab texts allow the count after Media. `npm run check`, `npm run lint`, unit 2472/2472. Full suite before the rebase: 906 passed, 2 failed (`native-media-tab:11`, this slice, fixed; `native-manager-action-fades:197` hidden Restore, the flake slice 09 recorded, passed on rerun). After rebasing onto slices 10 and 12: media, upload and fades specs 72/72 (unit 2477/2477; one agent-scripts process-timing test failed once and passed on rerun); media tab and clean-up specs 30/30 under CI fonts and after the last fix.
- **Review (GPT-6.1 Sol).** First review: 2 fixed (a kept original the library does not list left its main unmarked; a stale records read after a draft change could publish and forget a dismissal). Second review, after the rebase: 1 fixed (a recheck kept the old suggestions live, so Clean up stayed enabled; now only the badge keeps its count). Its suggested browser case holding a read open while the panel shows was not added: the fake server has no hook to hold one text read, and the controller test covers the rule. 0 rejected.
- **Bytes.** First-paint budget 349 KB of 355 KB (origin/dev 3dac05f3 measured 348 KB in the same sitting); entry JS +587 B gzip (the More item and panel wiring and ports in `media-controller.ts`/`main.ts`), entry CSS unchanged. The clean-up controller, rules, view and CSS load with the usage-check chunk.
- **Screens.** 390 and 1280 px on the real starter (top bar, More, Clean up panel, details, after Dismiss): `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-49/`.
- **Follow-ups.** Slice 50: Clean up opens the review instead of the list panel (`drawCleanUpPanel`), and needs `sizes` passed to `mediaCleanUpSuggestions`. Phase 6 adds Improve images to the count.
