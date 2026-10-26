---
title: Decide the target scores and rule sources
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-research-lighthouse-today]
---

## Question

With today's scores from research 03: confirm the targets (proposed 90+ performance, 100 for accessibility, best practices and SEO, mobile and desktop) and how specification.website's required items count. Is good-css the rule for every CSS the editor writes into a site (starter, templates, generated styles), and how is that checked?

## Resolution (2026-10-26)

Lex: "Speed 99", and the rest as recommended.

- **Accessibility, best practices and SEO:** a strict 100, on phone and laptop. Research 03 found these never vary between runs.
- **Speed (performance):** 99 on phone and laptop. Each page is run 5 times, and the check fails if the middle score is below 99. Also CLS ≤ 0.1 and LCP ≤ 2.5 s. If run-to-run variation causes false failures, it is looked at then; the bar is not lowered in advance.
- **Agentic Browsing** (Lighthouse's experimental fifth category): watched, no target. Changed 2026-10-26 in [ticket 10](10-grill-page-scores.md#follow-up-2026-10-26): a fifth ring with target 100.
- **specification.website:** the 38 rules the editor can meet automatically (research 01) are checked by the kit. Rules that need words are inbox items (ticket 05). Rules that depend on the host follow ticket 08.
- **good-css** is the rule for all CSS the editor writes into sites: the starter, component templates and generated styles. The MCP instructions tell agents to use it. Lighthouse checks its effect (speed, no layout shift), and review applies it to the CSS itself.
- **Check:** `kit lighthouse` (sketched in research 03) runs in `kit pr` when the starter or site-output code changes, in the weekly sweep, and at release.
