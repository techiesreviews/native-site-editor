---
title: Decide whether the code panes keep JavaScript IntelliSense
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Should `.js` files keep TypeScript-powered completions and diagnostics in the code panes, or get syntax highlighting only? Dropping it removes ts.worker (6.9 MB raw, 1.45 MB gzip). That shrinks deploys and speeds up opening a JS file, but doesn't change boot (see the bundle research). What do native sites in this editor actually need from their browser JS?
