---
title: "Workspace mount, palette, component tools and rail: main.ts is wiring"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-lazy-media-and-pages, 25-boot-and-snapshot, 26-github-retries-and-toast, 31-native-site-runtime, 32-one-overlay-for-agents-and-media, 41-is-a-file-rule, 53-agent-wiring-out-of-main, 70-pass-throughs-and-discard, 80-version-and-history-out-of-main, 81-code-panes-out-of-main, 82-setup-and-login-out-of-main, 83-repositories-and-account-out-of-main, 84-files-and-pages-out-of-main, 86-workspace-mount-out-of-main, 87-site-loading-out-of-main, 88-media-wiring-out-of-main, 89-page-builder-wiring-out-of-main]
---

## Goal

The last `main.ts` slice: Lex's **about 500 lines** ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). What is left besides wiring: `mountWorkspace` (about 330 lines), the palette, component tools, rail typing and block moves (about 400), preview selection, variants, the CSS workspace and the Page Structure controller wiring (about 250), and module state and lazy-module loaders. They move into modules that own their state; `main.ts` keeps imports, construction in order, and `boot()`.

**Re-planned 2026-10-25** (lead): after slice 70 `src/main.ts` was 2,863 lines, not about 1,350. The big moves are split out: 86 workspace mount, 87 site loading and the text index, 88 media wiring, 89 page-builder wiring (together about −2,360). This slice keeps what is left: the lazy-module loaders (`lazyModule`, about line 186), the remaining module state, and `main.ts` as imports, construction in order and `boot()`. It sets the final ceiling, closes TD 01 and lands with `kit pr --full`.

## Decided behaviour

No visible change.

Before starting, the lead re-reads `main.ts` and the earlier slices' Done notes; if the count after slice 84 is far from the estimate (about 1,350), the lead re-plans this slice (and may split it) and tells Lex in the two-line note.

## Files

- `src/main.ts`; new modules for the workspace mount (`src/workspace-mount.ts`), the component tools and rail wiring, the preview selection and CSS workspace wiring (names are the builder's)
- `src/controllers/command-palette-controller.ts`, `src/controllers/preview-selection-controller.ts`, `src/controllers/page-structure-controller.ts` (ports only)
- Tests: unit tests for each new module; `tests/main-ts-ceiling.test.ts` set to the final count; `docs/agents/code-map.md`; `docs/work/tech-debt/issues/01-main-ts-size.md` closed with the final count

## Done when

- `src/main.ts` at about 500 lines (at most 600; if more is left, the Done section lists each remaining block and why it stays).
- A moved function keeps its body; ports are live; "Module order holds" (CODING_STANDARDS).
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Runs alone in `main.ts`.

- `kit doctor`; `kit bg slice-85 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/85-main-ts-wiring-only.md --builder claude-opus-5-5`; `kit wait job slice-85 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: `main.ts` lines before and after and the final ceiling, the modules created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Comments

- 2026-10-23, lead: moved here from slice 31 (its last P1, review lead-31/20261023T185931Z): the remaining `native*` module variables in `src/main.ts` that are screen bookkeeping rather than site data, among them `nativeHistoryAliases`, `nativeMountListener`, `nativeHistoryShares`, `nativeAddPoints`, `nativeVariantFiles`, `nativeLinkParents`, `nativeStructurePaintedSources`, `nativeStructurePaints`, `nativeComponentFieldToken`, `nativeComponentFieldSnapshot`, `nativeTextIndexGate`. Each moves to the controller or module that uses it.
