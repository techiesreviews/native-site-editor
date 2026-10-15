---
title: Change URL and redirects keep the sub-folder
type: task (AFK)
status: closed
assignee: claude (mm-79 runner)
blocked_by: [78-prefix-every-writer]
builder: sol
phase: 7
---

## What

- Change URL and media renames write prefixed addresses in pages and in `_redirects` (`src/native-page-moves.ts:163-236`).
- `nativePageMovedUrl` keeps the sub-path (it drops it today: `shared/native-project.ts:383-397`).
- Agent `move_file` and `create_page` follow.

## Done when

- `tests/native-page-moves.test.ts` and `tests/native-project.test.ts` (or their current names): moves and redirect lines with and without a prefix.

## Done (2026-10-15)
- **Behaviour.** On a site whose Site address is in a sub-folder (`https://user.github.io/my-site/` → `/my-site`), changing a page's URL keeps the folder; domain-root sites (no address, the starter, techies.review) write exactly what they wrote before.
  - **Links** (`rewriteRouteLinks(…, prefix)` in `src/native-page-moves.ts`): Change URL, the Files tab's page moves and renames, and agent `move_file` rewrite root links to the moved page and its subtree whether written `/my-site/about/…` or `/about/…`, always writing `/my-site/company/…`. The prefix is matched on whole parts in any percent spelling and stripped once (a page named like the prefix, `/my-site/my-site/`, still works); the rest of each link is kept as written. Route keys, the URL field and "Keep the old URL working (/about/ redirects to /company/)" stay unprefixed routes.
  - **`_redirects`** (`editNativeRedirects(…, prefix)`): new lines are `/my-site/old/ /my-site/new/ 301`; existing lines are read in both spellings for the chain, loop and duplicate rules, and a rewritten destination is written prefixed. Media rename and Replace everywhere now pass plain addresses plus the prefix, so an older plain `/media/…` line is replaced, not duplicated; their written lines are unchanged.
  - **Canonical and `og:url`** (`nativePageMovedUrl`, `nativePageUrl` in `shared/native-project.ts`): with a site address ending in `/`, without one, or ending in `index.html`, the moved page's address is `https://user.github.io/my-site/company/`. Without a site address, a canonical whose path ends with the old URL (`https://host/my-site/about/`) keeps its folder; the home page never matches by suffix.
  - **Agents**: `move_file` and `create_page` run the editor's own actions (Files-tab move, `createNativeNew`), so they write exactly what the editor writes; the browser test proves `move_file` and Change URL produce the same drafts.
  - The prefix is read through the edit's transaction (`nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))`). The slice 76 source guard keeps an empty allowlist (slice 78 left no entries for Change URL).
- **Commits.** 8547ce77 claim; bd8a0cb2 build (Sol, interrupted once by an app restart and resumed; runner changes: the prefix is stripped without re-encoding the rest of a link, the home route never matches a canonical by suffix); this close.
- **Tests.** Unit: `tests/native-page-moves.test.ts` +3 (both spellings rewritten prefixed, subtree/bare/`index.html`/query/hash, `/my-site-other/` and `/about-us/` untouched, decoded prefix, prefix stripped once, prefixed redirect chains/loops/duplicates with CRLF, the same inputs with `""`), `tests/native-project.test.ts` +1 (three address forms, no address with a sub-folder canonical, domain-root address, unrelated canonical, encoded paths, home), `tests/media-rename.test.ts` +1, `tests/replace-everywhere.test.ts` +1 (an existing plain redirect line on a prefixed site). Browser: new `tests/native-save/native-subfolder-urls.spec.ts` (fixture native-subfolder, 532): Change URL with Keep the old URL, and agent `move_file`, each give `/my-site/notes/hello/` links in the home page and header and `/my-site/notes/first-note/ /my-site/notes/hello/ 301`. Ran `npm run check`, `npm run lint`, unit 3,387/3,387; specs native-subfolder-urls, native-page-urls, native-file-ops, native-media-rename, native-subfolder-canvas and native-mcp 44/44. Domain-root byte identity: a harness ran 1,465 outputs (`planPageMove`, `rewriteRouteLinks`, `editNativeRedirects` incl. media-style lines, `nativePageMovedUrl` with no, slash, no-slash and mixed-case addresses) over 9 fixtures against origin/dev 951fb9bf: 0 differ. Full suite not run: no shared plumbing beyond these functions, whose every caller's spec ran.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-79/round-1/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). No defects, no validation gaps, no nits. Fixed 0; rejected 0.
- **Bytes.** `test:budget` 354 KB gzip of 355 KB (within). Boot delta +246 B gzip against origin/dev (main +193 B, native-project +50 B, native-operations +3 B): `native-page-moves.ts` is in boot because the URL field counts links as you type; moving it to a lazy chunk is a boot-trimming change (slice 102's territory), not this slice's.
- **Follow-ups.** Slice 80: changing the Site address rewrites existing addresses; until then plain root links on a sub-folder site are upgraded only when an edit rewrites them (now including Change URL). GitHub Pages ignores `_redirects` (slices 52, 81).
