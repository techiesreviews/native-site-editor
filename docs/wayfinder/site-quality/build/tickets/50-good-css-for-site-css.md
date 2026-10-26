---
title: "good-css for every site's CSS"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

All CSS the editor and agents write into sites follows good-css ([ticket 04](../../tickets/04-grill-target-scores.md#resolution-2026-10-26)). Size: S–M.

## Decided behaviour

- The MCP site instructions (`worker/site-conventions.ts` `siteInstructions`) and the site's `AGENTS.md` conventions tell agents to follow good-css when they write site CSS, in a few lines (the skill's rules, not a link only).
- The CSS the editor generates (`src/native-style-files.ts`, component templates from the Add panel) follows it.
- The starter's CSS and component templates are checked against it; fixes go to the starter repo with a `fixtures/actual-starter` refresh, as in slice 13.
- Review applies good-css to site CSS in every later slice; Lighthouse checks the effect.

## Files

`worker/site-conventions.ts`, `src/native-style-files.ts`, `docs/mcp.md`, starter repo CSS, `fixtures/actual-starter/**`, tests.

## Done when

- The MCP prompt test shows the good-css lines; `kit lighthouse` scores no lower.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-50 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-50 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
