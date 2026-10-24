---
title: "One empty-parts rule, in step with the site's own loader"
type: task (AFK)
status: open
assignee: lead-60 (this session)
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
