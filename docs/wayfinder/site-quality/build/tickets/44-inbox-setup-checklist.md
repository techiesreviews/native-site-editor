---
title: "The setup checklist moves into the Inbox"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [40-inbox]
---

## Goal

The setup checklist leaves the top bar and its open steps become Inbox items ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26); today `#setup-checklist` in `src/workspace-mount.ts:280`). Size: M.

## Decided behaviour

- Each open setup step is an item; clicking it opens that step as the checklist does today.
- The top bar no longer has the checklist; its slot goes.
- When all steps are done, nothing is left of it.

## Files

`src/workspace-mount.ts`, `src/controllers/setup-checklist-controller.ts`, `src/components/setup-checklist.ts` (+ CSS), `src/setup-host.ts`, tests.

## Done when

- The onboarding specs pass with the steps reached through the Inbox; the top bar has no checklist.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-44 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-44 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
