---
title: "Send the prompt to a connected agent"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [64-page-details-scores, 65-site-health]
---

## Goal

When an agent is connected, the prompt from page details or Site health goes straight to it, instead of only being copied ([ticket 10 follow-up](../../tickets/10-grill-page-scores.md#follow-up-2026-10-26); Lex: "yes!"). Size: S.

## Gate outside this map

`blocked_by` cannot point to another map. This slice also waits for agents-and-multiplayer build slice 13 ("A pin is a conversation", the asking-agents flow) to be released. The lead checks before claiming it.

## Decided behaviour

- **With an agent connected:** an agent icon sits right next to the prompt icon (slices 64 and 65), wherever the prompt icon is (page details header, Site health header, Site health rows). It is the same icon-only Ask agent control as on pins (agents build slice 13: "Ask agent stays icon-only").
- Clicking it sends the same prompt the prompt icon would copy, filter included, through the asking-agents flow. It becomes an ask that shows the agent's colour and name chip while it works, and turns grey when done, like a pin. The page findings stay linked, so the ring and the list update as the agent's changes land (slice 60 re-scores on every change).
- **With no agent connected:** only the prompt icon shows. No disabled icon, and no explainer.
- Feedback stays on the icon itself; no toast.

## Files

Expected: `src/site-score/page-details.ts`, `src/site-score/site-health.ts`, the asking-agents entry point from agents build slice 13, tests with a fake agent.

## Done when

- With a fake connected agent, the agent icon sends the page prompt (and, from Site health, the site prompt) and the ask shows the agent's chip. With no agent, the icon is absent.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-67 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-67 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
