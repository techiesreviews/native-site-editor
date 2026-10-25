---
title: Decide the preview link for sharing a site
type: grilling (HITL)
status: closed
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
- 2026-10-24, round 2:
  - "Agency or holder can use ours, but don't have to, if they self host, I don't provide the workers and temporary links."
  - "Hot preview sounds good, we can always ask to set up a workers.dev."
  - On Workers Paid: "What other benefits are there to do this? It's only for the daily workers than i don't think its needed" (answered in chat; stays on Free).

## Resolution (2026-10-24)

Decided with Lex:

1. **Where it lives:**
   - Lex's hosted editor runs preview links on a **separate cheap domain**, each site at its own subdomain. That keeps site scripts away from the editor and its sign-in, and keeps sites apart from each other.
   - Agencies may use Lex's hosted editor and its previews, but don't have to.
   - **Self-hosters get no workers or preview links from Lex.** They run their own, on their free `workers.dev` address or their own domain.
   - Buying the domain is Lex's (money; not before stage 3). Avoid the cheapest spam-prone endings (`.bid`, `.loan`, `.men`, `.download`); about $5–7 a year (`.fyi`, `.uk`, `.link`, Cloudflare Registrar via cfdomainpricing.com, 2026-10-21).
2. **What it shows:** a **hot preview**, with no snapshot.
   - The real site at the preview address updates live as Lex edits, like a local server with live reload.
   - Lex's open tab sends files and changes through the shared-editing relay, and nothing is stored on the server.
   - While his editor is closed, the link shows a plain "not running" page.
   - Built in stage 3 with shared editing.
3. **Access:** anyone with the link; search engines told to stay out; it lasts until turned off or 30 days.
4. **Situations to handle:**
   - a customer on a laptop or phone, and a forwarded link;
   - strict company networks;
   - the site's own scripts kept away from the editor;
   - many sites, each kept apart from the others;
   - sites in a sub-folder;
   - self-hosters' own addresses;
   - a leaked or popular link must not eat the editor's daily allowance;
   - the editor closed.
5. **Cloudflare plan:** stay on Free. Lex: the daily limit alone doesn't justify $5 a month. Revisit when:
   - the editor first hits the daily cut-off (95,517 of 100,000 on 2026-10-15);
   - or a server feature needs more than Free's 10 ms of computer time per request (for example making preview pictures for agents on the server).

## Comments (after resolution)

- 2026-10-25, Lex: "let's keep it at workers.dev for as long as we can and skip a custom domain for now". This replaces item 1's separate cheap domain: a separate preview Worker on its own `workers.dev` address, with a path per site. Nothing to buy.
