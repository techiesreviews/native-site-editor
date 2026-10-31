---
title: "GitHub collaborators join automatically"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-synced-session]
---

## Goal

Someone with access to the repository who opens the same project joins the live pages with no link.

## Decided behaviour

[Ticket 07, item 4](../../tickets/07-grill-synced-session.md#resolution-2026-10-24): own sign-in, own Save and agents, and the same live page.
- Mock-up approved by Lex (2026-10-27, after his changes): [14-share-live.html](../../prototypes/14-share-live.html)

## Files

Expected (confirm while designing): `src/live-session.ts`, `src/live-room.ts`, `worker/agent-relay.ts`; a spec with two signed-in users.

## Done when

- A spec: two signed-in users on the same repository and branch see each other's carets and edits with no link.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-31 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-31 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
