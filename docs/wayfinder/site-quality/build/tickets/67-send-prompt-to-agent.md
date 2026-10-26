---
title: "Send the prompt to a connected agent"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [64-page-details-scores, 65-site-health]
---

## Goal

When an agent is connected, "Let AI fix it" sends the prompt from page details or Site health straight to it instead of copying it ([ticket 10 follow-up](../../tickets/10-grill-page-scores.md#follow-up-2026-10-26), Lex: "yes!"; [ticket 10 second follow-up](../../tickets/10-grill-page-scores.md#second-follow-up-2026-10-26)). Size: S.

## Gate outside this map

`blocked_by` cannot point to another map. This slice also waits for agents-and-multiplayer build slice 13 ("A pin is a conversation", the asking-agents flow) to be released. The lead checks before claiming it.

## Decided behaviour

- **One button, no extra icon:** the same "Let AI fix it" button from slices 64 and 65 (page details header, Site health header, Site health rows) changes what it does. With an agent connected it sends; with none it copies. There is no separate agent icon.
- Clicking it with an agent connected sends the same prompt it would copy, filter included, through the asking-agents flow (agents build slice 13). The button itself shows "Sent to <agent>" with a check for a moment. It becomes an ask that shows the agent's colour and name chip while it works, and turns grey when done, like a pin. The page findings stay linked, so the ring and the list update as the agent's changes land (slice 60 re-scores on every change).
- **With no agent connected:** the button copies, as in slices 64 and 65. No disabled state, and no explainer.
- Feedback stays on the button itself; no toast.

## Files

Expected: `src/site-score/page-details.ts`, `src/site-score/site-health.ts`, the asking-agents entry point from agents build slice 13, tests with a fake agent.

## Done when

- With a fake connected agent, "Let AI fix it" sends the page prompt (and, from Site health, the site prompt) and the ask shows the agent's chip. With no agent, the same button copies.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-67 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-67 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
