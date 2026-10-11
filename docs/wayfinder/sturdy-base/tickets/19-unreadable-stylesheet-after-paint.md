---
title: "A stylesheet GitHub can't read as text doesn't break the preview after it paints"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- Root cause: every native read went through one `readFiles` batch, which GitHub's file endpoint refuses whole (415) when one file in it is not UTF-8 text. The text index after the paint then rejected and `startNativeTextIndex` put its message up as the preview error; a page *linking* such a sheet did not even paint (the boot's shown read failed the same way). Now `readSiteTexts` (src/native-boot.ts) halves a batch refused for one file (415 not text, 413 too big) until it is alone, skips it and names it; other failures still throw. The boot's shown/predicted/linked-style reads, component stylesheets and the text index use it; skipped files are remembered (`nativeUnreadableFiles`), an unreadable stylesheet is a preview warning (not "missing from this branch", for links and `@import`s alike), the code pane says "This file is not UTF-8 text." as before, and a page or template the shown page needs still fails with its path.
- Commits 109cecb7, 883e2c98, 60062f53, df5af5a5.
- Tests: `tests/native-save/native-unreadable-stylesheet.spec.ts` (4: linked sheet paints/indexes/edits and the code pane; the index meeting the sheet first after the paint; imported and component sheets; unused vs used unreadable template), `readSiteTexts` unit tests in `tests/native-boot.test.ts` (4), an `@import` case in `tests/css-imports.test.ts`; `native-boot-requests` injects the real 415 at every read, and its "page made before the index" test no longer races the index under load. The fake server's `/__demo/external-edit` takes `base64` bytes.
