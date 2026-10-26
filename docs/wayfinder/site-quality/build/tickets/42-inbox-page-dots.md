---
title: "Pages and files: a dot on pages with an open item"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [41-inbox-site-improvements]
---

## Goal

A small dot on a page's row in Pages and files when that page has an open Inbox item ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26)). Size: S.

## Decided behaviour

- Same dot as the agents build's Pages dots (an agreed exception to S2); no number, no text.
- The dot goes as soon as the page's last item is fixed or waved off.

## Files

`src/pages-and-files-explorer.ts` (+ CSS), tests.

## Done when

- The fixture site's pages with items show a dot; the others do not.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-42 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-42 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
