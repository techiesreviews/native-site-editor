---
title: Settings for projects unlike the editor
type: task (AFK)
status: open
assignee: ke-14
builder: claude
blocked_by: [13-helpers-through-kit-home]
---

## Goal

The settings file can describe every chosen project, not only this editor: other landing branches, no npm, no lint, no CI, its own unit runner, no shared `node_modules`, work in the main checkout. Research 03 ("What the shared kit needs before these swaps") and research 02 ("Values the settings file needs that ticket 70 did not list") list what breaks today; [ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 3 sets the branch rules.

## Decided behaviour

- **Any command, or none:** `checks.check`, `checks.test`, `checks.lint` and `checks.extra` are plain shell commands (for example `python3 .checks/site.py`) or absent. `kit pr`, `kit slice` and the `kit fix` brief run only the ones set, and the review brief's "the author already ran …" line names exactly those (techies-playground's copy does this, `review-brief.mjs` lines 62–63 there).
- **Unit runner and file patterns:** `unit.run` with several `unit.files` patterns (`src/**/*.test.js`, `scripts/*.test.mjs`, `test/`); `kit unit --affected` uses the same patterns.
- **Standards files:** `standards` takes a list (`CODING_STANDARDS.md`, or `AGENTS.md` where a project has no standards file).
- **`kit doctor` steps fit the project:** `allowMainCheckout: true` lets it run in the main checkout (chat works there); no `sharedNodeModules` skips that step; `checks.doctor` adds the project's own doctor lines (Python present, a Chromium launch, Node version).
- **Browser tooling:** `playwright` names where Playwright comes from for a project without its own (`KIT_PLAYWRIGHT_MODULE` today in techies-reviews' copy).
- **`bash-guard`'s server hint** comes from settings (`servers`): it names `scripts/agents/port.sh` only where the project has one.
- **No CI, no remote:** with no workflows `kit pr` lands after review without waiting for checks and says so; with no GitHub remote `pr`, `wait ci` and `status` say "no GitHub repo" instead of failing.
- **A landing branch that moves by itself is normal.** On sites the editor saves to, its commits arrive on `main` between a branch's start and its PR; `kit pr` brings them in like any other merge and never flags them (ticket 05 point 3).
- `kit doctor` fetches before it judges branches (local clones are often behind GitHub, research 02).

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/fix`, `scripts/agents/kit.d/unit`, `scripts/agents/unit.sh`, `scripts/agents/kit.d/doctor`, `scripts/agents/kit.d/status`, `scripts/agents/kit.d/wait`
- `scripts/agents/review-brief.mjs`, `scripts/agents/hooks/bash-guard.sh`
- `tests/kit-pr.test.ts`, `tests/kit-unit.test.ts`, `tests/kit-doctor.test.ts`, `tests/kit-status.test.ts`, `tests/kit-review.test.ts`, `tests/agent-scripts.test.ts`, `tests/kit-settings.test.ts`
- `docs/agents/agent-scripts.md` (the settings keys)

## Done when

- Temp-repo tests with the minimal `techies-playground` settings from research 04 (land `main`, `checks.test` only, `node --test`) prove: `pr --dry-run` runs only `npm test`; the brief names only `npm test`; `unit --affected` picks `src/**/*.test.js`; `doctor` passes in the main checkout with `allowMainCheckout`; a repo with no remote gets "no GitHub repo" from `pr` and `status`; a landing branch that gained commits after the branch started lands without a flag.
- This editor's own runs are unchanged; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke14 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/14-settings-for-other-projects.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke14 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.
