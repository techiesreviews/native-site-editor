---
title: Decide the preview link for sharing a site
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Lex (2026-10-24): instead of a view-only guest link, a **preview mode**: first "the cloudflare tunnel as a preview mode", then "some kind of cloudflare preview link with subdomains we could run for customers. What would be a cheap preview domain? And what are the pros and cons?"

- Where the preview lives:
  - a temporary tunnel from Lex's computer;
  - a subdomain per site on a separate cheap preview domain;
  - a subdomain of techies.tools;
  - the free `workers.dev` address.
- What it shows: the saved version on GitHub, or also the current unsaved changes (a snapshot uploaded when sharing).
- How long a link lives and who can open it.
- What a self-hoster gets.
