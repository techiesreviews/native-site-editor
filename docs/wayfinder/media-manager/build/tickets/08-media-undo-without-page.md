---
title: Media changes work without an open page
type: task (AFK)
status: closed
assignee: claude (mm-08 runner)
blocked_by: [02-remove-legacy-workspace-members]
builder: sol
phase: 0
---

## What

Research 04: library batches need an open editable page; the Images tab refuses changes otherwise ("Open an editable page before changing images.", `src/main.ts:2529`, in `applyMediaBatch` at `:2522`). The new Media screen manages collections, descriptions and files with or without a page open, and tickets 10 and 15 say "before saving, Undo works as for other changes".

- Give media batches a history home when no editable page is open ★ (for example the editor's site-level history used by file moves), so a media change is still one Undo step.
- With a page open, behaviour is unchanged (the change joins that page's history).

## Done when

- `tests/media-draft-transaction.test.ts` or `tests/media-workspace.test.ts`: a metadata change with no page open applies and undoes.
- `native-media-transaction.spec.ts` gains a nightly case: open a stylesheet, change an image's tags, Undo.
- Full suite green.

## Done (2026-10-14)

- **Behaviour.** With no editable file open (e.g. the previously open file is gone and the editor shows "Select a page"), a media change no longer refuses: it applies at once (drafts and `.editor/media.json` written, preview refreshed) and its Undo step is held in `src/page-builder/media-history-home.ts` under the setup identity (generation, account, repository, branch). The next primary editable file that opens (`openCodeEditor`) takes held steps oldest first; a step its file refuses stays held with every later one; steps from another identity are dropped. A file that opens while the change is still being prepared takes the step at once. With a page or stylesheet open nothing changed (the step joins that file's history; the stylesheet case already worked and is now pinned). Decision (★): nothing forces a page open, mirroring file moves, whose step goes to the page opened after. Limit: with no editable file open, a batch that rewrites page text (today only Optimise's replace; later descriptions and rename/replace everywhere) still refuses with "Open a page before changing images that pages use.", because a page opened later is not proven over the step's text and its Undo would refuse.
- **Commits.** 1481e021 claim; db89412f build (Sol; runner fixes: adopt keeps order after a refused step, dead `clear` removed, no lookup by empty path); dc357655 review fixes (late-opened file takes the step; page-text guard; records path read from the lazy media chunk so boot bytes do not grow).
- **Tests.** New `tests/media-history-home.test.ts` (order, once only, identity drop, refused step keeps order); `tests/media-draft-transaction.test.ts` "a metadata change with no page open applies and undoes" (and redoes); `native-media-transaction.spec.ts` gains "open a stylesheet, change an image's tags, Undo" and "media metadata with no file open joins the next page's Undo and Redo". `npm run check`, lint, unit 2355/2355; `native-media-transaction`, `native-images-tab`, `native-media-library`, `native-asset-references` 34/34; after rebasing onto slices 03 and 13 (conflict in `applyMediaBatch`: kept slice 13's open-page check and Edit bar refresh): unit 2384/2384 and the seven media specs 53/53; Sol's build run: full suite 896 passed, 0 failed, 60 skipped, and the two touched specs with CI fonts.
- **Review (GPT-6.1 Sol).** Round 1: 2 P2 findings, both acted on: file opened during preparation (fixed); a later-opened page edited by the held step makes its Undo refuse (resolved by scope: page-text batches keep needing an open page). Round 2: no defects. Validation gaps left open: a browser test of the page-text refusal (needs Optimise's real worker) and of a page opening mid-preparation (needs a pause hook in main.ts's lazy batch).
- **Bytes.** First paint 344 KB of 355 KB before rebasing, no measurable change; 346 KB after rebasing onto slices 03 and 13 (a first attempt importing the records constant statically cost +2 KB and was moved to the lazy chunk).
- **Follow-ups.** Slices 13 (description updates every use) and 52/53 (rename/replace everywhere): to work with no page open they need the media transaction to adopt a page mounted after the step over the step's own text (as `prepareNativeTextHistory`'s `adoptOwnMount` does for file moves), then drop the guard in `applyMediaBatch`.
