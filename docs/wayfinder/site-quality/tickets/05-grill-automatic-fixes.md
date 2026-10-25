---
title: Decide what the editor fixes by itself
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-research-spec-for-native-sites, 03-research-lighthouse-today]
---

## Question

Lex wants the editor to do it automatically wherever possible, with nothing marked "by agent". Decide:

- which rules the editor applies silently on save or while editing (picture dimensions, lazy loading, responsive copies, `lang`, canonical, sitemap, robots, share tags from page details, structured data from Site settings, and so on);
- what happens when words are missing (no title, description or picture description): written automatically from the page, or shown in place;
- how a page's quality shows in Pages and files without explainer text.
