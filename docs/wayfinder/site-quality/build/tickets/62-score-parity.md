---
title: "Page scores: the kit keeps them in step with Lighthouse"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-kit-lighthouse, 60-score-engine]
---

## Goal

A kit check that compares the editor's scores with real Lighthouse and fails when they drift apart, so each Lighthouse update shows what has to change ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- `kit lighthouse --parity` runs the editor's engine (headless, through the same Playwright Chromium) and real Lighthouse on the same pages of the fixture sites (new, edited, and a broken fixture with one failure in every category), and compares them per category and per finding.
- **Gap (proposed; the slice confirms it with measurements, and widening it later needs Lex):** accessibility, best practices and SEO must be equal, with the same failing audits; speed within 3 points.
- Runs in `kit pr` when `shared/site-score/`, `src/site-score/` or the Lighthouse or axe-core pin changes; in the weekly sweep; at release.
- **Lighthouse updates:** the monthly check (slice 51) proposes the new version; the slice that bumps the pin runs the parity check, and its differences are the work list. axe-core moves with Lighthouse's pin, never on its own.

## Files

Expected: `scripts/agents/lighthouse.mjs` (parity mode), `scripts/agents/kit.d/lighthouse`, `tests/kit-lighthouse-parity.test.ts`, `docs/agents/agent-scripts.md#kit`.

## Done when

- The parity check passes on the fixtures; an engine copy with one audit weight changed fails it by audit name.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-62 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-62 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
