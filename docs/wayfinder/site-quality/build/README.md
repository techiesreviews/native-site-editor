# Build: site quality

Lex's fourth build (order of 2026-10-23): every site made in the editor scores Lighthouse 100 for accessibility, best practices and SEO and 99 for speed by default, is found and quoted by AI search, and stays that way while Lex edits, with the rules kept current every month. The editor does it by itself on every save, with nothing marked "by agent"; what only the user can supply goes to a new **Inbox** in the top bar. Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them.

Research is on branches that are never merged (`git show origin/<branch>:<path>`):

- `research/sq-01-spec-for-native-sites` (every specification.website and Lighthouse rule, bucketed, with what the editor does today)
- `research/sq-02-geo` (what gets a site found and quoted by AI search)
- `research/sq-03-lighthouse-today` (scores, causes, and the `kit lighthouse` sketch)

The slim top bar prototype is [../prototypes/05-slim-top-bar.html](../prototypes/05-slim-top-bar.html); Lex's pick is recorded in [ticket 05](../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26).

Tickets live in [tickets/](tickets/), one slice each, numbered by stage:

- 10s: stage 1, measuring and the first screen;
- 20s: stage 2, page details and site files;
- 30s: stage 3, host files;
- 40s: stage 4, the Inbox;
- 50s: stage 5, rules for writers and keeping them current;
- 59: close-out.

Find takeable slices with `node scripts/agents/tickets.mjs frontier site-quality`.

## Gate

**Nothing here starts before the [detail pass](../../detail-pass/map.md) is released to production**, except slices 10 and 11 (checks only), which start right after the catalogue release (Lex, 2026-10-26) (Lex's order: agents and multiplayer, catalogue, detail pass, then this). The detail pass itself waits for the [atomic catalogue build](../../atomic-catalogue/build/README.md)'s last release, which brings the slim top bar (catalogue slice 66) the Inbox sits in. The lead checks `kit status` before claiming the first slice.

## Two releases

1. **Site output** (stages 1–3, and 50): slices 10–32 and 50. Lex's end check, then release.
2. **The Inbox** (stage 4) and the monthly check (51): slices 40–44 and 51. They touch editor screens, not site output, so they may run beside stages 2–3; the release follows the site-output release. Then 59.

Each release follows the kitchen's stations 6–12 ([kitchen.md](../../../agents/kitchen.md)).

## Rules for the whole build

- **Agent Kit is required** for every slice and every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md)).
  - Run `kit doctor` first, then `kit slice` under `kit bg`.
  - While building: `kit unit --affected`, `kit specs --affected` and `npm run check`.
  - `kit size` on every slice: boot bytes must not grow. The site-output step loads only when saving.
  - `kit lighthouse` (with `kit site-rules`) once slices 10 and 11 have landed, on every slice that changes site output.
  - `kit shots` for anything visible.
  - `kit review`, then `kit pr` into `dev`.
  - A builder that cannot run a kit command says so in `decide`, and never skips one silently.
- **Builders and reviewers** follow the pins in [kitchen.md](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22):
  - Claude Opus 5.5 builds (`--builder claude-opus-5-5`, high).
  - A fresh Claude Opus 5.5 session reviews (medium).
  - One second opinion on the final version for slices 10, 16 and 40 (`grok-4.7` or `gpt-6.1-sol`, within the weekly budget).
- **Budgets come on as the fixes land** ([ticket 04](../tickets/04-grill-target-scores.md#resolution-2026-10-26)): `scripts/agents/lighthouse-budget.json` and the `kit site-rules` list name what is enforced. Accessibility and best practices from slice 10; SEO from slices 20 and 22; speed (middle of 5 runs ≥ 99, CLS ≤ 0.1, LCP ≤ 2.5 s, phone and laptop) from slice 16. A rule not yet enforced prints `todo (slice NN)`, never a pass. The bar is never lowered without Lex.
- **Silent and in place:** generated changes go into the same commit as Lex's save and show in Compare changes. No toasts, no explainer text, no "by agent" marks ([UX rulebook](../../../agents/ux-rulebook.md)). The Inbox dot and the Pages dot are Lex's decisions (ticket 05), like the agents build's Pages dots.
- **good-css** for all CSS written into sites (slice 50 puts it in the agents' instructions); review applies it.
- **Starter slices** (13, 14, and the starter part of 50) change the separate starter repository (`~/Projects/native-site-editor-starter`, on its `dev`). It has no kit: the change reaches this repo as a byte-for-byte `fixtures/actual-starter` refresh with a new line in `fixtures/actual-starter.README.md`, and this repo's `kit pr` checks it.
- **Several editors:** the site-output step runs once per save, by whoever saves (agents build slice 26).
- **`src/main.ts`:** wiring only, `tests/main-ts-ceiling.test.ts` green, at most two slices editing it at once (slices marked *main.ts*).
- **Docs move with the code:** `docs/agents/code-map.md` (`tests/code-map.test.ts`), `docs/mcp.md` and `worker/site-conventions.ts` for what agents are told, `CONTEXT.md` (Inbox is there), ADR 0004 from slice 16.
- **Runner extras:** owner `ASE_OWNER=sq-NN`; branch `build/sq-NN-<slug>` from `origin/dev`. No preview deploys by builders (the lead runs `kit preview`). Never `main`.

## Stage 1: measuring and the first screen

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [10 kit lighthouse: the scores as a kit check](tickets/10-kit-lighthouse.md) | M | – | – | – |
| [11 kit site-rules: the specification.website rules the editor meets](tickets/11-kit-site-rules.md) | M | – | – | 10 |
| [12 The site-output step in the save path](tickets/12-site-output-step.md) | S–M | – | – | – |
| [13 Starter: a faster first screen and an open robots.txt](tickets/13-starter-first-screen.md) | S–M | visible | – | – |
| [14 Starter: the loader uses components already written into the page](tickets/14-starter-loader-reads-written-components.md) | M | visible | – | 13 |
| [15 The editor reads pages that carry written components](tickets/15-editor-reads-written-components.md) | M | visible | – | 14 |
| [16 Save writes components into every page](tickets/16-save-writes-components.md) | L | visible | – | 15, 12 |

## Stage 2: page details and site files

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [20 Full page and share addresses from Site settings](tickets/20-full-addresses.md) | M | – | – | 12 |
| [21 Site language in Site settings](tickets/21-site-language.md) | S | visible | – | 12 |
| [22 A page's description from its first sentences](tickets/22-description-from-page.md) | S–M | – | – | 12 |
| [23 sitemap.xml and robots.txt kept current](tickets/23-sitemap-and-robots.md) | M | – | – | 12, 20 |
| [24 Site settings: let AI training robots in](tickets/24-ai-training-switch.md) | S | visible | – | 23 |
| [25 llms.txt made automatically](tickets/25-llms-txt.md) | S | – | – | 23, 22 |
| [26 Structured data on every page](tickets/26-structured-data.md) | M | – | – | 20 |
| [27 Pictures: sizes, lazy loading and the main picture first](tickets/27-pictures-first-screen.md) | M | – | – | 12 |

## Stage 3: host files

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [30 Cloudflare: _headers written with the site](tickets/30-cloudflare-headers.md) | S–M | – | – | 12 |
| [31 GitHub Pages: moved pages still answer](tickets/31-github-pages-moved-pages.md) | S–M | – | – | – |
| [32 A 404 page on every site](tickets/32-not-found-page.md) | S | – | – | 12 |

## Stage 4: the Inbox

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [40 The Inbox in the top bar](tickets/40-inbox.md) | L | visible | main.ts | – |
| [41 Inbox: site improvements across every page](tickets/41-inbox-site-improvements.md) | M–L | visible | – | 40 |
| [42 Pages and files: a dot on pages with an open item](tickets/42-inbox-page-dots.md) | S | visible | – | 41 |
| [43 Inbox: agents' questions and finished asks](tickets/43-inbox-agent-items.md) | M | visible | – | 40 |
| [44 The setup checklist moves into the Inbox](tickets/44-inbox-setup-checklist.md) | M | visible | main.ts | 40 |

## Stage 5: rules for writers and keeping them current

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [50 good-css for every site's CSS](tickets/50-good-css-for-site-css.md) | S–M | – | – | – |
| [51 The monthly rule check (lead)](tickets/51-monthly-rule-check.md) | S | – | – | 11 |

## Close-out

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [59 Close-out: docs, budgets and the scores](tickets/59-close-out.md) | S | – | – | 10, 11, 16, 21, 24, 25, 26, 27, 30, 31, 32, 42, 43, 44, 50, 51 |

## First wave

10, 12 and 13 together (kit, save path and starter: no shared files). Then 11 after 10, 14 after 13, and 15 and 16 in order; 50 any time.

## Suggested order

The frontier decides; this is one order that keeps to the rules.

1. 10, 12, 13; then 11, 14, 50; then 15; then 16.
2. 20, 21, 22, 27, 30, 31, 32 as their blockers land; 23 after 20; then 24, 25 and 26. Lex's end check and the site-output release.
3. 40 (it may start beside step 2); then 41, 43 and 44; then 42. The lead runs 51 once 11 has landed and Lex has OK'd the schedule. Lex's end check and the Inbox release.
4. 59.

## Lead decisions (technical, made in planning)

- **One site-output step (12):** everything "done silently on every save" runs in one step inside the save path and returns extra file changes for the same commit, rather than files kept as drafts while editing. It catches pages agents changed in the repository too, and it is one place to test.
- **Written components (14–16):** declarative shadow DOM written by the editor on save. Nobody else plans it (ADR 0001 decision 6 was "later, optionally"); slice 16 records ADR 0004. The loader still replaces a stale copy with scripts on, so a page an agent saved outside the editor still shows the latest component.
- **Descriptions (22):** "follows the page text until Lex writes his own" is decided by comparing with what the editor would have made from the last saved version; nothing extra is stored.
- **sitemap `lastmod` (23):** the save date for pages in the save; others keep theirs; a page's first entry takes its last commit date from GitHub once.
- **Owned files:** the editor owns `sitemap.xml` and `llms.txt` whole; in `robots.txt` and `_headers` it owns its own lines and keeps the rest.
- **Robot lists (23):** one data file, `shared/ai-crawlers.ts`, which the monthly check keeps current.
- **Wave-offs (40):** stored in `.editor/config.json`, so other editors and agents see them; "Decorative" writes the picture markup the Media manager writes today.

## Questions for Lex (asked at hand-off)

1. **Start the kit checks early?** Answered 2026-10-26, Lex: "yes": slices 10 and 11 start right after the catalogue release, beside the detail pass. Slices 10 and 11 add checks only and change nothing visible. Recommendation: let them start as soon as the catalogue is released, beside the detail pass, so scores are watched from then on; everything else waits for the detail pass.
2. **Written component copies in the code pane (15):** answered 2026-10-26, Lex: "yes, I want an atomic design, component structure. This is what I would like to do going forwards." Folded to one read-only line per component. Asked again 2026-10-26, after Lex asked whether this is about the editor or the website (the editor's code view; the published site is unchanged for visitors). each page's HTML will carry a copy of its header, footer and so on. Recommendation: folded to one line named after the component and read-only; you change the component itself, and every page follows on save.
3. **Moved pages on GitHub Pages (31):** answered 2026-10-26, Lex: "yes" (forwarding pages, hidden from Pages). Ticket 08 said Change URL keeps its redirect pages there, but today it only writes `_redirects`, which GitHub Pages ignores, so old addresses give a "not found". Recommendation: on GitHub Pages, Change URL also leaves a tiny forwarding page at the old address (hidden from Pages).
