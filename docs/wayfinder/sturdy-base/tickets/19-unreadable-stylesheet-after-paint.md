---
title: "A stylesheet GitHub can't read as text doesn't break the preview after it paints"
type: task (AFK)
status: open
assignee:
blocked_by: [17-guarded-edit-fold-apply-paths]
builder: claude ★
phase: 1
---

## What

Found in slice 17 while fixing the `native-boot-requests` flake: when a page links a stylesheet that GitHub can't return as UTF-8 text, the text index (built after the first paint) reads it, fails, and the preview shows an error although the page painted fine. The spec's fault injection hit this on dev 3 of 6 runs; a real repo with such a file would hit it every time.

- Lead decision (2026-10-11): a bug. The text index skips a file it can't read (as the Files controller already does for one unreadable file in a batch) and the preview stays up; anything that needs that file's text says so where it's used (e.g. the code pane shows it can't open the file), not as a preview error.

## Done when

- A browser spec: a page linking an unreadable stylesheet paints, the text index finishes, no preview error shows, and editing text on the page still works.
- A unit test on the text index with one unreadable file among readable ones.
- `npm run check`, `npm test`, full `native-save` suite, smoke and `@actual` green.
