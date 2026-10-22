---
title: "Notification icon on the project and branch where work finished"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [23-work-finishes-where-it-started]
---

## Goal

Rides with candidate #1. When work finishes on a site, branch or page other than the one shown (slice 23), Lex sees it.

## Decided behaviour

[Ticket 05, item 2](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **a notification icon shows on that project and branch in the selector; clicking it opens that site's changes.**

Lead decisions (check with Lex):

- The icon shows on the project row and on the branch row of the repository menu (the future project selector, ADR 0002), and on the selector button while any other project or branch has one. Its label names what happened, for example "Saved", "3 images added", "Agent changes waiting".
- It stays until clicked or until the tab is closed; it is not remembered after a reload.
- Clicking it opens that project and branch with its changes list (Change status) open; the icon then goes.
- Work that finished on another **page** of the same site needs no icon: the page shows its change when opened, and the Pages tree already marks unsaved pages.

## Files

- `src/components/repository-menu.ts`, `src/components/repository-menu.css` (icon from `src/icons.ts`, theme tokens; load the good-css skill)
- `src/workspace-session.ts` or a small `src/finished-elsewhere.ts` (new: the list of finished-elsewhere notes, keyed by session scope)
- `src/main.ts` (wiring only), `src/controllers/save-publish-controller.ts` (open Change status)
- Tests: unit for the notes list; `tests/native-save/native-switch-mid-work.spec.ts` (extend: icon appears, click opens the changes, icon goes)

## Acceptance checks

- The spec shows the icon after a held save finishes on the other branch, and the click lands on that branch with its changes listed.
- Keyboard: the icon is part of the row's accessible name; no new tab stop.
- `kit shots` at 390, 768 and 1280, light and dark: the icon fits the row.
- `npm run check`, `npm test`, affected specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-24 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/24-work-notification-icon.md --builder sol`; `kit wait job slice-24 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- `kit shots --steps .scratch/cbf-24-icon.json` (open the repository menu with a note present) and `--compare dev`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only); an Opus 5.5 UX review on request. Land: `kit pr --ticket <this ticket>`.
- Report: shots contact sheet, unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Comments

- 2026-10-22, Lex: reuse the indication already built for agents (MCP): the count on the corner of the site tile in the repository menu (`src/components/repository-menu.ts:40`, style `src/components/repository-menu.css:69`). Same look and placement, its own meaning ("finished work waiting on this site"); no new indicator style.
