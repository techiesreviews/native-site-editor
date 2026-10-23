---
title: "Repository list, account and sign-out leave main.ts"
type: task (AFK)
status: closed
assignee: lead-83
builder: sol
blocked_by: [82-setup-and-login-out-of-main, 26-github-retries-and-toast]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). The repository list (`loadRepositories`, 113 lines), account and `disconnect()` (about lines 5331–5560 at `89ac5e0e`) move into the boot module of slice 25 or a sibling; `boot()` and the global listeners stay in `main.ts`. About −270 lines.

## Decided behaviour

No visible change. Sign-out still clears the boot memory (slice 25's spec guards it).

## Files

- `src/main.ts` (the region above), `src/workspace-boot.ts` (slice 25's module) or a sibling
- Tests: affected unit tests; boot, repository menu and sign-out specs through `kit specs --affected`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body; ports are live; the session (slices 20–22) is the only workspace check.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-83 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/83-repositories-and-account-out-of-main.md --builder sol`; `kit wait job slice-83 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-boot-memory.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-23)

- `loadRepositories`, `repositoryOptions`, `refreshRepositoryList`, `switchAccount` and `disconnect` moved, bodies unchanged apart from reading host state through live ports, into the new `src/repository-list.ts` (`createRepositoryList`). `main.ts` wires it after the workspace boot; `storage`, `boot()` and the global listeners stay in `main.ts`. `at.holds()` from the workspace session is still the only workspace check in the moved code.
- No visible change: sign-out still forgets the signed-in mark and the boot memory.
- `main.ts` 4249 → 4060 lines; `tests/main-ts-ceiling.test.ts` ceiling 4250 → 4060. `docs/agents/code-map.md` names the new module and its section ranges are re-measured.
- `kit size`: boot 345 KB (−1 KB), budget 355 KB. `npm run check`, `npm run lint`, `npm test` (5167 passing), `kit unit --affected`, `kit specs --affected` (13/13), `native-boot-memory`, `native-org-repositories` and `native-branch-menu` specs pass.
