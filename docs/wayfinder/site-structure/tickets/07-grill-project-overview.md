---
title: Decide the project overview's scope and order
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-research-project-overview]
---

## Question

With research 03: build the overview for GitHub projects first or with local folders, what changes from the local-folders design (scores on cards, top bar B, the Inbox), and how a site's overview in the map relates to it.

## Resolution (2026-10-26)

Lex, after trying the [site map prototype](../prototypes/08-site-map.html) (also at `am-typing-together-poc.lexvd.workers.dev/mockups/site-map.html`) and being asked for his round 1 answers: "looks good". Taken as yes to the prototype and to every round 1 recommendation (Q1–Q11).

- **Built for GitHub projects first**, from the local-folders design (ticket 12) with research 03's 16 updates. The project list lives in IndexedDB from day one, keyed like `WorkspaceScope`, so folders add cards later without rework.
- **Every visit starts on the overview.** The last site is one click away on the large "Continue editing" card. A direct link still opens a project.
- **After Sign out,** GitHub sites are hidden from the overview until you sign in again.
- **On a new computer,** every site you can reach shows as a "Not opened yet" card. The first-visit screen is only for someone with no sites at all. Existing users get their list seeded once.
- **Cards:**
  - "Unsaved changes" with no number;
  - grid names on hover, as in Media;
  - no agent items;
  - one score ring per card, with five numbers on hover;
  - the large card shows the five site scores and opens Site health;
  - a project never scored shows no ring.
- **Pictures:** the home page drawn by the preview frame into the same store as the map's pictures.
- **Watch:** start-up size (tech-debt 12): the overview must load without raising the boot budget.
