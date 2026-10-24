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

## Comments

- 2026-10-24, round 1 with Lex:
  - Where it lives: "What are the scenarios to take into account?" (asked in round 2).
  - What it shows: "Snapshot, or can we do a hot show something like when you run a local server. Else skip previewing for now."
  - Anyone with the link, no search engines, until turned off or 30 days: yes.
  - Cloudflare: Lex's account is on the **Free plan**. He asked what Workers Paid ($5 a month) gives (answered in chat from Cloudflare's pricing page, 2026-10-24).
