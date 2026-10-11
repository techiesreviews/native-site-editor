---
title: "The two specs that fail under load pass reliably"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude ★
phase: 3
---

## What

Seen across this week's full runs, each passing on rerun:

- `native-canvas.spec.ts:382` (code-range drag): a 120 ms timing check measured 142 ms under load (slices 17, 32, 33).
- `native-branch-menu.spec.ts:40` (slices 23, 30); slice 17 could not reproduce it in 3 full runs + 5 repeats.
- Also seen once each: `native-store-history:75` (click timeout, slice 31), `native-org-repositories` (ECONNRESET, slice 19).

Find each cause. A timing threshold that measures the machine rather than the editor should check the behaviour (e.g. the drag lands in one frame/step) instead of wall-clock; a real race in the editor gets fixed in the editor. Don't just raise timeouts.

## Done when

- Each spec's cause is named in the Done note, with the fix.
- Each passes 10/10 with `--repeat-each=10` while another full suite runs alongside (load), and the full `native-save` suite, smoke and `@actual` are green.
