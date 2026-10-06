---
title: Decide how main.ts is split
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-what-usable-means-before-monaco, 07-what-is-left-after-removals]
---

## Question

`src/main.ts` is a 9.3k-line controller with about 110 module-level `let`s and about 335 functions. What does it become?
- Which feature modules does it split into?
- How do they share state: one explicit app-state object, a small store, or per-feature controllers with injected dependencies?
- How is boot orchestrated so the split also serves the lazy-loading plan from the "usable before Monaco" decision?
- When does the split land relative to the removals, and how is it done incrementally without breaking the browser suites?

## Resolution (2026-10-06)

Decided with Lex.

1. `main.ts` splits into feature controllers along its existing section banners: boot (session, repository loading), preview bridge and selection, pages tab (file operations, URL changes, moves, drag), structure and shared sections, cards, multi-file undoable operations, save/publish; loaded on demand: code panes, agents, setup wizard and checklist. `main.ts` shrinks to wiring (under about 500 lines).
2. Shared state moves into a small reactive store built on `@preact/signals-core` (about 1.6 KB gzip): signals for repository, branch, snapshot, selection, open file and the draft store from ticket 03; controllers read signals and react through `effect`/`computed`, and `batch` groups multi-signal updates.
3. Boot is orchestrated by the boot controller: it runs the critical path (ticket 05) and starts the on-demand controllers by dynamic import on first use or idle, which is how Monaco and the lazy panels from ticket 06 stay off the boot path.
4. The split lands after the removals (ticket 07), one module per PR. The lazy features (agents, setup, code panes) are extracted first for the bundle win, then the rest. Every PR passes `check`, unit tests, `@smoke` and the byte budget.
