---
title: Find what actually gets a site found and quoted by AI search
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

GEO (generative engine optimisation) is full of claims. Using primary sources (Google Search Central on AI Overviews and AI Mode, OpenAI's and Perplexity's crawler and citation docs, Anthropic's crawler docs, the llms.txt proposal and real adoption, schema.org, and specification.website's Agent Readiness category), find what has evidence that it helps a small business or portfolio site be found, understood and quoted correctly. Mark each item: evidence / plausible / no evidence. Say what a native site can do for each without a build step, and what the editor could produce automatically.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/site-quality/research/02-geo.md` on branch `research/sq-02-geo` (commit `50a2fd5f`, never merged).

- **AI search reads the normal search index.** Google (2026-05-15): AI Overviews and AI Mode need no special file, markup or schema; GEO "is still SEO". Copilot uses Bing's index.
- **Evidence:**
  - Let each vendor's *search* crawler in: OAI-SearchBot, Claude-SearchBot, Claude-User, PerplexityBot, Googlebot and Bingbot. Blocking one drops the site from that vendor's answers; blocking the *training* crawlers (GPTBot, ClaudeBot, Google-Extended) does not affect search.
  - Words must be in the HTML: AI crawlers do not run scripts (a Vercel measurement, from industry rather than a vendor).
  - A `sitemap.xml` with true `lastmod` (Bing links it to AI search), and the host not blocking crawlers.
- **Plausible, unproven:** structured data, clear titles and headings, FAQ sections, bylines and dates, picture descriptions, speed. Google stopped FAQ rich results on 2026-05-07.
- **No evidence it helps AI search:** `llms.txt` (Google ignores it and no vendor says it reads it, although Lighthouse now checks for it), per-page Markdown copies, `Content-Signal` in robots.txt, and the other agent-readiness items.
- **Today's starter:**
  1. `robots.txt` says `ai-input=no` (asks AI not to quote) and has no `Sitemap:` line.
  2. The header and footer come from a script, so AI crawlers miss the menu. ADR 0001 decision 6 (declarative shadow DOM) fixes it.
  3. There is no `sitemap.xml`.
  4. Structured data is on the home page only.
- specification.website's AI-crawler table is out of date for Anthropic; vendor pages win (input for ticket 06). Bing's and OpenAI's wording is to be re-checked.
