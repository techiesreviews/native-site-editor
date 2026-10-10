---
title: "Source tree module: one interface, a page adapter and a source adapter (no card callers)"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (sections 4, 5, 8).

- `src/page-builder/source-tree.ts`: `SourceTree<N>` (`source`, `exact`, `view`, `at`, `path`, `children`, `elements`, `range`, `attribute`, `text`), `readSource(source, { page?, from?, to? })` and `plain(text)`. `parseSource`, `SourceNode`/`SourceElement`/`SourceText`, `sourceView` and `descendants` move here from `component-model.ts` (128-269), which re-exports them. Two named body changes: `parseSource` records an element closed by an ancestor's end tag, one left open and a dropped stray end tag (that is `exact`); `sourceView`/`text` keep raw text undecoded and read CR LF and lone CR as LF.
- `page: true` reads the page part (`nativePageBody`) with the preview's drops (`<script>`, refresh `<meta>`); `<template>` content is never children. `attribute` returns the span (as `startTagAttribute`) with the value decoded by `decodeHtmlEntities(value, true)`.
- `src/native-source-location.ts`: `readPage(source)` over `parseMarked` and the existing `parsedSource` LRU (ranges through `markedRange`, frozen; view `domView(() => false)`); `locateNativeElement*`, `elementPathAt`, `wrapperAround` unchanged.
- `rules/tree.ts`'s header names source-tree.ts as `sourceView`'s home. No card file changes.

## Done when

- `tests/source-tree.test.ts` (Node, source adapter) and `tests/source-tree-browser.test.ts` (Chromium in `npm test`, both adapters, the cards-controller harness) run one contract table: page part (with/without `<body>`, `</head>` only), dropped nodes, template content, comments, raw text, void/self-closing, CR LF and lone CR, text-only fragment, `exact` false for `<div><span>A</div>`/stray/unclosed, `<noscript>` and `<style>` text as the browser reads them, `at`/`path` round trip, `range` (implied end, same-named nesting), `attribute` (`&eacute;`, `&amp;`, numeric, legacy without `;`, unquoted, valueless, upper case), `view` under `hasHeadingSlot` and `itemKind`.
- Parity: every page of `fixtures/native-starter`, `native-cards` and `actual-starter`, element by element, page adapter vs `readSource(page, { page: true })` equal, with a listed set of expected differences (`<table><tr>` without `<tbody>`, `<p><div>`, `<li>` without `</li>`) that must stay different.
- `native-make-component*` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.

## Done (2026-10-10)

- `src/page-builder/source-tree.ts`: `SourceTree<N>`, `readSource` (source adapter), `plain`, `tagAttribute`; `parseSource`/`SourceNode`/`sourceView`/`descendants` moved from component-model.ts (re-exported). Named body changes: `parseSource` records `exact` (ancestor-closed, left open, stray end tag; nodes unchanged); `sourceView` text keeps raw text undecoded, reads CR LF/CR as LF and drops `<pre>`/`<textarea>`'s first newline (after decoding, so `&#10;` too). `exact` is also false for a tag cut off at the end; `readSource` gives raw text left open its text (parseSource does not). `readPage` (page adapter) in native-source-location.ts over the existing LRU, one frozen tree per cached parse. No card file changed.
- Ranges in both adapters follow `elementEnd`'s rule (as `markedRange`), so a last child inside a same-named parent (`<div><div>…</div></div>`) has no range in either; the parity suite pins this.
- Tests: `tests/source-tree.test.ts` (30: 23 contract cases + 7 Node-only), `tests/source-tree-browser.test.ts` (23 contract cases on both adapters, parity on all 31 fixture HTML files, 3 repaired pages with their listed outlines, detached nodes). Smoke and `native-make-component*` green (full suite not run: parseSource's nodes are unchanged); budget +31 B gzip total.
