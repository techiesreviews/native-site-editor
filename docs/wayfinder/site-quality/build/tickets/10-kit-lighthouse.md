---
title: "kit lighthouse: the scores as a kit check"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

A kit command that runs Lighthouse on a site made by the editor and fails when a score falls below Lex's bar ([ticket 04](../../tickets/04-grill-target-scores.md#resolution-2026-10-26); sketch in research 03, `git show origin/research/sq-03-lighthouse-today:docs/wayfinder/site-quality/research/03-lighthouse-today.md`, section "Sketch: `kit lighthouse`"). Size: M.

## Decided behaviour

- `kit lighthouse [--site new|starter|edited|DIR] [--pages …] [--form mobile,desktop] [--runs N] [--json FILE]`, on the Lighthouse Node API with one Playwright Chromium. Lighthouse is pinned (13.5.0 today, through `kit deps add`); Lighthouse CI is not used (still on Lighthouse 12).
- `--site new` (default) is `fixtures/actual-starter` passed through `prepareStarterFiles` (`shared/starting-point.ts`); `--site edited` runs the fixed edit scenario from research 03 through the real save path first.
- Runs hold one `port.sh` slot and run one at a time: a small static server with gzip on the base port, the browser's debugging port on base + 1.
- **Budgets** in `scripts/agents/lighthouse-budget.json`:
  - accessibility, best practices and SEO: 100 on every run;
  - performance: the middle score of 5 runs at 99 or more, on phone and laptop; the middle CLS ≤ 0.1 and LCP ≤ 2.5 s;
  - Agentic Browsing (shown in the editor as **Agents**): 100 on every run, like accessibility ([ticket 10 follow-up](../../tickets/10-grill-page-scores.md#follow-up-2026-10-26) replaced ticket 04's "watched, no target"). The category is experimental: if the pinned Lighthouse has no stable category id for it, or it only runs behind a flag, the slice decides how to call it, records that in `decide`, and pins the id in the budget file.
- **Enforced as the fixes land:** the budget file lists which categories are enforced. This slice enforces accessibility and best practices (100 today), and Agents if the new site scores 100 on it today; otherwise Agents prints `todo` and the slice names the failing audits for the lead. Slices 20 and 22 switch on SEO, slice 16 switches on performance. Until then those lines print as `todo (slice NN)`, never as a pass.
- One line per page and form, naming the top failing audit and its selector when it fails; `RESULT:` closing line; JSON reports in `.scratch/lighthouse/<stamp>/`.
- **Where it runs:**
  - `kit pr`, through a new "site" trigger in `scripts/agents/pr-tier.mjs` (paths: `fixtures/actual-starter/**`, `shared/starting-point.ts`, `src/page-builder/site-head.ts`, `src/native-settings.ts`, the site-output step from slice 12, the Add and insert code), 3 runs, about 75 s;
  - the weekly sweep (`docs/agents/routines/sweep.md` step 2): the new site, every page, plus the live test deploy, plus `npm view lighthouse version` against the pin;
  - release (`kit pr --release`): every page, phone and laptop, 5 runs, the edited page included.
- If run-to-run variation causes false failures, the slice that sees it reports it to the lead in `decide`; the bar is not lowered without Lex.

## Files

`scripts/agents/kit.d/lighthouse` (with its `# kit:` line), `scripts/agents/lighthouse.mjs`, `scripts/agents/lighthouse-budget.json`, `scripts/agents/pr-tier.mjs`, `docs/agents/routines/sweep.md`, `docs/agents/agent-scripts.md#kit`, `tests/kit-lighthouse.test.ts` (budget and middle-score logic on saved report fixtures).

## Done when

- `kit lighthouse` on today's new site passes accessibility and best practices, prints SEO and performance as `todo`, and prints Agents as a pass or `todo` with its failing audits.
- `tests/kit-lighthouse.test.ts` covers the middle of 5, the every-run rule, the enforced list and the failing-audit line.
- `kit pr` on a change to `shared/starting-point.ts` runs it; a change elsewhere does not.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
