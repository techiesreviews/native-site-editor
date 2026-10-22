---
title: "Login, setup checklist, wizard and Get started leave main.ts"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [25-boot-and-snapshot]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Login and setup (`renderLogin` 99 lines, the setup checklist, `newDraftPaths` callers, about lines 3210–3439 at `89ac5e0e`) and the wizard, partial start and Get started (5165–5330) move into a setup module; the existing lazy loaders (`loadWizard`, `loadGetStarted`, `loadStartSite`, `loadChecklist`) stay lazy. About −395 lines.

## Decided behaviour

No visible change. Remembering the last site until sign-out stays ([ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22)).

## Files

- `src/main.ts` (the regions above), new `src/setup-host.ts` (name is the builder's), `src/controllers/setup-entry-controller.ts`, `src/controllers/setup-checklist-controller.ts`
- Tests: affected unit tests; setup, wizard and Get started specs through `kit specs --affected`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body; ports are live; lazy modules stay type-only imports.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-82 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/82-setup-and-login-out-of-main.md --builder sol`; `kit wait job slice-82 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.
