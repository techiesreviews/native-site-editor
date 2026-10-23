---
title: "Notification icon on the project and branch where work finished"
type: task (AFK)
status: closed
assignee: lead-24
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

## Done when

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

## Done (2026-10-23)

Work that finishes on a project and branch other than the one shown leaves a note there (`src/finished-elsewhere.ts`, kept in memory only, so a reload or a closed tab forgets it). Three kinds feed it from `src/main.ts`: a save that landed elsewhere (`saved` with `shown` false and a commit), files added by a Files drop that finished elsewhere (their count), and an agent text edit written elsewhere (`finishAgentTextElsewhere`). Work on one workspace adds up in one note; the latest workspace comes first.

The repository menu shows it as Lex asked in the comment above: the count on the corner of a tile, the same shape and place as agents' questions, in the action colour (`--primary`) for its own meaning. It shows on the menu's tile (while no question waits; the tile's name and title still say both), on the project's row (over the tile's corner, above the remove ×) and on the branch's row in the Branches flyout. The words ("Saved", "3 files added", "Agent changes waiting", "Saved 2 times") are part of each row's accessible name ("main — Saved"; the project row and the tile say "Saved on main", with the repository too when it is another). The count is an `aria-hidden` span inside the row's button, so there is no new tab stop.

Clicking a row with a note opens that project and branch (by the workspace link, `#repo=…&branch=…`); the note goes at once. Once that branch's editor is mounted, its Publish panel opens with the changes unfolded, and a save's commit is followed as Change status on Publish (Saved, then the deploy, for native sites as after any save). A note also goes when its workspace opens any other way. The open project's row still opens its Branches flyout, where the branch with the note carries the count.

Lead decisions (check with Lex):

- A note goes when its project and branch are opened by any route, not only by its click; otherwise a note on the branch now shown could not be cleared.
- The menu's tile shows one count: agents' questions win when both wait.
- An agent edit's note needs the command's repository id (all current agents send it); without it no note is left.

Tests: `tests/finished-elsewhere.test.ts` (notes add up per workspace, words and counts, a shown workspace takes its note, a clicked note opens once its editor mounts and not after another workspace opened, a closed Publish caret stays shut). `tests/native-save/native-switch-mid-work.spec.ts`: a save held across the switch to feature is counted on the tile, the project row and main's branch row, with "Saved on main" / "main — Saved" in their names and no focusable count; clicking main lands on main with the Publish panel open, "Saved to GitHub." and its View commit link, and the count gone. A Files drop finished on main is counted as "1 file added" and the click lists `images/logo.png` in main's changes.

Checks: `kit doctor` `RESULT: ok doctor 7/7 checks passed`; `kit unit tests/finished-elsewhere.test.ts` `RESULT: ok unit 6/6 (1 files)`; `kit unit --affected` `RESULT: ok unit 71/71 (5 files)`; `kit unit tests/main-ts-ceiling.test.ts tests/workspace-session-guard.test.ts` `RESULT: ok unit 13/13 (2 files)`; `npm test` 5218/5218; `npm run check` and `npm run lint` green; `kit specs native-switch-mid-work.spec.ts` `RESULT: ok specs 1/1 passed` (9 tests); `kit size` `RESULT: ok size boot 347 KB (+1 KB) vs dev@a557f7b, budget 355 KB`; `kit shots --spec .scratch/cbf-24-icon.spec.ts` (390, 768, 1280 × light, dark: the count fits the tile, the row and the branch row). `kit specs --affected` `RESULT: ok specs 50/50 passed`. `main.ts`: 4250 lines (ceiling 4250).
