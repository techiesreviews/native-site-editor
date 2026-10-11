---
title: "A page GitHub can't read as text shows an error when opened, not a blank preview"
type: task (AFK)
status: closed
assignee:
blocked_by: [19-unreadable-stylesheet-after-paint]
builder: claude ★
phase: 1
---

## What

Found in slice 19: `readSiteTexts` skips files GitHub refuses as not UTF-8. A page that isn't UTF-8, skipped by the text index and later opened through a link in the preview (or the page picker), renders blank instead of saying why.

- Lead decision (2026-10-11): opening such a page shows the same preview error slice 19 uses for an unreadable page the shown page needs, naming the file ("…: This file is not UTF-8 text."), and the code pane says so as it does for stylesheets.

## Done when

- A browser spec: a non-UTF-8 page linked from the home page; clicking the link (and choosing it in the page picker) shows the named error, not a blank preview; going back to the home page works.
- `npm run check`, `npm test`, the touched specs, smoke and `@actual` green.

## Done (2026-10-11)

- Root cause: the preview drew a page it had no source for as an empty page: a page skipped by the text index (or by the shown read after a link, whose catch also dropped the page it had just read when one of its templates was unreadable) reached the preview as "". Now the host passes the unreadable files with no draft in their place, with why (`setUnreadable`, `update({ unreadable })`), and the preview hides the frame behind "path: why" while the page on show or a template it uses is among them (`unreadableNeededFile` in src/native-boot.ts, shared with the boot, which still fails with the path for a needed file). The shown read no longer throws for one; choosing the open page again in Pages brings the preview back to it; opening an unreadable file says so in the code pane and status, not as the failed-request notice.
- Commits 86cfe18f, 0dd29b1b, 158ae1dc.
- Tests: `tests/native-save/native-unreadable-page.spec.ts` (3: a page followed by a link and chosen in Pages, code pane, back Home and editing; a template only About uses, followed before and after the index), an `unreadableNeededFile` unit test in `tests/native-boot.test.ts`.
