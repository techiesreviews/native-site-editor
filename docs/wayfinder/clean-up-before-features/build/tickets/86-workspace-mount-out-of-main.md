---
title: "Workspace mount and close leave main.ts"
type: task (AFK)
status: open
assignee: lead-86 (this session)
builder: claude
blocked_by: [70-pass-throughs-and-discard]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: the code panes wiring and `openCodeEditor` (258–340), `mountWorkspace` (340–635), `closeWorkspace` and `showDirectory` (2419–2524) and the checklist's account, repository and branch (2471–2528) move into `src/workspace-mount.ts`, which owns their module state. About −480 lines.

## Decided behaviour

No visible change.

## Files

- `src/main.ts` (those regions), `src/workspace-mount.ts` (new), `tests/workspace-mount.test.ts` (new)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 87; at most two slices in `main.ts` at once.

- `kit doctor`; `kit bg slice-86 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/86-workspace-mount-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-86 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.
