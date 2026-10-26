---
title: "Site settings: let AI training robots in"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [23-sitemap-and-robots]
---

## Goal

One switch per site for AI training robots, off by default ([ticket 07](../../tickets/07-grill-geo-choices.md#resolution-2026-10-26)). Size: S.

## Decided behaviour

- A switch row in Site settings; off means training robots are blocked in `robots.txt`. Search robots are never affected.
- The current state is read from `robots.txt`, so a site that already allows them shows on.
- No explainer text beyond the row's label.

## Files

`src/components/site-settings.ts`, `src/native-settings.ts`, `src/site-output/robots.ts`, tests.

## Done when

- Turning it on and saving changes only the training robots' lines.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-24 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-24 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
