---
title: "Page Structure: typing no longer flickers"
type: task (AFK)
status: open
assignee:
builder: sol
blocked_by: []
---

## Goal

[TD 10](../../../../work/tech-debt/issues/10-preload-and-structure-limits.md): while Lex types in a Page Structure field, a change to another file at that moment repaints the tree and the typed text flickers for an instant (nothing is lost). `holdsPaint` (`src/components/structure-editing.ts:431–435`) holds a paint only when the painted source is exactly the one the field's typing made.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **Page Structure typing flicker: fix it.** While a field has focus and is being typed in, a paint caused by any other change keeps that field, its text and its caret as they are; the rest of the tree may update. When focus leaves, the latest paint is drawn.

Rides along (TD 10, lead decision): two edit-bar suggestions with the same title focus their own field, not the first (`focus()` at `structure-editing.ts:441–447` matches by id prefix).

## Files

- `src/components/structure-editing.ts`, `src/components/page-structure.ts` (only if the paint must keep one row), `src/controllers/page-structure-controller.ts` (only if it decides the hold)
- Tests: unit tests for the hold decision; `tests/native-save/native-structure-inplace.spec.ts` (type in a field while another file changes through a held agent or code-pane write: the field's text and caret do not change; after blur the tree shows the other change)

## Acceptance checks

- The spec above fails on `dev` and passes after the fix.
- No `main.ts` change. `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Use `mattpocock-skills:diagnosing-bugs` to reproduce first.

- `kit doctor`; `kit bg slice-90 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/90-page-structure-typing-flicker.md --builder sol`; `kit wait job slice-90 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-structure-inplace.spec.ts native-page-structure.spec.ts`.
- `kit shots structure` only if anything visible changed (it should not).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: the reproduction (failing on `dev`), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
