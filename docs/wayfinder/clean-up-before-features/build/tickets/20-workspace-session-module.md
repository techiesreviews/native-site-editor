---
title: "Workspace session module, memory adapter and suite (no callers)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Candidate #1, slice a (Strong; research 01 §1). Build the one owner of "is the editor still on the same workspace and load as when this work began?", with no callers yet. Today: 66 generation guards in 6 files, 58 hand-written "still current?" predicates, three spellings of scope (`draftScope`, `setupScope`, `mediaIdentity`) and six same-workspace comparisons that differ.

## Decided behaviour

- [Ticket 05, item 6](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **one account rule, in the session.** GitHub logins compare ignoring capitals ("Lex" and "lex" are one account). **A local-folder project is a separate workspace kind with no account name**; the session tells the two kinds apart, so folders slot in later without a second rule.
- No user-visible change in this slice.

## Shape (lead's design, from research 01)

`src/workspace-session.ts` owns the load counter, the scope (kind; for GitHub: account, repository id and name, branch, version view) and one `same(a, b)`. Interface: `current()`; `begin()` → a stamp with `holds()` and `changed()` (the guarded edit's `Stamp` becomes, or wraps, this stamp); `next(scope)` to start a new load; derived keys for drafts, setup and media. Nothing else. A memory adapter for tests. Add "Workspace session" to `CONTEXT.md` (user-facing text keeps "project").

## Files

- `src/workspace-session.ts` (new), `tests/workspace-session.test.ts` (new), `tests/fakes/memory-workspace.ts` (optional session field)
- `CONTEXT.md` (one entry), `docs/agents/code-map.md` (one entry)

## Acceptance checks

- The suite covers: one account with different capitals; same repository name with a different id (a re-created repository) and the reverse (a renamed one); empty branch; version view; GitHub and local-folder kinds never equal; a stamp's `holds()` is false after `next()`; derived keys equal for `same` scopes.
- Not imported by `src/main.ts` yet (no boot bytes).
- `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-20 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/20-workspace-session-module.md --builder claude-opus-5-5`; `kit wait job slice-20 --timeout 2h`.
- `kit unit tests/workspace-session.test.ts`, then `kit unit --affected`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only), plus the lead's read of the interface. Land: `kit pr --ticket <this ticket>`.
- Report: unit `RESULT:` lines, the interface as landed (one line per member), review folder and decisions, PR and merge SHA.
