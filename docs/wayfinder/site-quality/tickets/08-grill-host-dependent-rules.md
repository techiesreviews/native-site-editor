---
title: Decide how host-dependent rules are handled
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-spec-for-native-sites]
---

## Question

Security headers, caching, redirects, error pages and compression depend on the host. For GitHub Pages and Cloudflare (the publishing plan), decide what the editor writes into the repo (for example `_headers`, `_redirects`, `404.html`), what it tells the user to set up, and what is left out on hosts that cannot do it.

## Resolution (2026-10-26)

Lex: yes, as recommended.

- **Cloudflare:** the editor writes and keeps current:
  - `_headers`: security headers and caching (long cache for hashed media, short for pages);
  - `_redirects`: generated from Change URL's redirect list.
- **Both hosts:** a proper `404.html` from the site's own layout, made once when it is missing and then editable like any page.
- **GitHub Pages:** headers can't be set, so they are left out without a message. Change URL forwards moved pages with small forwarding pages (correction from the build plan: none exist today, since Change URL only writes `_redirects`, which GitHub Pages ignores; build slice 31 adds them). The fixed 600 s cache stays.
- **Nothing to set up by hand:** the editor doesn't ask the user to change host settings. Host-dependent rules the host can't meet are not counted against the site's quality.
- **Noted:** the workers.dev preview answered plain HTTP without redirecting. That is for the preview Worker in map 1 (build slice 35, Hot preview link), not for users' sites.
