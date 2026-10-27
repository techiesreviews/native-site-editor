---
title: Wait for the catalogue build release
type: task (HITL)
status: open
assignee:
blocked_by: []
---

## Question

Gate: closes when the atomic catalogue build is released to production (Lex said "ship it"; its version is recorded in `docs/NATIVE-PROJECT.md`). Nothing to decide; the sweeps start after it.

## Comments

- Lex (2026-10-27), Tuesday rules ([kitchen.md](../../../agents/kitchen.md#tuesday-review)): this gate now closes when the catalogue build's frontier is empty (built, on preview, waiting for his Tuesday end check), not at its release. The sweeps run on preview; the release still waits for his go-ahead.
