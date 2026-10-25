---
title: "Editing feels instant again: no pause after a change or on Undo"
type: task (AFK)
status: closed
assignee: lead-38
builder: claude
blocked_by: []
---

## Goal

Lex's end check of the clean-up (2026-10-25, [feedback](../feedback.md)): "After a change, the editor pauses before I can continue editing; making changes feels delayed overall" and "Undo feels slow". Find the cause by measuring, then fix it. Use the `diagnosing-bugs` loop: reproduce, measure, find the cause, fix, measure again.

## Decided behaviour

- Typing, a block move, a drop, a Page Structure edit and Undo/Redo answer at once: the next keystroke or click is never held up by the save, the preview repaint, the agent context update, the text index or a session check after the previous change.
- Nothing else changes in what Lex sees.

## How to find it

- Measure in a real browser on the fake GitHub server (`tests/native-save/`): the time from a change (type a word in a heading, move a block, Undo) until the page takes the next input, and the main-thread long tasks in between (Performance API `longtask` entries, or a Playwright trace). Measure `origin/dev` and the last production commit (`origin/main`) the same way, so the report says whether the clean-up made it slower and by how much.
- Likely suspects to check, not to assume: work done synchronously after every change (draft store writes, agent context / `workingPart` updates from slice 52, the overlay rebuild from slices 30–32, the text index, `updateNativePreviewSources`, full preview repaints, guard re-checks from slices 21–23 and 27), and Undo waiting on a save or a reload.

## Files

Where the cause is; a browser spec that measures change-to-next-input and Undo (`tests/native-save/native-edit-latency.spec.ts`, new) with a budget.

## Done when

- The report gives before/after numbers for each measured action on dev and on main, the cause(s) with file and line, and the fix.
- After the fix: each measured action takes the next input within 100 ms on the spec's machine and has no main-thread task over 50 ms after the change (or the Done section says which one cannot and why).
- The new spec guards it; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-38 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/38-edits-feel-instant.md --builder claude-opus-5-5`; `kit wait job slice-38 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size` (at or under 362 KB), `kit ux --ticket <this ticket>` for the visible change.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5`. Land: `kit pr --ticket <this ticket>`.

## Done (2026-10-25)

- **How it was measured.** New browser spec `tests/native-save/native-edit-latency.spec.ts` (`@actual`, the real starter over the fake GitHub server): each action, then a Shift key pressed again and again for 1.5 s (the slowest press is "keystroke"), and the editor's main-thread long tasks over the same 1.5 s. `ASE_LATENCY_REPORT=1` prints the numbers and the scripts of each long frame, `ASE_LATENCY_PROFILE=<dir>` writes CPU profiles, `ASE_LATENCY_SLOWDOWN` and `ASE_LATENCY_ROUNDS` change the CPU slowdown and rounds. main (`b0bf769ea`), dev (`467eecd5f`) and this branch measured alternately in one sitting (machine load 6–8), two rounds each, Playwright's trace off (its snapshots are main-thread work of their own).
- **Numbers** (longest task / slowest keystroke in ms, round 1 and round 2). At normal CPU speed none of the three had a task over 50 ms; keystrokes took 26–50 ms on main and dev, 9–31 ms on the branch.

  | CPU 2× slower | main | dev | after the fix |
  |---|---|---|---|
  | type a letter | 52/53, 54/55 | 0/60, 50/51 | 0/10, 0/11 |
  | finish the text (Enter) | 80/88, 99/99 | 55/57, 97/106 | 0/48, 0/42 |
  | move a block (Alt+Up) | 0/54, 64/70 | 50/52, 90/99 | 0/42, 0/53 |
  | Undo the move | 0/49, 61/77 | 69/79, 77/81 | 0/38, 0/42 |
  | Undo the text | 0/52, 62/67 | 58/64, 65/72 | 0/31, 0/36 |
  | Redo the text | 64/65, 63/64 | 52/54, 64/68 | 0/26, 0/30 |
  | Page Structure move (Alt+Up) | 69/81, 54/63 | 60/68, 86/88 | 0/39, 0/42 |
  | drop a block | 52/60, 58/68 | 68/76, 81/91 | 0/54, 0/44 |

  | CPU 4× slower | main | dev | after the fix |
  |---|---|---|---|
  | type a letter | 100/30, 0/14 | 0/32, 0/30 | 0/11, 0/14 |
  | finish the text (Enter) | 143/161, 166/187 | 168/183, 192/205 | 85/103, 97/117 |
  | move a block (Alt+Up) | 183/186, 147/160 | 155/159, 195/197 | 102/117, 127/129 |
  | Undo the move | 174/177, 141/144 | 138/153, 160/162 | 88/91, 75/78 |
  | Undo the text | 145/157, 157/158 | 139/145, 177/194 | 52/64, 55/65 |
  | Redo the text | 122/124, 147/159 | 225/230, 116/127 | 70/82, 0/60 |
  | Page Structure move (Alt+Up) | 146/161, 144/166 | 232/252, 150/174 | 77/98, 59/73 |
  | drop a block | 0/9, 118/141 | 160/186, 140/142 | 126/137, 112/115 |

- **Did the clean-up make it slower?** No: main and dev are alike (within run-to-run noise). The pause was already in production. No action sends a network request in the 1.5 s after it (no save, session check or reload), and Undo waits on nothing; the pause is the editor's own work on the main thread after each change.
- **Causes and fixes** (the share each took at 4× in CPU profiles):
  - Image use was checked again 400 ms after every draft change (`src/controllers/media-host.ts:256`), and each check rescanned every text file of the site in one task (`src/controllers/media-usage-controller.ts:47` → `src/page-builder/media-usage.ts:23`, `src/page-builder/media-mentions.ts:26`): 200–280 ms. The usage check now keeps each file's scan and mentions (`mediaUsageCache`) and reads a file again only once its text changed, so an edit rescans its own page; the page walk reads each file's components once (`src/page-builder/media-references.ts:207`).
  - After each check, More's Improve images count parsed and rescanned every page again (`src/controllers/media-clean-up-controller.ts:61` → `src/page-builder/improve-images.ts:116`): 50–100 ms. It now keeps each file's parse and scans the same way (`improvePlanCache`, `kept` at `src/page-builder/improve-images.ts:62`).
  - Page Structure draws every row again after each change (`src/components/page-structure.ts:598`); each row asks the component tools for its instance and its menu (`:635`, `:666` → `src/page-builder/components.ts:325`, `:536`), which read the instance from the page source again per row, built the site's link list (every page's head) for every instance row, and parsed every row's icons from SVG text: 150–380 ms. Instances are now read once per site, page and template source (`instanceAt`, `src/page-builder/components.ts:325`); an instance's link and image suggestions are read when a field opens (`:1957`); the slot menu answers at once outside Edit component mode (`:555`); icons are parsed once and cloned (`src/page-builder/component-icon.ts:42`, `src/components/element-icons.ts:43`).
  - The edit bar and moves parsed the page's tree several times per action (`tree`, `src/page-builder/native-operations.ts:74`), and the parsed-source cache held two sources, so a page and its templates pushed each other out (`src/native-source-location.ts:58`). The last four trees and eight parsed sources are kept.
  - Checked and not a cause: the agent context update (about 1 ms), `updateNativePreviewSources` (up to 10 ms at 4×), draft store writes, the text index (no work after a change), guard re-checks, the publish menu and page label refreshes (each under 25 ms at 4×).
- **What cannot meet the budget at 4×.** At 4× slower CPU the branch still has one task of 52–127 ms after each change except typing: the preview frame's own redraw (`apply` and `renderPage` in `src/components/native-preview-runtime.js`), the code pane's line redraw, and Page Structure's whole-tree rebuild each stay one task. Meeting 50 ms there needs Page Structure to redraw only the rows that changed and the preview to split its render, larger than this ticket. The spec's budget therefore runs at 2× slower CPU, where every action passes; at 2× it fails on dev for all eight actions.
- **Spec.** Two rounds, each in a fresh browser session (its own copy of the fake repository and drafts); each action counts its better round, so another suite's load spike does not fail it. Budgets: slowest keystroke 100 ms, longest task 50 ms.
- **Tests.** `tests/media-usage.test.ts`: a kept usage check finds what a fresh one finds and reads again only the changed file (and every file for another site address). `tests/improve-images.test.ts`: a kept plan cache finds what a fresh plan finds after a page changes and rereads only that page. `kit unit --affected` 2741/2741; full `kit unit` (the `npm test` set) 5874/5874; `npm run check` and `npm run lint` clean; `kit size` 358 KB (±0, budget 362 KB). `kit specs --affected` 163/163 passed (`native-edit-latency.spec.ts` among them); the latency spec also passed three more times on the branch and failed on dev for all eight actions.
- After review: a read that finds no instance (most Page Structure rows) is kept too. The spec also times a click as the next input: right after a Page Structure move, a click on another row shows it selected within the same 100 ms budget (18 ms on the branch at 2×). New tests: `tests/component-instance-cache.test.ts` (a kept instance is read again once its template, the site or its page changes), `tests/native-operations.test.ts` (operations on one source share its kept tree and leave it as they found it), `tests/icon-clones.test.ts` (each icon and mark call is a fresh copy), `tests/media-usage-controller.test.ts` (another site's same-named file is read for its own text). `kit unit --affected` 2745/2745; `kit specs native-edit-latency.spec.ts` 1/1.
- Feature list: no change (speed only; nothing a user sees changes).

