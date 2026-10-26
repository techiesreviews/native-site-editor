---
title: Find what building the project overview takes now
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The project overview is designed in the local-folders map ([ticket 12](../../local-folders/tickets/12-prototype-project-overview.md#resolution-2026-10-14), prototype on local branch `prototype/lf-12-project-overview`). Find:

- what exists today in its place (sign-in screen, Get started, the project menu `src/repository-menu.ts` or similar), and what the design needs from the code: the list of projects, last edited, unsaved changes, pictures of home pages;
- whether it can be built for GitHub projects alone first, with local folders adding their cards later, without redoing work (the `SiteSource` seam in local-folders research 03);
- how scores (site-quality stage 6) fit on cards and rows: a site's five averages, kept from the last visit;
- which parts of the local-folders design have been overtaken by later decisions (top bar version B, catalogue parts, no toasts, the Inbox).

Findings on branch `research/ss-03-project-overview`, in `docs/wayfinder/site-structure/research/03-project-overview.md`.

## Resolution (2026-10-26)

Findings: `docs/wayfinder/site-structure/research/03-project-overview.md` on branch `research/ss-03-project-overview` (commit `edf578fb4`, never merged; `kit doctor` 7/7).

- **Today:**
  - a sign-in card (`src/setup-host.ts:68-137`) and Get started (`:332-347`);
  - an "Open a project" panel (`src/repository-list.ts:143-154`) and the project menu (`src/components/repository-menu.ts`);
  - after sign-in the editor jumps back into the last site (`src/controllers/boot-controller.ts:25-47`).

  Nothing keeps a list of opened projects, last edited, last page, pictures or scores. Unsaved changes are known from drafts (`src/drafts.ts:42-49`).
- **Pictures:** the preview frame can draw its own home page into a small picture (tested in Chrome inside the sandbox, about 14 ms, components included). Where it fails, the card keeps its coloured letter.
- **Build it for GitHub projects first.** The overview reads no site files, so it doesn't need local folders' source seam. Folders add cards later without rework, provided that:
  - the project list lives in IndexedDB from day one;
  - it is keyed like `WorkspaceScope` (which already has a folder kind, `src/workspace-session.ts:19-21`);
  - each card can show a problem.

  Local folders is not in Lex's current build order.
- **Scores:** one ring per row and card, as in Pages, with five numbers on hover. The large last-project card shows the five site rings and opens Site health. Averages are saved with the project. A project never scored shows no ring.
- **16 items in the local-folders design are overtaken:**
  - the two-line selector (top bar B is one line);
  - the project menu's contents (Site settings, Site health and the agent menu join it);
  - "3 unsaved changes" (no counts);
  - explainer lines and the greyed folder option;
  - always-shown names on grid cards;
  - the outside-change and git-clone notes (no toasts or strips);
  - the folder setup checklist (it moves to the Inbox);
  - lf-03's stale code map;
  - and more, listed in the doc.
- **Risks:**
  - the overview adds to start-up size, which is already over target (tech-debt 12);
  - self-host owner setup, several GitHub accounts and unreachable sites aren't designed;
  - existing users need their list seeded once.
- **Open for Lex:** six questions (start on the overview, Sign out, a new computer, unsaved wording, grid names, agents' items on cards).
