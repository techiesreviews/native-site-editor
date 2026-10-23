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

- `loadRepositories`, `repositoryOptions`, `refreshRepositoryList`, `switchAccount` and `disconnect` moved into the new `src/repository-list.ts` (`createRepositoryList`). `main.ts` wires it after the workspace boot; `storage`, `boot()` and the global listeners stay in `main.ts`. `at.holds()` from the workspace session is still the only workspace check in the moved code.
- The bodies are the old ones with `ports.` for host state, plus one renamed read: `info.user` is now `ports.user`, backed by `info?.user` (the same once the session is adopted, as it always is when these run). `chooseRepository` is its own port, so the call reads `ports.chooseRepository(plan.resume)`.
- `tests/repository-list.test.ts`: sign-out after the last account (both marks forgotten), with another account left (boot memory only) and refused (error, no navigation); a refreshed list that keeps the open repository (announcement, selection kept) and one that drops it (listed again from the new list, no second read); a listing superseded during its read writes nothing (await race); account switch accepted (home) and refused (the server's reason, no navigation); the listing opens the remembered repository where it was left (through `ports.user`, the file selection counter written through the host), and before the session has a user offers the choice of a project; no repositories shows Get started, or the Setup wizard for a new user. A failed listing (and one overtaken by a later load), an invalid or unavailable workspace link, an interrupted wizard's site (kept or forgotten), and a refresh that fails, is recovered by the boot, is unchanged, or has no repository open.
- No visible change: sign-out still forgets the signed-in mark and the boot memory.
- `main.ts` 4249 → 4060 lines (−189 against the estimated −270: the port block, `storage` and the listeners stay); `tests/main-ts-ceiling.test.ts` ceiling 4250 → 4060. `docs/agents/code-map.md` names the new module and its section ranges are re-measured.
- `kit size`: boot 345 KB (−1 KB), budget 355 KB. `npm run check`, `npm run lint`, `npm test` (5167 passing), `kit unit --affected`, `tests/repository-list.test.ts` (22), `kit specs --affected` (13/13), `native-boot-memory`, `native-org-repositories` and `native-branch-menu` specs pass.
- Commits: f9b138e9 (the move), 95f5adbf (review fixes round 1), 98ef1b57 (round 2); the round 3 fix commit follows them.
- Review decisions (main root `.scratch/reviews/lead-83/`, 20261023T114952Z, 20261023T120951Z, 20261023T122648Z):
  - Round 1 fixed: `chooseRepository` became its own port, and the `info.user` → `ports.user` read is named above; `tests/repository-list.test.ts` added (sign-out, refresh, listing race). Taken nit: the shortfall against −270 lines is explained.
  - Round 1 declined: closing the ticket before review (the builder closes under `kit slice`, runner.md › Review and close); passing `setup` once instead of its members (the bodies would read `ports.setup.x`, against "A moved function keeps its body").
  - Round 2 fixed: tests for account switching, the remembered repository through `ports.user` and the host's file selection counter, no user yet, and the empty list. Taken nit: separate `content` and `files` fakes.
  - Round 3 fixed: this list of review decisions; tests for the failed listing, the link plans, the interrupted wizard and the remaining refresh branches. Taken nit: the getter-block comment in `src/repository-list.ts` covers the whole block.
