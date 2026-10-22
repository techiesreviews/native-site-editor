---
title: "One \"is a file\" rule everywhere"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [40-page-address-and-component-rules]
---

## Goal

Candidate #3, slice b (research 01 §3). "X is a file, so nothing can go in it" is decided at 11 code sites, and path validity runs three times for an agent edit. One rule in slice 40's module answers both, with one wording.

## Decided behaviour

Research 01 §3 (listed so the wording change is no surprise; ticket 05 kept it): every place says it the same way, **"X is a file, so nothing can go in it."** Media's variant ("…cannot contain uploaded files") uses the same words. No other change.

## Files

- `shared/site-rules.ts` (from slice 40): `parentProblem(path, exists)`; `writablePathProblem` moves here from `shared/site-files.ts:233` or is re-exported
- Call sites: `src/main.ts` (3725, 3774, 4524 at `89ac5e0e`), `src/controllers/file-operation-checks.ts:56`, `src/native-page-moves.ts:131`, `shared/agent-edit.ts:120`, `src/setup-actions.ts:344`, `src/page-builder/media-workspace.ts` (421, 462, 545, 712), `src/page-builder/replace-everywhere.ts:154`
- Tests: `tests/site-rules.test.ts`, affected unit tests; `tests/main-ts-ceiling.test.ts`

## Acceptance checks

- A `grep` for the old wordings finds nothing outside `shared/site-rules.ts`.
- Unit tests cover a file in the way at each depth (direct parent, grandparent).
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Last slice of #3.

- `kit doctor`; `kit bg slice-41 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/41-is-a-file-rule.md --builder sol`; `kit wait job slice-41 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: sites replaced (count), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.
