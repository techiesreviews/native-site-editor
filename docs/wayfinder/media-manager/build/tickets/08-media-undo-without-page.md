---
title: Media changes work without an open page
type: task (AFK)
status: open
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
