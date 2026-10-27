---
title: Boot back under 355 KB after the clean-up
status: ready-for-agent
assignee:
blocked_by: []
---

# Boot back under 355 KB after the clean-up

## What

Lex decided on 2026-10-25 to raise the boot budget (`scripts/agents/project.d/size`, `tests/perf/byte-budget.ts`) from 355 KB to 362 KB for the clean-up: splitting `src/main.ts` into modules (clean-up slices 86–89) adds about 2 KB of port wiring per slice, and slice 86 measured 356 KB (364,582 bytes against 363,520). The budget was raised on the condition that it comes back down.

## Fix

After the clean-up lands, load the page-builder parts that never run before the first paint when first used (Page Structure row menus, row moves and drags, URL planning, the rail's pick and drop, the preview's right-click menu), keeping each one's session stamp from when it starts. Slice 86's Done notes list what was measured. Then lower the budget back to 355 KB in the kit, the perf test, `tests/kit-size.test.ts` and the agent docs.

## Done when

- `kit size` at or under 355 KB with the budget back at 355 KB.
- No visible change, apart from what Lex accepts for a first use.
