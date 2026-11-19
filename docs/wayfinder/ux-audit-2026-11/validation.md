# Validation evidence

## Red checks

`kit unit docs/wayfinder/ux-audit-2026-11/prototypes.test.ts` first returned `pass 0, fail 12`: each standalone page and the index were absent. All twelve assertions existed before the HTML was generated.

## Scope

Eleven self-contained HTML pages and an index. Each task has one commit. No editor source, dependencies, configuration, old checkout or chat workspace files were changed. Tests and reports live under this task folder. The temporary page-generation helper is removed before handover; opening the HTML needs no generator.

## Kit commands

- `RESULT: ok doctor 11/11 checks passed`
- `RESULT: ok rulebook shared and docs/agents/kitchen-extras.md`
- `RESULT: fail unit 0/12 (1 files)` — expected red run before implementation.
- `RESULT: ok ux nothing visible touched` — prototype docs have no editor feature mapping; no UX verdict is claimed.
- `RESULT: fail shots 0 files, 1 failed, 0 layout findings, contact none` — `Scenario file must live under .scratch/`; the task restricts authored files to this folder. No scenario was placed outside it.
- `RESULT: ok unit none affected` — no application unit file is affected by prototype docs.

Focused browser check, lint, independent review and PR results are appended after completion. Resource-gated browser checks use the normal port launcher without changing its thresholds.
