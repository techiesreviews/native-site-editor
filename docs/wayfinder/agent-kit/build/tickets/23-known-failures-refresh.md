---
title: "Re-check tests/known-failures.json"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude
---

## What

- Run each listed spec/test (right fixture group, `--repeat-each=5`, through `port.sh`) on current dev. Drop entries that pass 5/5; keep the rest with today's date in `since`/a refreshed note and the observed pass rate.

## Files

- `tests/known-failures.json`
- `tests/agent-suite-summary.test.ts` (lead decision 2026-10-16: stand-in registry)
- `scripts/agents/suite-summary.mjs` (lead decision 2026-10-16: `ASE_KNOWN_FAILURES` override)

## Done when

- Every entry re-checked; Done notes list dropped and kept entries with pass rates.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
