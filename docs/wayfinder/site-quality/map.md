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
- **Target scores:** proposed 90+ performance and 100 for accessibility, best practices and SEO. Lex named sources rather than numbers, so this is confirmed in the first grilling round.
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
- [Measure the starter today and find how Lighthouse fits the kit](tickets/03-research-lighthouse-today.md#resolution-2026-10-25): 100 accessibility and best practices; mobile home page 85 from layout shift; new sites 92 SEO from a relative canonical; `kit lighthouse` on the Node API, about 75 s in `kit pr`
- [Find which website rules apply to native sites and who can meet them](tickets/01-research-spec-for-native-sites.md#resolution-2026-10-25): of 177 spec rules, 38 the editor can meet automatically, 10 need words, 29 depend on the host; canonical and descriptions fail on new sites; script-hidden sections slow the first screen; GitHub Pages allows no headers
- [Find what actually gets a site found and quoted by AI search](tickets/02-research-geo.md#resolution-2026-10-25): GEO is still SEO; proven: let AI search crawlers in, words in the HTML, honest sitemap; llms.txt has no evidence; starter blocks AI quoting and hides its menu behind a script

## Not yet specified

- **Missing words:** a page with no title or description. Does the editor write one from the page's content by itself, or leave it empty and show it in place? Sharpens with research 01 and Lex's "nothing marked by agent".
- **Multilingual sites:** hreflang and language versions. Probably later.
- **Privacy and consent:** analytics and cookie rules from the spec's Privacy category, if sites use them.

## Out of scope

- **Site structure, search and the zoomable sitemap view:** map 5. This map only makes sure `sitemap.xml` exists and is right.
