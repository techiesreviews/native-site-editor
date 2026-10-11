---
title: "components.ts and the mode's bar on the Edit component mode module"
type: task (AFK)
status: closed
assignee:
blocked_by: [60-component-mode-module]
builder: claude ★
phase: 6
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/edit-component-mode-design.md (sections 2, 4, 6).

- `createComponentTools` builds the module from its deps (`shown` from `currentPath`/`previewPage`, `open = openFile`, `share = shareHistory`, `frame` = the preview's `editComponent`, `changed` = today's `ports.changed` body) and exposes it as `componentTools.mode`.
- `editComponent` opens through `mode.enter` (selection, focus and announce in `hooks.mounted` and after, as today); `navigateMode` through `mode.open`; `renameComponent` through `mode.rename(run)`; `renderBar` calls `mode.sync()`; Done awaits `renaming` then `mode.leave()`; `applyChip` keeps names with `mode.keep`, `templateChip` reads `mode.kept`; identity, slot menu, removal, rows and `makeComponentOfferedFor` read `mode.now()`.
- Gone from components.ts: `explicitTemplate`, `standing`, `enter`, `modeOpening`, `latestEntry`, `entryShare`, `modeShare`, `letGo`, `levelShares`, `letGoLevels`, `modeRenames`, `followRename`, `leaveMode`'s releases, `keptNames`, the `JSON.stringify(...active())` proofs. `editModeTemplate()`, `editModeEntry()` (= `mode.entry()`), `editingScope()` (= `mode.opened()`) stay as one-line reads so main.ts is not edited.
- `edit-component-mode.ts` keeps its DOM and draws `mode.now()` (`draw(mode)`): its `now`, `enter`, `leave`, `active`, `drill`, `back`, `retag` and `send` go; × calls `mode.dismissNotes()`. `edit-component-chain.ts` and `tests/edit-component-chain.test.ts` are deleted (cases in `component-mode.test.ts`).
- Behaviour, if the lead agrees (M2): after Make component and + New component the notes show once, in the bar when `enter` says "mode", else in the status line; the 8 s give-up replaces Make component's `Promise.race` and applies to + New component too; no late mode.

## Done when

- `grep -n "explicitTemplate\\|modeOpening\\|followRename\\|levelShares\\|modeShare\\|entryShare\\|keptNames" src` finds nothing; `edit-component-chain.ts` gone.
- `component-plans.test.ts` keeps "mode re-entered during an await refuses", the stamp fed by `mode.entry()`.
- New browser specs: the tag renamed by blur then Done at once (Done waits, the renamed instance selected on the page); with M2, the bar view's chunk held past 8 s by `page.route` (code pane open, notes in the status line once, no late mode).
- `native-edit-component*`, `native-rename-component-actual`, `native-slot-chip*`, `native-slot-context-menu-actual`, `native-make-component`, `native-new-component`, `native-edit-mode-bar-fits`, `native-component-structure-host`, `native-guarded-history` green; `npm run check`, `npm test`, full `native-save` suite and the `@actual` group green; budget delta reported.
