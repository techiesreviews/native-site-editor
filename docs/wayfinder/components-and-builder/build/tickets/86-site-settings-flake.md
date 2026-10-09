---
title: "Make native-site-settings.spec.ts:216 deterministic"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

From the suite fix (branch build/cb-fix-suite-1): `tests/native-save/native-site-settings.spec.ts:216` ("…preserve the focused Heading level control") fails 3–4 times in 10, and did so before this build (seen at 4ddae30). Suspected: a late edit-bar re-render replaces the control the test captured. Find the real cause; if it's the product (focus lost when the bar re-renders), fix the product; if it's the test, make it wait on observable state (no fixed sleeps, per docs/agents/guardrails.md). Add it to local-testing.md's flaky list only if it can't be fixed.

## Done when

- The test passes 20 times in a row (`--repeat-each=20`) and the cause is recorded in the Done note.

**Also (2026-10-09, from slices 74 and 84):** `tests/native-save/native-card-paths-starter.spec.ts:143` (`structureSlot: fields found`, @actual) fails about 1 in 8, a different variant each time. Same treatment: find the cause, fix product or test, 20 in a row.
