---
title: "Guarded edit module, memory workspace and its test suite (no callers yet)"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 1
---

## What

Build the guarded edit module from the design (/home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md, sections 4-6). No caller changes.

- `src/guarded-edit.ts`: `createGuardedEdits(workspace)` → `{ run, now, stamp, peek }`, the `Reads` accessor `r` (`source`, `exists`, `template`, `site`), `RunOptions` (`since`, `guard`, `anchor`, `group`), `Planned`/`PlanResult`/`Outcome`/`StaleKey`/`Stamp` as in section 4.
- Ordering and errors exactly as section 4: `since` checked, `anchor` opened and proved to commit, `r` sealed after the plan, everything re-proved after every await; stale/refused are `Outcome`s with today's wording; writes/deletes/moves of a path never read through `r` throw (programmer error).
- Stamp = scope, `setupScope()`, generation, not version view, route shown, Edit component mode entry. The anchor's editor/model is proved separately (from the open to the record).
- Port `EditorWorkspace` (section 6). Production adapter `src/editor-workspace.ts`, built in `main.ts` from today's closures; its commit for now calls today's `applyNativeOperation` (expectedSources from the tracked reads, `current` = stamp ∧ guard ∧ anchor) or `applyNativeChange` (one mounted file, ranges). Slice 17 moves those bodies behind the seam.
- Memory adapter `tests/fakes/memory-workspace.ts`: files Map (branch + drafts), model versions, mounted set, history stack over the real `prepareNativeTextHistory`, bumpable generation/scope/route/edit-mode entry, `typeInto(path)`, `deferred()`, and a count of escaped `source()` reads.

## Done when

- `tests/guarded-edit.test.ts` covers every case in section 9 of the design (read, await/lazy import, apply staleness; one undo step with before/after selection; path choice; unchanged/stayed/refuse; programmer errors; guard).
- `main.ts` constructs the module (unused by callers) and `npm run check`, `npm test` and the full `native-save` suite are green.

## Done (2026-10-10)

- `src/guarded-edit.ts` (`createGuardedEdits` → `run`, `now`, `stamp`, `peek`) over the `EditorWorkspace` seam; production adapter `src/editor-workspace.ts` (writes are today's `applyNativeOperation` and the editor's range calls, anchor = open page in the same pane and session at the same revision), constructed in `main.ts`, no callers yet; memory adapter `tests/fakes/memory-workspace.ts` on the real receipt.
- Beyond the design: write destinations (creates, move targets) are re-proved after each of the commit's waits (stale `{exists}`); `now()` writes only its anchor until slice 17; a new typing group first closes any group the editor holds open.
- Tests: `tests/guarded-edit.test.ts` (59 cases, design section 9 plus review follow-ups), `tests/editor-workspace.test.ts` (2). About +3 KB gzip in the main bundle.
