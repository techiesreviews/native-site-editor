---
title: "One empty-parts rule, in step with the site's own loader"
type: task (AFK)
status: closed
assignee: lead-60
builder: sol
blocked_by: [52-agents-wait-for-lex]
---

## Goal

Candidate #6 (research 01 §6). "Hide an empty optional part" is written three times: the preview runtime (`applyEmptyRules`, `src/components/native-preview-runtime.js:2630–2672`), the editor's source reading (`shownSlots`, `src/page-builder/component-model.ts:500–530`) and the starter's own loader (`hideEmpty`; stays a copy per ADR 0001). The first two become one rule in `src/page-builder/rules/` over `RuleView`, bundled into the runtime like the card and item rules.

## Decided behaviour

[Ticket 05, item 5](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22): **empty optional parts behave exactly as the site's own code does, in the version opened**; the editor applies no rule of its own. A parity test runs the starter's `hideEmpty` on the fixtures against the rule, so the two cannot drift.

Rides along ([TD 10](../../../../work/tech-debt/issues/10-preload-and-structure-limits.md), lead decision): the `<br>` allowance (`takesBreaks`, `component-model.ts:227`) excludes SVG, MathML and the obsolete raw-text elements (`xmp`, `iframe`, `noembed`, `noframes`, `plaintext`), using `source-tree.ts`'s list.

## Files

- New `src/page-builder/rules/empty-parts.ts`, `tests/rules-empty-parts.test.ts` (with the parity cases over `fixtures/native-starter`)
- `src/components/native-preview-runtime.js`, `src/page-builder/component-model.ts`
- `tests/component-model.test.ts` (`<br>` cases)

## Done when

- Parity test green on every fixture component; a deliberately changed copy fails it.
- No `main.ts` change; the runtime bundle size reported (`kit size`).
- `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts when #4 (50–52) is merged, on preview and checked; may run beside 53.

- `kit doctor`; `kit bg slice-60 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/60-empty-parts-rule.md --builder sol`; `kit wait job slice-60 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA.

## Done (2026-10-25)

- One rule for empty optional parts, `src/page-builder/rules/empty-parts.ts` (`emptyParts`, `isContent`), over `RuleView`. The preview runtime (`applyEmptyRules`, the slot ghosts) and the editor's source reading (`shownSlots` in `component-model.ts`, so slot states and Detach) both call it; the runtime's own copies (`slotHasContent`, `slotConditionUnmet`, `fillsAnySlot`, `ownText`) are gone. It reads as the site's loader does: a later slot of a taken name is never filled (so it hides in a filled section), and blank text is `trim()`'s (U+00A0 is blank), in the template and in what the page gives an instance (`Instance.content`, so `<section-x>&nbsp;</section-x>` shows every fallback in slot states and Detach). The editor's placeholders mode still shows every fallback.
- The `<br>` allowance (`takesBreaks`, now given the element) excludes source-tree.ts's raw-text list (`RAW_TEXT`, now exported), `<plaintext>`, and SVG or MathML content; HTML inside a `<foreignObject>` still takes breaks.
- `tests/rules-empty-parts.test.ts`: parity cases run the starter loader's own `hideEmpty` and `isSection` (`fixtures/actual-starter/components/components.js`) on every component in `fixtures/native-starter` and `fixtures/actual-starter`. Each component is tested bare, with each slot filled alone, with all slots filled, with white space only, with content for no slot, with blank fills, and with `&nbsp;` or U+00A0 as the page's own text. The rule as the runtime reads it, the rule as the editor reads it, and `slotStates` all match the loader. Three deliberately changed copies of `hideEmpty` each fail the cases. `tests/component-model.test.ts` gains the `<br>` cases.
- No `main.ts` change. `kit size`: boot 353 KB (±0 KB, budget 355 KB); preview runtime 97,607 bytes minified (32 KB gzip, 16 sources).
- Validation: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok unit 2523/2523 (159 files)`; `npm test` 5441/5441; `npm run check` and `npm run lint` green. `kit specs --affected` (83 specs): 742 tests passed, none failed. The run hit the 20-minute tool limit as its last group started, and that group re-ran alone: `RESULT: ok specs 2/2 passed`.
