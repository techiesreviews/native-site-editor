---
title: "Version view, restore and history wiring leave main.ts"
type: task (AFK)
status: closed
assignee: lead-80
builder: sol
blocked_by: [22-workspace-session-callers]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). The version view and restore (about lines 1044–1167 at `89ac5e0e`) and the history controller's wiring and ports (in 647–1043) move into a module that owns their state; `main.ts` keeps one construction call. About −250 lines.

## Decided behaviour

No visible change. The history panel stays lazily loaded.

## Files

- `src/main.ts` (the regions above), new `src/version-view.ts` (name is the builder's), `src/controllers/history-controller.ts`
- Tests: new unit tests for the moved module (ports typed with `satisfies`), `tests/history-controller*.test.ts` as affected
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); the module holds no copy of host state (live ports).
- Version view, restore and history specs green (`kit specs --affected`).
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-80 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/80-version-and-history-out-of-main.md --builder sol`; `kit wait job slice-80 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-23)

- The History panel's wiring, the earlier version on show (`viewVersion`, `endVersionView`, `checkVersionView`, the version bar) and its restore (`restoreVersion`, `afterRestore`, `openFileVersion`) moved from `src/main.ts` into `src/version-view.ts` (`createVersionView`), which builds the history controller and owns the version on show, its request counter and its dialog. `main.ts` keeps one construction call (`versions`) and reads `versions.view`, `versions.end`, `versions.check` and `versions.history`.
- Bodies are the old ones with `ports.` prefixes. Other changes: `onError` and `loadHistory` are wrapped in arrows; the confirm dialog port is typed as its `root` and `ask` (`ConfirmDialog`); `restoreFile` and `loadSnapshot` reach the later `workspaceBoot` consts through arrows.
- Host state stays live: the preview is a getter, the store, session, guarded edits and drafts are read at call time.
- No visible change; History still loads lazily.
- Tests: `tests/version-view.test.ts` (23 tests, ports typed with `satisfies`): an earlier version shows in the preview and the code pane and History marks it; Back to latest ends it, and choosing the latest commit ends a version on show; a late answer after another file opened, after a new load or after a setup-scope change is dropped; a newer choice supersedes an older one answered later; a source change or a setup-scope change ends it (`check`); a file from the site's history opens and shows its version, and at the latest commit opens without a read and ends the view; the preview port is read at call time (none at first, a later one gets the bar); Restore commits against the shown head and reloads; a draft, a decline or a moved repository stop it; a failed restore says why and keeps the view; an unchanged restore does not reload; a second Restore reuses the one dialog; a restore from the panel ends the view; a skipped restore beside a draft says it was kept; an expired session reports 401; a version that cannot be read says why, unless a newer choice or the end of the view came first; History's `viewing` is none once the setup scope or the open file moved on; a restore closes the History panel. `forEachAwait` races: the version read (file, load or newer choice moved on) and the restore's three awaits (the view ended) write nothing stale.
- `main.ts` 5279 → 5134 lines (−145; the region that moved was about 150 lines, so the ticket's −250 estimate was high), ceiling 5280 → 5140. Boot size 344 KB (±0 KB, budget 355 KB).
- Commits: fea31670 (the move), 9d8f4659 (review round 1), 7b4ce796 (review round 2), then review round 3's fixes.
- Review decisions (`.scratch/reviews/lead-80/` in the main checkout: 20261023T073548Z, 20261023T074213Z, 20261023T075300Z). Round 1: code-map ranges re-measured from the code (all sections had drifted about 70 lines); `forEachAwait` races added for the version read and the restore; tests for the latest commit, opening a file at a commit and at the head, superseded and post-load answers, a failed, an unchanged and a repeated restore, the skipped-restore message and the expired session. Round 2: this record's test count; setup-scope change and live preview getter tests. Round 3: commits, decisions and evidence here; the failed read, `viewing` after the scope or file moved on, and the panel closing after a restore. None rejected; optional nits (the kept `editorModule?.`, longer port names, the variant-reads boundary) left as they are.
- Evidence: `RESULT: ok unit 28/28 (2 files)`, `RESULT: ok specs 4/4 passed` (native-history, native-add-panel, native-make-component-menus, native-media-touch-contrast), `RESULT: ok size boot 344 KB (±0 KB) vs dev@f97599c, budget 355 KB`; `npm run check`, `npm run lint` and `npm test` (5092/5092 at fea31670) green.
