---
title: "native-add-card spec: page switch never happens (fails on plain dev)"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
---

## What

`tests/native-save/native-add-card.spec.ts`, "a card swapped before filling stays as
written after a page switch", fails on plain dev (found by ak-19, 2026-10-16): the switch
to another page never happens. It blocks `kit pr` for any change whose affected specs
include it.

- Reproduce on dev; find whether the test or the product is wrong (a renamed control,
  the Pages tab redesign of slice 125, a page picker change…) and fix it where it lives.
- No skip, no raised timeout, no known-failures entry unless proven environmental.

## Files

- `tests/native-save/native-add-card.spec.ts`
- product files only if the product is wrong (name them in the ticket before editing)

## Done when

- The spec passes 5/5 (`--repeat-each=5`) through `port.sh`.
- Sol review on the PR; merged into `dev` through `kit pr` with CI green.
