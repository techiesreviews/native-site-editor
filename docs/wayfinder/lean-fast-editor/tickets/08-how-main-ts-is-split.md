---
title: Decide how main.ts is split
type: grilling (HITL)
status: open
assignee:
blocked_by: [03-what-usable-means-before-monaco, 07-what-is-left-after-removals]
---

## Question

`src/main.ts` is a 9.3k-line controller with about 110 module-level `let`s and about 335 functions. What does it become?
- Which feature modules does it split into?
- How do they share state: one explicit app-state object, a small store, or per-feature controllers with injected dependencies?
- How is boot orchestrated so the split also serves the lazy-loading plan from the "usable before Monaco" decision?
- When does the split land relative to the removals, and how is it done incrementally without breaking the browser suites?
