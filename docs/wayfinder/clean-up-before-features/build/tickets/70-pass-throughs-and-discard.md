---
title: "Last pass-throughs go; Discard asks only when it can act"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: [60-empty-parts-rule, 31-native-site-runtime]
---

## Goal

Candidate #8 (research 01 §8) and the `discardFile()` follow-up (research 02).

- `src/controllers/cards-controller.ts` (37 lines) only forwards to `createCards`; it goes, and `main.ts` calls `createCards(ports)` directly.
- One-line forwarders left in `main.ts` (`updatePreview`, `nativeEditableSource`, `openExplorer`) go, unless slice 31 or 53 already removed them.
- `discardFile()` (`src/controllers/save-publish-controller.ts:240–247`) asks "Discard the changes to …?" with no signed-in user, then does nothing.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **`discardFile()` stops asking when it can do nothing**: with no user scope it returns before the question. No user can reach that state today, so nothing visible changes.

## Files

- `src/controllers/cards-controller.ts` (deleted), `tests/cards-controller.test.ts` (its cases move to the `createCards` tests or are dropped as duplicates; say which)
- `src/main.ts` (the forwarders, the cards wiring)
- `src/controllers/save-publish-controller.ts`, `tests/save-publish-controller.test.ts` (a case: no scope plus a change asks nothing)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Acceptance checks

- The deletion test holds: no complexity reappears in `main.ts` beyond the direct call.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Free-model candidate once T3 lists a verified zero-cost model; until then Sol.

- `kit doctor`; `kit bg slice-70 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/70-pass-throughs-and-discard.md --builder sol`; `kit wait job slice-70 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and new ceiling.
