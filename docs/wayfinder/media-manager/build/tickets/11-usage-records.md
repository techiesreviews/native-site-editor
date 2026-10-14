---
title: Usage records per media file
type: task (AFK)
status: closed
assignee: claude (mm-11 runner)
blocked_by: [05-media-records, 06-image-families]
builder: sol
phase: 1
---

## What

The data behind the usage badge ([06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12), [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13)), built on today's reference scanner (`src/page-builder/media-references.ts`).

- Per family: the **distinct pages** that use it, **other uses** (stylesheets, components, settings, sharing pictures), and whether it is **checked** at all.
- A file the scan has not reached is **Not checked yet**; if any site file cannot be read, nothing counts as checked (as the scanner refuses today).
- Zero page uses alone never means unused.
- Phase 4 (slice 46) widens what is read; this slice keeps today's `.html`/`.css` reach and says so in the record.

## Done when

- `tests/media-usage.test.ts`: pages counted once per page, copies counted for their family, other uses apart, unreadable file makes everything unchecked, a file outside `images/` counted.
- `tests/media-references.test.ts` still passes.

## Done (2026-10-14)

- **Behaviour.** New pure module `src/page-builder/media-usage.ts`: `mediaUsageRecords({ media, sources, pages, components })` groups media with `mediaFamilies` (non-images and anything outside a family are one-member families, anywhere in the site, not only `images/`) and gives each family `{ main, members, checked, pages, otherUses }`. `pages` are the distinct pages that use any member (copies through `srcset`, originals, nested components, linked and imported stylesheets), once per page, in page order. `otherUses` lists every mention outside a page as `{ file, kind }`: `stylesheet`, `component`, `sharing` (meta sharing tags, which are other uses and never page uses) or `file` (other HTML); `settings` is reserved for site settings (slice 46 / stage 7) and never produced today. Any unreadable source, or a page or component template missing from the sources, makes every family unchecked and is listed in `unreadable`. `mediaUsageFor` looks up any member; a path the scan did not reach is Not checked yet. `mediaUsageState` gives `not-checked`, `used-on-pages`, `other-uses-only` or `no-uses-found` (only when checked with no page and no other use), so zero page uses alone never means unused. The result says `reach: "html-css"`: `.html`/`.css` only, `node_modules/` skipped. Scanner tokens now carry their attribute and tag. The page walk is shared with `mediaUsageIndex` and now follows only stylesheets a page applies (`<link>`, `@import`, style attributes) and components, so a link to another page, or a download link to a `.css` file, no longer counts that file's pictures on the linking page. This also corrects the Images library's existing "Used on N pages" count. Not wired into the UI: slice 12 calls it. Its workspace must pass unreadable files as `undefined` instead of throwing, as `sources()` does today for Delete unused.
- **Commits.** 66d9a98a claim; 7674d7e0 build (Sol); 685dc3fe review fixes (page links, unscanned pages); da6dcba0 second-review fix (only applied stylesheets).
- **Tests.** New `tests/media-usage.test.ts` (pages once per page, copies and originals for their family, other uses apart incl. sharing and components, unreadable and missing files leave everything unchecked, files outside `images/`, not-reached paths, reach, page links and stylesheet download links); `tests/media-references.test.ts` gains a token attribute/tag case and still passes. `npm run check`, `npm run lint`, unit 2335/2335; browser `native-asset-references`, `native-images-tab`, `native-media-library` 30/30.
- **Review (GPT-6.1 Sol).** First review: 2 fixed (a page missing from the scan still counted as checked; navigation links counted as page uses). Second review: 1 fixed (a download link to a stylesheet applied its pictures); 1 rejected: "a linked stylesheet absent from the sources should make everything unchecked". The caller passes every `.html`/`.css` file, so an absent linked stylesheet is a broken link, not an unread file. Treating it as unread would leave a site with one broken link Not checked yet forever.
- **Bytes.** First-paint budget unchanged (341 KB of 355 KB); the new module is not in any bundle yet.
