---
title: "A page GitHub can't read as text shows an error when opened, not a blank preview"
type: task (AFK)
status: open
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
