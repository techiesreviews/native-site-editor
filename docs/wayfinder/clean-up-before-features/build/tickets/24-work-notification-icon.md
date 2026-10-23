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

Work that finishes on a project and branch other than the one shown leaves a note there (`src/finished-elsewhere.ts`, kept in memory only, so a reload or a closed tab forgets it). Three kinds feed it from `src/main.ts`: a save that landed elsewhere and changed something (`saved` with `shown` false; a save GitHub answers as `unchanged` leaves none), files added by a Files drop that finished elsewhere (their count), and an agent text edit written elsewhere (`finishAgentTextElsewhere`, through the notes' `agent`), noted on the repository and branch its files were read from, under the account taken before it waited, and only when its draft there changed: a second delivery of a command (already applied, on show or elsewhere) or text that is the branch's own leaves nothing waiting and no note. Work that finished on the workspace open by then (shown again, or loading) leaves no note. Work on one workspace adds up in one note; the latest workspace comes first.

The repository menu shows it as Lex asked in the comment above: the count on the corner of a tile, the same shape and place as agents' questions, in the action colour (`--primary`) for its own meaning. It shows on the menu's tile (while no question waits; the tile's name and title still say both), on the project's row (over the tile's corner, above the remove ×) and on the branch's row in the Branches flyout. The words ("Saved", "3 files added", "Agent changes waiting", "Saved 2 times") are part of each row's accessible name ("main — Saved"; the project row and the tile say "Saved on main", with the repository too when it is another). The count is an `aria-hidden` span inside the row's button, so there is no new tab stop.

Clicking a row with a note opens that project and branch by the workspace link, `#repo=…&branch=…` (`openLink`; a link already in the address bar, as a folder's view or a load not remembered yet leaves it, is opened again). The menu closes and hands over as a branch chosen there does. The note stays until that branch is shown (its files listed), so a load that fails leaves it to click again; then it goes, a save's commit is followed, and once its editor is mounted its Publish panel opens with the changes unfolded (a panel already open is left open), with the save's Change status on Publish (Saved, then the deploy, for native sites as after any save). A branch that opens on its folder's view has no editor and so no Publish button: there the note goes and the save's status is announced in the top bar; the next load lets the click go, so a later editor opens nothing unasked. A note also goes when its workspace is shown any other way. On the project row the count lets taps through to the remove × under it. The open project's row still opens its Branches flyout, where the branch with the note carries the count.

Lead decisions (check with Lex):

- A note goes when its project and branch are shown again by any route (its editor mounted), not only by its click; otherwise a note on the branch now shown could not be cleared.
- The menu's tile shows one count: agents' questions win when both wait.
- Files are counted as "files added", not "images added" as in the example above: a Files drop takes any kind of file.

Tests: `tests/finished-elsewhere.test.ts`: notes add up per workspace, words and counts; a note goes when its workspace's editor mounts, not when a load only began; a clicked note stays until then, and opens its changes once (not after another workspace opened); a closed Publish caret stays shut and an open panel stays open; work with an id counts once; an agent's write is noted only when its draft changed during that run (not a recorded duplicate, text that is the branch's, work finished on show or with no scope; run again through the same wrapper, each run compares its own start), and not when its workspace is shown while it runs (`forEachAwait`); work on the workspace open now leaves no note; a note opened onto a folder's view goes there, follows its save once and opens Publish when an editor mounts, and is let go by the next load; `openLink` sets the link, or sends hashchange when the link is already there; the menu tile's words (`tileWords`): with a question waiting the corner shows the question and the name says both. `tests/native-save/native-switch-mid-work.spec.ts`: a save held across the switch to feature is counted on the tile, the project row and main's branch row, with "Saved on main" / "main — Saved" in their names and no focusable count; clicking main closes the menu and its Branches, lands on main with the Publish panel open, "Saved to GitHub." and its View commit link, and the count gone. A Files drop on native-demo's main that finished while native-routing was shown is counted on native-demo's row ("… — 1 file added on main") and the tile ("1 file added on native-demo-user/native-demo (main)"); the row's click opens native-demo on main with `images/logo.png` listed. An agent edit held across the switch is counted as "Agent changes waiting on main"; main's branch row opens main with `robots.txt` listed, and the agent's `get_command_status` says applied. A save held across the switch that GitHub answers as `unchanged` leaves no count.

Checks: `kit doctor` `RESULT: ok doctor 7/7 checks passed`; `kit unit tests/finished-elsewhere.test.ts` `RESULT: ok unit 16/16 (1 files)`; `kit unit --affected` `RESULT: ok unit 81/81 (5 files)`; `kit unit tests/main-ts-ceiling.test.ts tests/workspace-session-guard.test.ts` `RESULT: ok unit 13/13 (2 files)`; `npm test` 5228/5228; `npm run check` and `npm run lint` green; `kit specs native-switch-mid-work.spec.ts` `RESULT: ok specs 1/1 passed` (10 tests); `kit size` `RESULT: ok size boot 347 KB (+1 KB) vs dev@b9ff963, budget 355 KB`; `kit shots --spec .scratch/cbf-24-icon.spec.ts` (390, 768, 1280 × light, dark: the count fits the tile, the row and the branch row). `kit shots --compare dev` was not run: it takes screens or steps only, and the count needs work held across a switch (a raw spec); dev has no count to compare. `kit specs --affected` `RESULT: ok specs 50/50 passed`. `main.ts`: 4250 lines (ceiling 4250).

Commits: 6e3917cd (notes, menu count, wiring, tests), 9c0c28b8 (agent notes from the files read, counted once; tile words), 1fe213bf (a note stays until shown; the workspace link opened again; agent notes only for a changed draft; unchanged saves), and the round 3 review fixes (folder views, menu hand-over, notes skipped for the workspace shown).
