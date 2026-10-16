---
title: "Re-check tests/known-failures.json"
type: task (AFK)
status: closed
assignee: ak-23
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

## Done (2026-10-16)

Every entry was re-run on dev 846147f9 with `--repeat-each=5 --workers=1` through `scripts/agents/port.sh`, one at a time, in its own fixture group.

Dropped (all passed every run):

- `native-card-paths-starter.spec.ts:149` (`@actual`, run with `ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter`): 4 variants (light, light-narrow, dark, dark-narrow), 20/20.
- `native-cards.spec.ts:304` "overlapping card and section Add controls…": 5/5.
- `native-component-structure-host.spec.ts` (whole spec, default group): 11 tests, 55/55.
- `native-structure-compact.spec.ts:302` (was failing-on-dev): 2 variants, 10/10.
- `native-selector.spec.ts:249` "component CSS loads on demand…": 5/5.
- `native-canvas.spec.ts:203` "the code pane's cursor selects its element…": 5/5.

Kept: none. `tests/known-failures.json` is now `[]`.

Lead decision (2026-10-16): `tests/agent-suite-summary.test.ts` read two live entries (selector, structure-compact) as its examples, so emptying the registry would break it. `scripts/agents/suite-summary.mjs` now reads `ASE_KNOWN_FAILURES` (a registry path) in place of `tests/known-failures.json` when set. The test writes its own stand-in registry, plus a case with the variable unset (a failure in an unregistered file still exits 1 and counts no known failures). `docs/agents/agent-scripts.md` does not mention the variable yet (outside this ticket's files).

Tests: `npm run check`, `scripts/agents/unit.sh` (3496 pass), `npm run lint`.

Review (Sol, `.scratch/reviews/ak-23/`): fixed 2. The Done notes were missing (added here), and the gap of no test with the default registry (added). Rejected 0.
