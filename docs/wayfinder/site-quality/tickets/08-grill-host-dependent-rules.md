---
title: Decide how host-dependent rules are handled
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [01-research-spec-for-native-sites]
---

## Question

Security headers, caching, redirects, error pages and compression depend on the host. For GitHub Pages and Cloudflare (the publishing plan), decide what the editor writes into the repo (for example `_headers`, `_redirects`, `404.html`), what it tells the user to set up, and what is left out on hosts that cannot do it.
