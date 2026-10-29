---
title: "Boot back under 355 KB, so agent tools fit (tech-debt 12)"
type: task (AFK)
status: closed
assignee: am-42
builder: claude
blocked_by: [45-pin-shows-the-agent-that-took-it]
---

## Goal

Slice 14 (PR #257) can't land: after slice 45 the editor's startup bundle has 324 bytes left under the 362 KB budget and slice 14 needs about 400 more, even with its own parts loaded late. Lex raised the budget from 355 KB to 362 KB on 2026-10-25 on the condition that it comes back down ([tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). Doing that now gives slice 14 and the rest of this build room without raising the budget again (lead, 2026-10-29).

## Decided behaviour

- As tech-debt 12 says: the page-builder parts that never run before the first paint load when first used (Page Structure row menus, row moves and drags, URL planning, the rail's pick and drop, the preview's right-click menu), each keeping its session stamp from when it starts. Slice 86's Done notes (clean-up build) list what was measured.
- Then the budget goes back to 355 KB in `scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`, `tests/kit-size.test.ts` and the agent docs.
- No visible change, except a first use may take a moment longer; if one feels slow in the UX check, say so in `decide`.

## Files

- the modules above and their callers in `src/` (per tech-debt 12 and slice 86's notes)
- `scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`, `tests/kit-size.test.ts`, `docs/agents/` size lines
- `docs/work/tech-debt/issues/12-boot-back-under-355-kb.md` (close it)

## Done when

- `kit size` at or under 355 KB with the budget at 355 KB, with the before and after numbers in the Done.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted, capped as kit specs does now), the UX check on the moved features, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit size`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-29)

Feature list: no change (nothing new to try; the component tools arrive a moment after the first paint, see below).

- The component tools (`src/page-builder/components.ts`: Edit component mode, slot and text rows in Page Structure, the instance's name, chip and variants in the edit bar, Make component, Detach, Used on) no longer load at boot. `createPageBuilderHost`'s `mountComponentTools` imports the module through `lazyModule` (a failed load goes to chunk recovery) and resolves with the tools. `mountWorkspace` (`src/workspace-mount.ts`) leaves `componentTools` empty until this preview reports its first structure, then waits two frames and 100 ms (the runtime reports the structure just before the frame presents it, as the code panes' Monaco gate does) and loads them; once made, Page Structure redraws and the edit bar draws again for the selection held. The wait does nothing once its preview was replaced or the workspace closed, and tools that land after that are destroyed and handed over to no one. A load that fails is reported once and tried again with the next structure the preview reports. Before they land, an instance's slot and text rows and component edit bar parts are not drawn (they appear a moment after the page, on every mount), and Edit component mode cannot start, since nothing to start it from has drawn yet. A right-click on the page opens the element's menu at once; a shared template's part, which needs the tools to map to its instance, gets none until they land. An agent's make_component asked before then waits for the same load (`loadComponentTools`, handed to the agent's commands in `src/agent-site-host.ts`) and refuses with "The component tools are not ready." only when no preview is shown. The slot chip's CSS moved into the same chunk (only the tools draw chips).
- The parts tech-debt 12 named (Page Structure row menus, row moves and drags, URL planning, the rail's pick and drop, the preview's right-click menu) stay at boot: slice 86 measured them at about 1.3 KB together, and boot had to lose about 7 KB. A build with sourcemaps put the component tools at about 20 KB gzip of the boot chunks, the largest page-builder part that does not run before the first paint.
- `kit size` before (dev `d100709`): `RESULT: ok size boot 362 KB (±0 KB) vs dev@d100709, budget 362 KB` (370,688 bytes cached; requests 34). After, budget 355 KB: `RESULT: ok size boot 342 KB (-20 KB) vs dev@d100709, budget 355 KB` (requests before paint 34, unchanged; total 1,456 KB, +3 KB).
- Budget back to 355 KB: `scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`, `tests/kit-size.test.ts` (the boundary cases at 355, 355.001 and 360 KB, as before the raise), `docs/agents/agent-scripts.md`, `docs/agents/guardrails.md`, `docs/agents/local-testing.md`. The CI workflows' comments already said 355 KB.
- Tests: `tests/workspace-mount.test.ts` (a new `afterPaint` scheduling seam port): no tools at mount; after the first structure and the wait they are handed over, Page Structure refreshes and the edit bar redraws for the selection; a second paint loads nothing more; tools that land after a remount are destroyed and the new preview loads its own; the rail drag in Edit component mode runs after the paint. Also: a right-click before the tools land opens the element's menu, and none for a shared template's part; a failed load is reported once and the next structure loads them; a wait after the workspace closed loads nothing, and tools asked for and landing after it closed are destroyed (a second ask shares the load); a remount at the load's await hands nothing over (`forEachAwait`, 1 point). `tests/agent-site-host.test.ts`: make_component asked before the tools land waits for them; with no preview it refuses.
- Validation: `kit doctor` `RESULT: ok doctor 11/11 checks passed`; `kit unit --affected` `RESULT: ok unit 83/83 (5 files)`; `scripts/agents/unit.sh tests/main-ts-ceiling.test.ts` 14/14; `kit specs --affected` `RESULT: ok specs none affected` (81 left for kit pr); by name, the component and Page Structure specs `RESULT: ok specs 8/8 passed` (component-slot-seam, native-component-structure-host, native-components, native-edit-component-mode-actual, native-page-structure, native-structure-inplace, native-structure-readiness, native-structure-slots); `npm run check` and `npm run lint` green. `kit size` after the fixes: `RESULT: ok size boot 342 KB (-20 KB) vs dev@9b86f86, budget 355 KB`.
- UX check on the moved features (`kit ux --no-review --features F-component-03,F-component-04,F-component-08,F-structure-02,F-structure-06,F-bar-08`): `RESULT: ok ux 6 features tried, 32 scripted findings`; all six tries passed; the 32 findings are tap targets under 44 px at 390 px in controls this ticket does not change. Nothing felt slow; the reviewer's judgement is the slice's.
