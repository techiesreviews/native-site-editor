---
title: "Close-out: docs, budgets and the scores"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-kit-lighthouse, 11-kit-site-rules, 16-save-writes-components, 21-site-language, 24-ai-training-switch, 25-llms-txt, 26-structured-data, 27-pictures-first-screen, 30-cloudflare-headers, 31-github-pages-moved-pages, 32-not-found-page, 43-inbox-agent-items, 44-inbox-setup-checklist, 50-good-css-for-site-css, 51-monthly-rule-check, 62-score-parity, 65-site-health, 66-helper-lighthouse, 67-send-prompt-to-agent]
---

## Goal

Finish the build. Size: S.

## Decided behaviour

- Every budget in `lighthouse-budget.json` (Agents included) and every rule in `kit site-rules` that this build owns is enforced; nothing left as `todo`.
- `docs/agents/code-map.md`, `docs/mcp.md`, `docs/agents/agent-scripts.md#kit`, `CONTEXT.md` (Inbox, Site health, and any new term) are current.
- Close the backlog issue `docs/work/site-quality/issues/01-lighthouse-rules.md` with a pointer to this build.
- The parity check (slice 62) passes at release.
- Report the release-run scores (every page, phone and laptop, 5 runs) to Lex.

## Files

The docs above, `docs/work/site-quality/issues/01-lighthouse-rules.md`, the build's lead log.

## Done when

- `kit lighthouse` at release: every page within budget; the scores are in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-69 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-69 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
