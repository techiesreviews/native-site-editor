---
title: "Page scores: the whole site, scored in the background"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [60-score-engine]
---

## Goal

Every page has a current score, not only the open one ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26): "the whole site is re-scored in the background when a project opens, and after a save that touches shared parts"). Size: M.

## Decided behaviour

- On project open, pages are scored one at a time in idle time, from the drafts and the repository.
- A save that touches shared parts (components, CSS files, Site settings) re-scores every page; a save of one page re-scores that page only (it already has its score from slice 60).
- Scores are kept per page in the browser, keyed by the page's content and the shared parts' content, so reopening a project shows them at once and only changed pages are scored again.
- Nothing shows while scoring: a page without a score yet has no ring (slice 63), never a spinner or a "scoring…" text.

## Files

Expected: `src/site-score/site-scores.ts`, the browser cache next to the drafts store, tests.

## Done when

- On a fixture site of 10 pages, opening the project scores all of them without slowing typing (the edit-bar timing spec stays green), and a CSS change re-scores all of them.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-61 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-61 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
