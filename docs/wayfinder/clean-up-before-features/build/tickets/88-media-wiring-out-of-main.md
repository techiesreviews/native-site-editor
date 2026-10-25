---
title: "Media wiring leaves main.ts"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [86-workspace-mount-out-of-main]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: image paths, uploads, discard and media text (`nativeImagePaths` to `readMediaText`, 1731–1795), `mediaOrigins` (1796–1899), the media controller construction, `mediaIdentity`, the lazy media batch and `applyMediaBatch` (1900–1923) move into a media host module beside `src/controllers/media-controller.ts`. About −200 lines.

## Decided behaviour

No visible change.

## Files

- `src/main.ts` (that region), the new media host module (name is the builder's), its unit tests
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts` (entries follow moved functions), `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 362 KB (Lex, 2026-10-25; [TD 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)) (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- The `native-media-*` specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts after 86; may run beside 87 or 89.

- `kit doctor`; `kit bg slice-88 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/88-media-wiring-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-88 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.
