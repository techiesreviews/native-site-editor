---
title: "Page Structure: typing in a component's template survives a change to the page file"
type: task (AFK)
status: open
assignee: lead-97 (this session)
builder: claude
blocked_by: [90-page-structure-typing-flicker]
---

## Goal

Follow-up from slice 90 (PR #120). Lex decided on 2026-10-22: typing in a component's template in Page Structure (Edit component mode) carries on undisturbed when the page file changes meanwhile (for example an agent saves it), the same as typing elsewhere in Page Structure since slice 90. Today the edit ends and a test records that.

## Decided behaviour

- While Lex types in a template field, a change to the page file (or any file other than the template being edited) does not end the edit, redraw the field, or move the caret; the tree catches up when he leaves the field.
- A change to the template file itself still follows slice 90's rule for the field's own file.
- Also fix slice 90's remaining P2: with nothing selected while a change is held, clicking an element only the held version has ends the edit at once (today the row is marked only on leaving the field).

## Files

Find them from slice 90's change (`git show efb1458 --stat`): `src/components/page-structure.ts`, `src/components/structure-editing.ts`, `src/controllers/page-structure-controller.ts`, the Edit component mode module, and their tests (`tests/structure-editing.test.ts`, `tests/page-structure-hold.test.ts`, `tests/native-save/native-structure-inplace.spec.ts`, and the test that records today's behaviour, which changes). Stay out of `src/main.ts` unless unavoidable (then set its ceiling per the README).

## Done when

- A browser spec types in a component template field, changes the page file meanwhile, and shows the text and caret unchanged until leaving the field; it fails on dev before the fix.
- The held-version click case has a test.
- `scripts/agents/kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-97 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-97 --timeout 2h`.
