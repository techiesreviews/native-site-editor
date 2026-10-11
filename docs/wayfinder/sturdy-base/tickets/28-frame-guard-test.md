---
title: "Guard test: only the preview link talks to the frame; no copied rule sets"
type: task (AFK)
status: closed
assignee:
blocked_by: [21-rule-cards-and-items-slot, 22-rule-item-kinds, 23-rule-movable-block, 24-rule-text-level-tags, 27-runtime-wire-and-listeners]
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md. Does not need sturdy slice 10. A unit test (TypeScript compiler API for `src/**/*.ts`, text for the runtime) that fails when:

- anything outside `preview-link.ts` calls `.contentWindow…postMessage` on the preview frame or listens for `astro-native-preview` messages;
- a `Set`/array/regex literal of three or more of `article li div figure a blockquote dd`, or of `strong em b i u s span`, or a `dropCard`/`hasHeadingSlot`-shaped heading-slot walk, appears outside `src/page-builder/rules/`;
- with an allowlist (file + reason) for lists that mean something else.

## Done when

- `tests/frame-guard.test.ts` green on dev, with a deliberately broken fixture showing each rule fires.
- `npm run check`, `npm test` green.

## Done (2026-10-11)

- `tests/frame-guard.test.ts` parses `src/` and `shared/` (TS and JS, the runtime included) with the TypeScript 6 API and fails on: any `postMessage` read or `"message"` listener outside preview-link.ts, the wire source names outside preview-wire.ts, `FRAME_SOURCE`/`HOST_SOURCE`/`readFrameMessage` imports outside the protocol, link and runtime, an array/object/regex/selector-string literal with three or more of the item or inline tags outside `src/page-builder/rules/`, and `dropCard`/`hasHeadingSlot`-named or -shaped heading-slot walks there. The allowlist (file, match, reason, exact count) fails when an entry stops matching; channels to the image worker and between tabs, the runtime's own side, and 11 lists or walks with other meanings are on it.
- The guard found two copies, moved: the template's block parts (block-insert, tree-drop, the runtime twice) are `rules/template-blocks.ts` `TEMPLATE_BLOCK_TAGS`; main.ts's `nativeTextTags` is `rules/text-level.ts` `TEXT_LINE_TAGS`, from which `TEXT_TAGS` is built. No behaviour change.
- Built by Sol, src moves and review fixes by Claude; reviewed by Sol (casts, bound methods and `as const` literals now caught, allowlist counts exact; split-helper heading walks left to the name rule). Unit 1,900/1,900; full native-save 877 passed, 56 skipped; smoke 42/42; @actual 54/54.
