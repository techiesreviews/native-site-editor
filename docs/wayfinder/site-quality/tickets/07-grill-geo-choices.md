---
title: Decide what the editor does for GEO
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-research-geo]
---

## Question

With research 02's evidence, Lex picks the GEO items the editor produces (for example `llms.txt`, structured data, page summaries, FAQ sections, author and date details), and how each is made automatically.

## Resolution (2026-10-26)

Lex: yes, as recommended (questions 7 and 8 of round 1).

- **AI search robots always get in:** OAI-SearchBot and ChatGPT-User, Claude-SearchBot and Claude-User, PerplexityBot, Googlebot and Bingbot. Being quoted depends on them.
- **AI training robots:** one switch per site in Site settings, blocked by default. Covers GPTBot, ClaudeBot, Google-Extended, CCBot and the like. The list is kept current by the monthly check (ticket 06). Blocking them does not affect being found.
- **The starter's `ai-input=no` line goes**, in `robots.txt` in the starter project (`~/Projects/native-site-editor-starter`).
- **Words in the HTML:** components are written into the page's HTML (ticket 05), so robots see the menu and footer without running a script.
- **`llms.txt`:** made automatically from the sitemap and page descriptions, kept current on save. No per-page text copies for AI.
- **Not made:** FAQ sections, page summaries or other content written for AI. Structured data, author and dates come from Site settings and page details (ticket 05).
