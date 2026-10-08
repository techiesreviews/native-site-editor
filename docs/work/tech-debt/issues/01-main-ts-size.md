---
title: main.ts is 6,220 lines; ticket 08 wanted about 500
status: needs-triage
assignee:
blocked_by: []
---

# main.ts is 6,220 lines; ticket 08 wanted about 500

## What

Ticket 08 of lean-fast-editor wants `src/main.ts` down to wiring, about 500
lines. All 16 slices of `p5-controller-plan.md` are on dev; main.ts went from
8,215 to 6,220 lines (6,108 after slice 12b, +112 for boot memory). Slices 17
(dead code) and 18 (file tree controller) are in progress as Lex's "quick
wins"; after them, reassess.

## What is left (planner inventory at `ccfdce3`)

- Code editor open/close, history/version, secondary pane: about 1,480 lines.
- Native site model, sources, routes, preview adapter: about 1,080.
- Controller ports and forwarding wrappers: about 900.
- File tree rendering: about 610 (slice 18).
- Repository/branch boot (`chooseRepository`, `loadRepositories`, `loadSnapshot`, boot memory): about 540.
- Module state and start-up: about 450.
- `nativePreview`, selection, DOM edit plumbing: about 400.
- Setup wizard, Get Started, repository creation: about 354.
- Media, assets, upload: about 350.
- `applyNativeOperation` and native transactions: about 343, plus meta/settings about 190.
- Agent/MCP site context and actions: about 297.
- `mountWorkspace`: about 287.
- Left in the host on purpose by earlier slices: the page title pointer refresh (DOM-only, p5-16) and `afterFileChanges` (nine host transaction callers, p5-22).

## Judgement

Within the 355 KB budget the realistic floor is about 1,200–1,800 lines
(planned slices 19–26: code panes and history, agent context, native site
runtime, native transaction module, boot orchestration, setup, workspace
mount, port slimming). About 500 needs an architecture change: controllers
own their state, panels and action-only controllers load lazily, small shared
runtime/transaction modules. Lex chose quick wins only on 2026-10-08.

## Decide

The target for ticket 08: the realistic floor, the architecture change, or
accept the size after the quick wins.

## Comments

- 2026-10-08: quick wins landed (preview `bcf25a6b`): slice 17 dead code
  ([p5-23](../../../wayfinder/lean-fast-editor/build/p5-23-dead-code.md), −15:
  most candidate wrappers are live or keep TDZ safety) and slice 18 Files tab
  tree controller ([p5-24](../../../wayfinder/lean-fast-editor/build/p5-24-files-tree-controller.md),
  −211, +562 B). main.ts 6,220 → 5,994; budget 352 of 355 KB. Both reviewed by
  Sol (no defects); full native-save 740 / 85 / 0 on the stack. Next decision
  is Lex's.
