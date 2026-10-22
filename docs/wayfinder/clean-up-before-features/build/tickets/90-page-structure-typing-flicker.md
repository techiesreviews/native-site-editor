---
title: "Page Structure: typing no longer flickers"
type: task (AFK)
status: closed
assignee: runner-90
builder: sol
blocked_by: []
landed: "PR #120 (efb1458)"
---

## Goal

[TD 10](../../../../work/tech-debt/issues/10-preload-and-structure-limits.md): while Lex types in a Page Structure field, a change to another file at that moment repaints the tree and the typed text flickers for an instant (nothing is lost). `holdsPaint` (`src/components/structure-editing.ts:431–435`) holds a paint only when the painted source is exactly the one the field's typing made.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **Page Structure typing flicker: fix it.** While a field has focus and is being typed in, a paint caused by any other change keeps that field, its text and its caret as they are; the rest of the tree may update. When focus leaves, the latest paint is drawn.

Rides along (TD 10, lead decision): two edit-bar suggestions with the same title focus their own field, not the first (`focus()` at `structure-editing.ts:441–447` matches by id prefix).

## Files

- `src/components/structure-editing.ts`, `src/components/page-structure.ts` (only if the paint must keep one row), `src/controllers/page-structure-controller.ts` (only if it decides the hold)
- Tests: unit tests for the hold decision; `tests/native-save/native-structure-inplace.spec.ts` (type in a field while another file changes through a held agent or code-pane write: the field's text and caret do not change; after blur the tree shows the other change)

## Done when

- The spec above fails on `dev` and passes after the fix.
- No `main.ts` change. `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Use `mattpocock-skills:diagnosing-bugs` to reproduce first.

- `kit doctor`; `kit bg slice-90 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/90-page-structure-typing-flicker.md --builder sol`; `kit wait job slice-90 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-structure-inplace.spec.ts native-page-structure.spec.ts`.
- `kit shots structure` only if anything visible changed (it should not).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: the reproduction (failing on `dev`), unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

**Behaviour.** While a Page Structure field has focus inside an open edit, every paint of the same page is held: another file's change (agent or code pane) no longer repaints the field, so its text and caret stay put, before and after the typing's own write. On blur the latest held tree is drawn, and folds, the selection and a selection reported ahead follow their elements from the tree that was on screen. Two edit-bar suggestions with the same title focus their own row's field (`focus()` filters by row, not only the id prefix). Not covered (current behaviour, kept from `dev`, open for a lead decision; see Follow-ups): typing in a template part in Edit component mode still ends the edit and the mode when the page file changes, because that session watches the page. No `main.ts` change.

**Commits.** b90dc8b9 (fix, built by GPT-6.1 Sol), a211e464, 2a79f1d5, 2a05844c (review fix rounds 1–3, Claude Opus 5.5); SHAs as rebased onto `dev` a982faeb.

**Tests.** New unit tests in `tests/structure-editing.test.ts` (hold decision, row-filtered focus) and `tests/page-structure-hold.test.ts` (folds and selection after a held paint). `tests/native-save/native-structure-inplace.spec.ts` gains "another file's paint keeps the typing field connected…" (fails on `dev` source: `not.toHaveAttribute` on `data-detached`; passes after the fix) and "an agent's page edit while a template part is typed ends the edit and the mode…". `kit unit --affected` 27/27; `kit specs native-structure-inplace.spec.ts native-page-structure.spec.ts` 2/2 (15 tests).

**Review.** Claude Opus 5.5 via `kit review` (Sol out of quota until 2026-10-27; Lex chose another model). Round 1 fixed the P2 that held paints skipped the row-follow and ahead-selection steps; rounds 2–3 fixed mixed-numbering selection during a hold and added the latest-paint and held-ahead checks. Declined: a same-title browser spec (each card's field already has its own prefix, so it would pass on `dev`; the unit test covers the row filter); keeping Edit component mode through a page change (outside Files, needs a lead decision). Evidence: main root `.scratch/reviews/runner-90/` (20261022T085936Z, 093204Z, 094337Z, 102014Z, 104830Z).

### Follow-ups

- Lead decision: should typing in a template part (Edit component mode) survive a change to the page file? Today the edit and the mode end (`src/page-builder/components.ts` session `watch`); the spec "an agent's page edit while a template part is typed ends the edit and the mode…" records that current behaviour. Keeping it needs a change outside this ticket's Files.
- P2 (`src/components/page-structure.ts`, `select()`): with nothing selected and a paint held, choosing an element only the held paint has hits `undefined === undefined` and returns before the edit-ending check; the edit carries on and the row is marked on blur. Suggested guard: `if (id === selected && !selectedAhead && !waits) return;` plus a unit test in `tests/page-structure-hold.test.ts`.
- Tests: the stale-during-hold path (folds follow from the drawn tree), `render()`/`refresh()` during a hold, and a code-pane variant of the held-paint spec.
- Spec (P2): 2a05844c:src/components/page-structure.ts:1353 — P2: This line is a regression. While a paint is held, `select()` maps the chosen element into the numbering of 
- Validation gaps (gap): The early return above: add a case to `tests/page-structure-hold.test.ts`. Clear the selection while a heading edit is open (e.g. set `selected` through `select
- Validation gaps (gap): Code-pane variant: the ticket's Files section asks for "a held agent or code-pane write", but only the agent variant was added. The code-pane variant can't be t
- Validation gaps (gap): Suggestion list taking focus: a paint can be held while focus moves into a `.field-suggestions` list. In that case `structure-editing.ts:316` keeps the edit ope
- Validation gaps (gap): `refresh()` during a hold: add a unit test in `tests/page-structure-hold.test.ts` that calls `sidebar.refresh()` while a paint with added rows is held. Assert f
