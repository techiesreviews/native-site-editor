---
label: wayfinder:map
title: Site quality
charted: 2026-10-25
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A build plan so every site made in the editor scores well by default and stays that way while Lex edits:

- **Lighthouse:** performance, accessibility, best practices, SEO;
- **SEO:** page titles, descriptions, sitemap, share pictures, structured data;
- **GEO:** being found and quoted correctly by AI search.

The rules are kept up to date as the specs change.

## Notes

- **Planning only.** Fourth in Lex's order of 2026-10-23. It absorbs the backlog issue [Sites made in the editor follow the Lighthouse rules](../../work/site-quality/issues/01-lighthouse-rules.md).
- **Charting answers (Lex, 2026-10-25):**
  - the destination above, and "we need to keep the specs up to date";
  - the rule sources are **Lighthouse**, **[specification.website](https://specification.website)** and the **good-css** skill (`npx skills@latest add vojtaholik/good-css`; installed here as `good-css`);
  - automate: "if we can automate the things that needs to be done to make it that way, yes please. I would love it if that is done by the editor automatically where possible, nothing needs to be marked by agent". A kit check is OK;
  - GEO is researched first, then Lex chooses.
- **specification.website** (Joost de Valk, MIT, `github.com/jdevalk/specification.website`): about 177 topics in 10 categories:
  - Foundations, SEO, Accessibility, Security;
  - Well-Known URIs, Agent Readiness, Performance;
  - Privacy, Resilience, Internationalisation.

  Machine-readable forms: `llms-full.txt`, `.md` per page, and an MCP server at `mcp.specification.website/mcp` with a URL audit tool. Checked 2026-10-25.
- **Inputs:**
  - the [direct-hosting goal](../../adr/0001-the-repository-is-the-site.md) (a repo is the site, any static host, no build);
  - the publishing plan (GitHub Pages default, Cloudflare);
  - the Media manager (responsive copies, descriptions, trimmed copies);
  - Site settings (public address);
  - prebuilts are CSS-first (`prebuilts-css-first` memory).
- **UX rules:** no toasts, feedback in place; nothing marked "by agent" for site quality.
- **Skills:** `grilling` with `domain-modeling`; `research` (branches `research/sq-NN-<slug>`); `good-css` for CSS.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier site-quality`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Hand off the site quality build plan](tickets/09-task-hand-off-build-plan.md#resolution-2026-10-26): 26 slices in five stages, two releases (site output, then the Inbox); after the detail pass; slim top bar added as catalogue slice 66
- [Decide the target scores and rule sources](tickets/04-grill-target-scores.md#resolution-2026-10-26): strict 100 for accessibility, best practices and SEO; speed 99 (middle of 5 runs) on phone and laptop; good-css for all site CSS; `kit lighthouse` checks
- [Decide what the editor fixes by itself](tickets/05-grill-automatic-fixes.md#resolution-2026-10-26): six fixes on every save; missing descriptions from the page's first sentences; an Inbox in a slimmer top bar for what needs the user (top bar prototype, then a catalogue slice)
- [Decide how the rules stay up to date](tickets/06-grill-keeping-rules-current.md#resolution-2026-10-26): a monthly research agent compares the spec, Lighthouse and vendor crawler docs, and proposes changes to Lex in T3; nothing changes without his OK
- [Decide what the editor does for GEO](tickets/07-grill-geo-choices.md#resolution-2026-10-26): AI search robots always in; AI training robots one switch per site, blocked by default; starter's ai-input=no goes; llms.txt made automatically
- [Decide how host-dependent rules are handled](tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26): Cloudflare gets _headers and _redirects; both hosts get 404.html; GitHub Pages leaves headers out quietly; nothing to set up by hand
- [Measure the starter today and find how Lighthouse fits the kit](tickets/03-research-lighthouse-today.md#resolution-2026-10-25): 100 accessibility and best practices; mobile home page 85 from layout shift; new sites 92 SEO from a relative canonical; `kit lighthouse` on the Node API, about 75 s in `kit pr`
- [Find which website rules apply to native sites and who can meet them](tickets/01-research-spec-for-native-sites.md#resolution-2026-10-25): of 177 spec rules, 38 the editor can meet automatically, 10 need words, 29 depend on the host; canonical and descriptions fail on new sites; script-hidden sections slow the first screen; GitHub Pages allows no headers
- [Find what actually gets a site found and quoted by AI search](tickets/02-research-geo.md#resolution-2026-10-25): GEO is still SEO; proven: let AI search crawlers in, words in the HTML, honest sitemap; llms.txt has no evidence; starter blocks AI quoting and hides its menu behind a script

## Not yet specified

- **Page scores:** being decided in [ticket 10](tickets/10-grill-page-scores.md) (rings in Pages, site health overview, measured on the user's computer to match Lighthouse); becomes build slices after the Inbox ones.

- **Multilingual sites:** hreflang and language versions. Probably later.
- **Privacy and consent:** analytics and cookie rules from the spec's Privacy category, if sites use them.

## Out of scope

- **Site structure, search and the zoomable sitemap view:** map 5. This map only makes sure `sitemap.xml` exists and is right.
