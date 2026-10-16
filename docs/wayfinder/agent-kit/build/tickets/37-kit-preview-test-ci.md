---
title: "kit preview test: old-bundle case needs room for two polls on CI"
type: task (AFK)
status: closed
assignee: ak-37 (lead)
blocked_by: []
builder: claude
---

## What

Dev CI on 8a0b046 (2026-10-16) failed `tests/kit-preview.test.ts` "an old live bundle fails within the
verification deadline and names both bundles"; it passes locally. The fixture's 300 ms verification
deadline can be used up by the first request on a slow runner, so the test's `requests >= 2` fails.
Give that case the 1.5 s budget the multiple-bundles case already uses; it still asserts the run ends
within 5 s.

## Files

- `tests/kit-preview.test.ts`

## Done when

- The file passes locally; CI green on the merge; Sol review on the PR.

## Done (2026-10-16)

- The old-bundle case passes `KIT_PREVIEW_VERIFY_MS=1500`; local runs 3/3 green. Merged through `kit pr`.
