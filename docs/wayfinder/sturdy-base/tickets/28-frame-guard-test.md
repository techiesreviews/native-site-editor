---
title: "Guard test: only the preview link talks to the frame; no copied rule sets"
type: task (AFK)
status: open
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
