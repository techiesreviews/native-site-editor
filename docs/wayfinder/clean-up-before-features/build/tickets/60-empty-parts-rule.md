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
- The `<br>` allowance (`takesBreaks`, now given the element) excludes source-tree.ts's raw-text list (`RAW_TEXT`, now exported), `<plaintext>`, and SVG or MathML content. The parser's HTML integration points (`<foreignObject>`, SVG `<desc>`, MathML `<mi>`, `<mo>`, `<mn>`, `<ms>`, `<mtext>`) and the HTML inside them still take breaks.
- `tests/rules-empty-parts.test.ts`: parity cases run the starter's loader as shipped (`hideEmpty` and `isSection` from `fixtures/actual-starter/components/components.js`, the same code as the native-site-editor-starter project). They run over every component in `fixtures/actual-starter` and, as more templates, `fixtures/native-starter`, whose `components.js` is only a stub and hides nothing itself. Each component is tested bare, with each slot filled alone, with all slots filled, with white space only, with content for no slot, with blank fills, and with `&nbsp;` or U+00A0 as the page's own text. The rule as the runtime reads it, the editor's own `shownSlots` (what slot states and Detach hide, over nodes from another parse) and `slotStates` all match the loader. Three deliberately changed copies of `hideEmpty` each fail the cases. `tests/component-model.test.ts` gains the `<br>` cases, Detach cases (a later slot of a taken name, a page of `&nbsp;`) and slot states for a lone `&nbsp;`.
- No `main.ts` change. `kit size`: boot 353 KB (±0 KB, budget 355 KB); preview runtime 97,607 bytes minified (32 KB gzip, 16 sources).
- Validation: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok unit 2523/2523 (159 files)`; `npm test` 5441/5441; `npm run check` and `npm run lint` green. `kit specs --affected` (83 specs): 742 tests passed, none failed. The run hit the 20-minute tool limit as its last group started, and that group re-ran alone: `RESULT: ok specs 2/2 passed`.
- Commits: 6776d16e (the rule), 8c50e389 (review round 1), 88f65305 (review round 2), and this round's fixes.
- Review decisions (Claude review, `.scratch/reviews/lead-60/`):
  - Round 1: fixed the page side of blank text (`Instance.content`); added the `&nbsp;` parity pages and an injected-style case. Declined a runtime browser spec, as it is outside Files (follow-up below).
  - Round 2: added the Detach and lone-`&nbsp;` tests and documented `SlotState.filled`. Left four optional nits as they are: SVG `<title>` is never rendered, `annotation-xml` is rare, a shared first-slot helper and a sturdier loader extraction would only tidy.
  - Round 3: `takesBreaks` now takes breaks on an integration point itself; the parity test calls the production `shownSlots`; the `&nbsp;` beside a fill case is recorded. Declined: following each opened site's own loader, the runtime browser spec, and the slot switch's reading (all follow-ups below); sharing `namespaceFor` with native-operations.ts, which is outside Files.

### Follow-ups

- decide (Lex): "in the version opened" is not yet followed. The rule always follows the starter's loader as shipped. A site whose `components.js` hides nothing, or hides parts differently, still gets the starter's hiding in the preview, slot states and Detach. Choice: keep following the starter, or read the opened site's loader (for example, whether it defines `hideEmpty` or `[data-empty]`) and hide nothing when it doesn't.
- Validation gap: no browser spec covers the runtime's own wiring (`emptyRule`: `sectionLike` from `state.sectionTags`, placeholders mode, injected styles, the slot ghosts' `hidden`). Proposed in `tests/slot-ghosts/browser.spec.ts`: a section component with a repeated slot name, and a page of `&nbsp;`, in and out of placeholders mode.
- decide (Lex): on `<x-s>&nbsp;<span slot="b">…</span></x-s>`, the default slot reads `filled: true` while the site hides it, so its switch in the component's properties shows on ("Hide …"). Recommendation: the switch should follow what the site shows (off). That needs `SlotState.filled` to read `Instance.content`, and its users in components.ts and page-structure.ts checked.
- Spec (P3): cf9cee1d:src/page-builder/source-tree.ts:81 — P3: `RAW_TEXT` is now exported, which changes `source-tree.ts`. That file is not in the ticket's Files list (the f
- Spec (P3): cf9cee1d:src/page-builder/component-model.ts:219 — P3: `HTML_IN_FOREIGN` matches tag names in any namespace. The browser only treats these as HTML integration p
- Validation gaps (gap): `tests/component-model.test.ts`, in the "SVG, MathML and raw-text elements take no <br>" test: add `takesBreaks(first("<math><desc><span>x</span></desc></math>"
- Validation gaps (gap): `tests/rules-empty-parts.test.ts`: the three changed copies of `hideEmpty` are only compared against `runtimeMarks`. Add the same drift check against `editorMar
