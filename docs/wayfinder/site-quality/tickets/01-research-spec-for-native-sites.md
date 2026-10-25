---
title: Find which website rules apply to native sites and who can meet them
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Go through every topic in [specification.website](https://specification.website) (its `llms-full.txt` or MCP server) and Lighthouse's audits. For a native site (plain HTML, CSS and browser JS on a static host: GitHub Pages or Cloudflare) made in this editor, sort each rule into one of:

- does not apply;
- the starter or templates already meet it;
- the editor can meet it automatically (say how and where in the code, for example the Media pipeline, page details, Site settings, Save);
- it needs words from Lex;
- it depends on the host (headers, caching, redirects, per host).

Note what the editor does today. Group the output so a build can follow it.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/site-quality/research/01-spec-for-native-sites.md` on branch `research/sq-01-spec-for-native-sites` (commit `dff5bb4b`, never merged).

| Bucket | specification.website (177) | Lighthouse 13.5.0 (137) |
|---|---|---|
| Does not apply | 71 | 20 |
| Starter already meets | 29 | 70 |
| Editor can meet automatically | 38 | 29 |
| Needs Lex's words | 10 | 7 |
| Depends on the host | 29 | 11 |

- **Canonical:** a new site fails Lighthouse's SEO canonical check until it has an address. The template's test address is stripped, which leaves relative paths, and setting the address later does not fill them in.
- **Empty descriptions:** new pages start with an empty description, which Lighthouse fails (the map's open question on missing words).
- **robots.txt** says `ai-input=no`, against the GEO goal; Lex decides.
- **Slow first screen:** sections stay hidden until a script loads them, and the stylesheet loads its imports in a chain. This is the main speed risk, and script-less tools miss the menu.
- **Hosts:**
  - GitHub Pages: no custom headers, a fixed 600 s cache, no real redirects.
  - Cloudflare: `_headers` and `_redirects`; its default `workers.dev` address answered plain HTTP without redirecting.
- **Lighthouse** now has a fifth category, "Agentic Browsing", still under development.
- **The spec's MCP** answers, but its advertised `audit_url` tool returns "Unknown tool".
- **Suggested build stages:**
  1. page details;
  2. site files kept current;
  3. a faster first screen;
  4. host settings;
  5. Lex's words;
  6. a kit check.
