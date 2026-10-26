---
title: "Page scores: real Lighthouse through the helper"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [60-score-engine]
---

## Goal

When the helper from the agents and multiplayer build is running on the user's computer, real Lighthouse measures the page with the computer's own Chrome, and its numbers replace the engine's ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26)). Size: M.

## Gate outside this map

`blocked_by` cannot point to another map: this slice also waits for agents-and-multiplayer build slice 16 (the helper, `helper/`, `npx @techiesreviews/editor-helper`) to be released. The lead checks before claiming it.

## Decided behaviour

- The helper finds the computer's Chrome and runs the same pinned Lighthouse version as `kit lighthouse`, on the page as the site-output step would write it (served by the helper on a local port, or the hot preview link from agents build slice 35 when it is on; the slice picks one in `decide`).
- It runs after the editor's own score has settled, for the open page, and for the whole site when Site health is open.
- Its numbers replace the engine's for that page until the next change; nothing tells the user which one they see, and no "estimated" mark (Lex). With no helper or no Chrome, the engine's numbers stay, silently.
- Costs nothing: no cloud service, no key.

## Files

Expected: `helper/` (a Lighthouse tool), `src/site-score/` (asking the helper), tests with a fake helper.

## Done when

- With a fake helper returning set numbers, the rings and details show them; with the helper gone, the engine's numbers return.
- One real run on Lex's computer is the lead's step at the end check.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-66 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-66 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
