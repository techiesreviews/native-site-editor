---
title: Measure the starter today and find how Lighthouse fits the kit
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Run Lighthouse (mobile and desktop) on the starter site (`~/Projects/native-site-editor-starter`, served statically) and on one page edited in the editor. Record the scores and every failing audit, with its cause in the starter or the editor's output.

Then find how a Lighthouse run fits the kit without a browser farm:

- Lighthouse CLI or its Node API with the existing Playwright Chromium;
- run time and flakiness;
- score budgets;
- when it runs (`kit pr` for starter or template changes, a weekly sweep, before release).

The kit lives in `scripts/agents/kit`; see `docs/agents/agent-scripts.md`.
