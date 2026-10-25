---
title: "Site loading and the text index leave main.ts"
type: task (AFK)
status: open
assignee: lead-87 (this session)
builder: claude
blocked_by: [70-pass-throughs-and-discard]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: reading and loading a native site's style, shown and asset files (`readNativeStyleFiles` to `forgetDraftedAssets`, 1489–1730), component styles, the site's files and `activateNativeSite` (1929–2128), the text index, first-paint gating and page titles (`nativeTextIndexScopeKey` to `ensureNativeTextIndex`, 2129–2316), the current page label, file readers and unreadable-file warnings (2317–2418) move into one site-loading module that owns their state (among the `native*` variables in [85](85-main-ts-wiring-only.md)'s comment: `nativeTextIndexGate`). The builder may make it two modules (loading, text index) if one would pass about 600 lines. About −730 lines.

## Decided behaviour

No visible change. Boot order, first paint and the boot-memory specs stay as they are.

## Files

- `src/main.ts` (those regions), the new module(s) (names are the builder's), their unit tests
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts` (entries follow moved functions), `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- `native-boot-memory.spec.ts`, `native-lazy-panels.spec.ts` and the text-search specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 86; at most two slices in `main.ts` at once.

- `kit doctor`; `kit bg slice-87 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/87-site-loading-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-87 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.
