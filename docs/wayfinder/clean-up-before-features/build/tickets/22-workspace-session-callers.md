---
title: "Controllers, agent menu and media ask the session; guard test"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [21-workspace-session-main]
---

## Goal

Candidate #1, slice c (research 01 §1). The rest of the 66 guards and 58 predicates go: controllers, `agent-menu.ts`'s pinned-repository checks, media modules' own load counters, the agent tab checks. A guard test bans hand-written workspace checks outside the session.

## Decided behaviour

- [Ticket 05, item 6](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): one account rule. `save-publish-controller.ts` compares the repository one way (by id; by name only when no id is known).
- No other visible change.

## Files

- `src/controllers/{setup-entry,history,command-palette,media-usage,save-publish,boot}-controller.ts`, `src/setup-actions.ts`, `src/media-batch.ts`, `src/components/agent-menu.ts`, `src/controllers/agent-controller.ts`
- `src/agent-tools-edit.ts`, `src/agent-tools-read.ts`, `src/agent-tools-media.ts` (their repo/branch/commit compares)
- Media place modules with their own "still current?" predicates (`src/page-builder/media-*.ts`, as found)
- The agent owner's receiving-tab "generation" (`src/agent-owner.ts`, `src/agent-transport.ts`, `src/agent-records.ts`) is renamed `fence` (lead decision), so "generation" means one thing
- `tests/workspace-session-guard.test.ts` (new; TypeScript API like `tests/guarded-edit-reads.test.ts`): fails on a load-counter or scope compare, or a hand-written same-workspace compare, outside `src/workspace-session.ts`; allowlist entries carry file, function, reason and count
- Affected unit tests; `tests/guarded-edit-reads.test.ts` (its allowlist shrinks)

## Done when

- The guard test is green, with a broken fixture showing each rule fires.
- `guarded-edit-reads` allowlist entries for load epochs the session now covers are gone.
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-22 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/22-workspace-session-callers.md --builder claude-opus-5-5`; `kit wait job slice-22 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` (agent, media and save specs), `kit size` if `main.ts` imports change.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: guards and predicates left (count, each allowlisted with a reason), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling if changed.
