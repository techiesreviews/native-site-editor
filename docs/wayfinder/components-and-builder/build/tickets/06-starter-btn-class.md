---
title: "Starter: add the .btn class"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Repository: `~/Projects/native-site-editor-starter` (see the [spec](../spec.md) flow for starter slices and open point 1).

The builder writes only `flow`, `cards` and `btn` ([10](../../tickets/10-block-set.md) §3); the starter has the first two and gains `.btn`.

- A `.btn` rule in the shared CSS (`styles/`), from the design tokens, readable in light and dark.
- Existing button-looking links may switch to `.btn` only where their look stays the same.
- `AGENTS.md` lists `.btn` among the shared classes.

## Done when

- `<a class="btn" href="#">Button</a>` inside a `<section class="flow">` looks like a button in light and dark.
- One commit in the starter repo; a screenshot.
