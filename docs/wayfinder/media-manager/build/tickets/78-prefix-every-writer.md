---
title: Every root address follows the prefix
type: task (AFK)
status: closed
assignee: claude (mm-78 runner)
blocked_by: [77-canvas-sub-folder]
builder: sol
phase: 7
---

## What

Decision 7. Convert every writer of root addresses to slice 76's helper:

- Media: `src/page-builder/media-markup.ts:11`, `media-references.ts:221`, `media-library-view.ts:360` (or its successor), `src/main.ts:683,1924`, `card-fill.ts:137,158`, the player and Online video markup, trimmed copies, Improve images.
- Pages and new sites: `native-elements.ts:65`, `shared/native-routes.ts:31-33`, `src/native-create.ts:79`, `shared/starting-point.ts:74,165`.
- Components and styles: `components.ts:1171,1888`, the component loader's `<script src>` (`component-loader.ts:7`), stylesheet links.
- `og:image` and canonical/`og:url` keep full addresses (`site-settings.ts:405`).
- The scanner, rename and Replace everywhere read prefixed addresses through the helper.

## Done when

- The source guard from slice 76 has no allowlist entries left.
- Unit tests of each writer with a prefix; full suite green; domain-root fixtures produce byte-identical output to before.

## Done (2026-10-15)
- **Behaviour.** On a site whose Site address is in a sub-folder (`https://user.github.io/my-site/` → `/my-site`), every root address the editor writes carries the prefix; domain-root sites (no address, the starter, techies.review) write exactly what they wrote before.
  - **Media** (`mediaUrl` is gone; `siteAddress`): images and srcsets, players, subtitles, download cards, looping and background videos, online-video stills, posters, trimmed copies, Improve images, the media-player stylesheet/script links, Copy path, Site settings' image choices and previews, the 404 page's home link. `og:image` and canonical/`og:url` keep full addresses (`https://user.github.io/my-site/media/…`).
  - **Pages and new sites**: route keys (`site.routes`, `nativePageRoute`) stay unprefixed identities built with `rootRoute`; written page links use `routeAddress` (always prefixes, so a page folder named like the prefix gets `/my-site/my-site/`): navigation (default pattern, new-page "Add to navigation", Navigation dialog), card links, the link popup's page choices, placeholder images, a blank site's stylesheet and home link (from the configuration that survives Replace them / Keep mine). Addresses the user types (link popup, Navigation URL field) use the idempotent `withSitePrefix`, so a typed `/my-site/x` is not doubled. The editor's own home/login links are named constants.
  - **Components and styles**: the loader's `<script src>` (`componentLoaderScript(prefix)`), recognised in either form; component image-slot choices (live `prefix` port).
  - **Readers**: the scanner, usage/in-use, Improve images, popup, Play, descriptions, place, trim, rename and Replace everywhere read `/my-site/…` and `/…` root links as the site's files; rename and Replace rewrite them prefixed, keeping each address's encoding (domain-root renames keep `/media/東京.webp`). Relative links never lose a folder.
  - **Lead decision (open since 76)**: with a prefix, a full address on the site's host outside its folder (`https://user.github.io/other-site/x.png`, `https://user.github.io/media/x.png`) is another site's file: `sitePathOf`, the scanner, mentions, rename, Replace and Site settings' preview leave it alone. Plain root links count with or without the prefix.
  - Where the prefix comes from: inside guarded edits and media batches, `.editor/config.json` read through the transaction (`readMediaPrefix` proves it; Improve images refuses a request whose address changed meanwhile); elsewhere a live read (`nativePrefix()`, `nativeSitePrefix(config)`).
  - **Guard**: `tests/site-path-prefix-guard.test.ts` has no allowlist entries left. None belonged to Change URL; slice 79 still owns `native-page-moves.ts`, `_redirects` and `nativePageMovedUrl` (untouched here).
- **Commits.** 95dded8c claim; 41c1f686 outside-folder rule (runner); aae88dc8 pass 1 media writers, 870fe763 pass 2 pages/navigation/cards/new sites, 987ec39c pass 3 components/loader/scanner/rename/Replace (Sol, runner changes); b2370c45 browser test; 4f48d886 review round 1 fixes (Sol, runner changes); aa81c18e `nativeSitePrefix` helper; 02fede3b review round 2 fixes (runner); 02598b10 spec ports; this close.
- **Tests.** Unit 3,381/3,381 (was 3,300 at slice 77): prefixed cases for every converted writer and reader, existing domain-root assertions unchanged. Browser: `native-subfolder-canvas.spec.ts` +1 ("a new page joins the navigation with the site's sub-folder in its link"); spec 4/4. Domain-root byte identity: a harness ran 532 writer outputs (media markup, players, online video, elements, blank site, link choices, routes, and per page of 5 fixtures — native-starter, actual-starter, native-conventions, native-cards, native-routing — player links, loader, renames incl. Unicode, posters, navigation, blocks, card fills, usage, Improve images plan, asset moves) against origin/dev c8870bdf: 0 differ; with `/my-site` 152 outputs change, proving it reaches the prefix code. Full suite (`full-suite.sh 3`): 1,053 passed, 0 failed, 60 skipped, 0 flaky before and after the round-1 fixes; after round 2, 72 failures from specs that build component tools in the page without the new `prefix` port (fixed in 02598b10; those 8 spec files then 105/105, one Used-on test passing on rerun alone) and one `native-media-cleanup` count test that passed on rerun (flaky once; green in both earlier full runs). Only spec files changed after that run. `npm run check`, `npm run lint` green.
- **Review (GPT-6.1 Sol, read-only), 2 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-78/round-1/` and `round-2/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1 fixed 5: full own-host addresses outside the folder were read as the site's; a route named like the prefix linked Home; Blank "Replace them" wrote links for a removed address; Unicode renames changed domain-root bytes; Improve images wrote with an unproven prefix. Round 2 fixed 5: Replace decoded `%23` in prefixed names; relative links in a folder named like the prefix lost it; component image editors never saw the prefix; typed prefixed navigation URLs were doubled; a `/styles` prefix skipped the stylesheet. Rejected 0. Runner also reverted two unasked behaviour changes from Sol (empty own-origin lists and relative navigation hrefs keep their old meaning). Not re-reviewed after round 2: five small fixes, each with a test shown to fail without it.
- **Bytes.** `test:budget` 362,051 B gzip of 363,520 B (354 KB of 355 KB); boot +1,108 B against origin/dev (360,943 B): the shared `site-path-prefix` helper now loads as its own small chunk (+674 B, one request) and main +480 B. About 1.4 KB (1,469 B) of boot headroom remains.
- **Follow-ups.** Slice 79: Change URL, `_redirects` and `nativePageMovedUrl` with the prefix (untouched). Slice 80: changing the address rewrites existing addresses; until then, unprefixed root links on a sub-folder site are only upgraded when an edit rewrites them (rename, Replace, navigation). The Navigation dialog shows read links as routes (`/notes/`) and writes them prefixed.
