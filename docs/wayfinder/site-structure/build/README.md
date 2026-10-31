# Build: site structure

**Ready (guess, low confidence, 2026-10-27):** live ~8 Dec (search, slices 11, 20 and 21, starts ~12 Nov).

Lex's fifth build (order of 2026-10-23): a new way to see and shape a site.

- **Site map:** a zoomable map of every page, from a name block to the real page you can read, where pages are moved and added in place.
- **Search:** one search field in Pages, Media and Files.
- **Project overview:** a home screen of all your sites, each with a picture and its scores. Every visit starts there.

Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them.

Research is on branches that are never merged (`git show origin/<branch>:<path>`):

- `research/ss-01-zoomable-map` (pictures against live frames, measured; zoom levels; taking and keeping pictures; what the board must offer);
- `research/ss-02-structure-and-search` (the move and add code the map reuses, edge cases, links between pages, one search rule);
- `research/ss-03-project-overview` (what exists, GitHub first, scores on cards, 16 updates to the local-folders design).

The site map prototype is [08-site-map.html](../prototypes/08-site-map.html) (Lex: "looks good", [ticket 08](../tickets/08-prototype-site-map.md#resolution-2026-10-26)). The project overview's design is [local-folders ticket 12](../../local-folders/tickets/12-prototype-project-overview.md#resolution-2026-10-14), with research 03's updates.

Tickets live in [tickets/](tickets/), one slice each, numbered by stage:

- 10s: stage 1, shared foundations;
- 20s: stage 2, search;
- 30s: stage 3, the site map;
- 40s: stage 4, the project overview;
- 49: close-out.

Find takeable slices with `node scripts/agents/tickets.mjs frontier site-structure`.

## Gate

**Nothing here starts before the [site quality build](../../site-quality/build/README.md) has an empty frontier** (built and waiting for Lex's Tuesday end check; Lex's order: agents and multiplayer, catalogue, detail pass, site quality, then this). Search (slices 11, 20 and 21, question 1) starts as soon as the [atomic catalogue build](../../atomic-catalogue/build/README.md)'s frontier is empty. Releases still wait for Lex's written go-ahead on a Tuesday (Tuesday rules of 2026-10-27, [kitchen.md](../../../agents/kitchen.md#tuesday-review)). Below, "released" next to another map's slice means landed on `dev`.

This build also leans on other maps' slices. `blocked_by` can't point to another map, so each slice names them in its text and the lead checks them before claiming:

- [atomic-catalogue slice 05](../../atomic-catalogue/build/tickets/05-catalogue-board.md): the board, which slice 10 makes shareable;
- [atomic-catalogue slice 66](../../atomic-catalogue/build/tickets/66-organism-top-bar.md): top bar version B, the left panel and its search field slot (slices 20, 30, 41);
- site-quality stage 6 ([slices 63 and 65](../../site-quality/build/README.md)): the ring part and the site scores (slices 36, 44). Slice 36 degrades without them;
- [site-quality slice 31](../../site-quality/build/tickets/31-github-pages-moved-pages.md): forwarding pages (slice 13).

## Three releases

1. **Search** (stages 1 and 2): slices 10–13, 20 and 21. Slices 10, 12 and 13 change nothing visible but ride in this release so stage 3 can start right after.
2. **The site map** (stage 3): slices 30–36.
3. **The project overview** (stage 4): slices 40–44. It may run beside stage 3 once 12 has landed.

Then 49. Each release follows the kitchen's stations 6–12 ([kitchen.md](../../../agents/kitchen.md)), with Lex's end check (Tuesday) before it; the next stage starts once the one before has landed, without waiting for the release.

## Rules for the whole build

- **Agent Kit is required** for every slice and every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md)).
  - Run `kit doctor` first, then `kit slice` under `kit bg`, and `kit wait job`.
  - While building: `kit unit --affected`, `kit specs --affected` and `npm run check`.
  - `kit size` on every slice: boot bytes must not grow (the 355 KB goal of [tech-debt 12](../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The map, the board, the picture engine and search's Media read all load lazily. The overview (41) is measured before and after.
  - `kit shots` for anything visible, light and dark, 390 and 1280 wide.
  - `kit review`, then `kit pr` into `dev`.
  - A builder that cannot run a kit command says so in `decide`, and never skips one silently.
- **Builders and reviewers** follow the pins in [kitchen.md](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22):
  - Claude Opus 5.5 builds (`--builder claude-opus-5-5`, high).
  - A fresh Claude Opus 5.5 session reviews (medium).
  - One second opinion on the final version for slices 10, 12, 30 and 41 (`grok-4.7` or `gpt-6.1-sol`, within the weekly budget).
- **Catalogue parts only:** every control is a catalogue part; new screens (the map, the overview) are organisms drafted on the board and approved by Lex there. good-css for all CSS. No toasts, no explainer text, no counts in badges ([UX rulebook](../../../agents/ux-rulebook.md)); results and refusals show on the control or tile itself.
- **Reuse, don't copy:**
  - moving and adding go through the Pages tab's own controller functions;
  - search goes through `src/search/match.ts`;
  - pictures go through `src/page-pictures/`;
  - the canvas goes through `src/board/`.
- **`src/main.ts`:** wiring only, `tests/main-ts-ceiling.test.ts` green, at most two slices editing it at once (slices marked *main.ts*).
- **Docs move with the code:**
  - `docs/agents/code-map.md` (`tests/code-map.test.ts`) and `docs/agents/features.md` for visible features;
  - `CONTEXT.md` gains Site map, Project overview, Project list and Page picture as they land;
  - `docs/mcp.md` if agents see anything new.
- **Runner extras:** owner `ASE_OWNER=ss-NN`; branch `build/ss-NN-<slug>` from `origin/dev`. No preview deploys by builders (the lead runs `kit preview`). Never `main`.

## Stage 1: shared foundations

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [10 A shared board: the catalogue canvas, usable by the site map](tickets/10-shared-board.md) | L | – | – | – (catalogue slice 05, released) |
| [11 One search rule for the whole editor](tickets/11-one-search-matcher.md) | M | – | – | – |
| [12 Pictures of pages, taken in the browser and kept](tickets/12-page-pictures.md) | L | – | – | – |
| [13 Moving and adding pages: exact checks and staying in place](tickets/13-move-and-add-checks.md) | S–M | – | – | – |

## Stage 2: search

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [20 Search in Pages, Media and Files](tickets/20-search-in-the-panel.md) | M | visible | – | 11 (and catalogue slice 66, released) |
| [21 The other small searches use the same rule](tickets/21-other-searches-follow.md) | S | – | – | 11 |

## Stage 3: the site map

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [30 The site map: open from Pages, zoom from the whole site to a page](tickets/30-site-map.md) | L | visible | – | 10, 12 (and catalogue slice 66) |
| [31 Live pages up close](tickets/31-live-pages-up-close.md) | M | visible | – | 30 |
| [32 First visit: names first, then pictures](tickets/32-first-visit-pictures.md) | S–M | visible | – | 30 |
| [33 Selecting a page shows its links; menu pages get a mark](tickets/33-links-and-menu-mark.md) | S–M | visible | – | 30, 13 |
| [34 Rearranging and adding pages in the map](tickets/34-rearrange-in-the-map.md) | M–L | visible | – | 30, 13 |
| [35 Search lights up pages in the map](tickets/35-search-in-the-map.md) | S | visible | – | 30, 11 |
| [36 The site's own overview on the map](tickets/36-site-overview-card.md) | M | visible | – | 30 (site-quality 65 for the rings) |

## Stage 4: the project overview

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [40 The project list, kept in the browser](tickets/40-project-list.md) | M | – | – | – |
| [41 The project overview: every visit starts here](tickets/41-project-overview.md) | L | visible | main.ts | 40, 12 (and catalogue slice 66) |
| [42 A new computer, and a first visit](tickets/42-new-computer-and-first-visit.md) | M | visible | – | 41 |
| [43 Sign out and several GitHub accounts](tickets/43-sign-out-and-accounts.md) | S–M | visible | – | 41 |
| [44 Scores on project cards and rows](tickets/44-scores-on-projects.md) | S–M | visible | – | 41 (site-quality 63 and 65, released) |

## Close-out

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [49 Close-out: docs and the end check](tickets/49-close-out.md) | S | – | – | 20, 21, 31–36, 42, 43, 44 |

## First wave

10, 11, 12 and 13 together: board, search rule, pictures and move code share no files. 40 may join them, since it only adds a store and two hooks.

## Suggested order

The frontier decides; this is one order that keeps to the rules.

1. 10, 11, 12, 13 (and 40); then 20 and 21. Lex's end check (Tuesday) and the search release.
2. 30; then 31, 32, 33, 34, 35 and 36 (33 and 34 touch the same tile code: one after the other). Lex's end check (Tuesday) and the site map release.
3. 41 once 40 and 12 have landed; then 42, 43 and 44. Lex's end check (Tuesday) and the overview release.
4. 49.

## Lead decisions (technical, made in planning)

- **Pictures, not live frames (12, 30, 31):** research 01 measured 2.3 GB and 34 frames a second for live frames at 500 pages, against 0.34 GB and 57 with pictures; live frames only up close, at most 3.
- **Picture engine (12):** snapdom behind one function (Lex's choice), so switching to HTML-in-Canvas later is one change. Research 03's lighter in-frame method (`getHTML` into an SVG, about 14 ms) is the fallback the slice may measure against.
- **Picture store (12):** IndexedDB keyed by project, page and a source fingerprint, never the repository; pictures can always be taken again.
- **Board (10):** the catalogue's board becomes `src/board/`, lazily loaded in the production editor. `catalogue.html` stays preview-only.
- **One search rule (11, 20, 21, 35):** the palette's matcher in `src/search/match.ts`, with word starts first and middle-of-word matches below (Lex). The six matchers go.
- **Scrolling inside a live page (31):** over a live page the wheel or two-finger scroll scrolls the page, and pinch or Ctrl/⌘ with the wheel zooms. Elsewhere the wheel zooms. This was left open by the prototype; Lex sees it at the site map end check.
- **Phone (30–36):** the map works with pinch and drag, at most one live page, and tiles at the picture level. Moving a page on a phone uses the existing Move to… (a press-and-hold menu on the tile) rather than dragging. The prototypes were desktop only, so `kit shots` at 390 shows Lex the phone map at the end check.
- **Safari and Firefox (12, 30):** research couldn't start WebKit. Slice 12 tries pictures in Playwright's WebKit where it starts, and the lead checks the map on Lex's iPhone at the end check. Where pictures fail, tiles stay name blocks and cards keep their coloured letter: nothing breaks.
- **Forwarding pages (13):** hidden where the page list is made (`deriveNativeRoutes`), not only in the Pages tree, so the map never draws them and moving back over one replaces it. One line added to site-quality slice 31.
- **Project list (40):** IndexedDB, keyed like `WorkspaceScope`, kind-neutral, so the local-folders build only adds a record kind.
- **Overview first screen (41):** links still open a project directly; the warm boot guess warms only the large card's project or stops, whichever measures better.

## Questions for Lex (asked at hand-off)

1. **Start search earlier?** Answered 2026-10-26, Lex: as recommended (slices 11, 20 and 21 start right after the catalogue release). Search in Pages and files is your ask from 2026-10-16, and it only needs the new left panel (catalogue slice 66). Recommendation: let slices 11, 20 and 21 start right after the catalogue release, beside the detail pass. The rest waits for site quality.
2. **Two GitHub accounts on one computer:** answered 2026-10-26, Lex: as recommended (one list; clicking switches account). List both accounts' sites on one overview, or only the signed-in account's? Recommendation: one list of all of them; clicking another account's site switches to that account.
