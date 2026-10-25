---
title: "A pin is a conversation"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Lex can always ask for more on a pin, and sees which agent is on it ([mock-up](../../prototypes/10-asking-agents.html)).

## Decided behaviour

[Ticket 06, items 1, 2 and 6](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24) and [ticket 10](../../tickets/10-prototype-agents-working-while-lex-works.md#resolution-2026-10-25):

- Any pin (waiting, being worked on or done) takes a follow-up, which reopens it.
- One element can hold several pins.
- An agent picking a pin up gives it the agent's colour and name chip; it turns grey when done, with no text.
- While an agent works through a pin, the chip sits on the pin only, not also on the outline.
- The pin card has a Send button.
- Ask agent stays icon-only.

## Files

Expected (confirm while designing): `src/components/agent-pins.ts` (+ CSS), `src/components/agent-pin-geometry.ts`, `src/components/edit-bar.ts` (Ask agent), `shared/agent-requests.ts` (follow-ups on a done request), `src/controllers/agent-controller.ts`, `worker/mcp.ts` (`wait_for_requests` returns reopened requests); tests and `tests/native-save/native-agent-pins.spec.ts`.

## Done when

- A spec covers a follow-up on a done pin reopening it for the same agent, a second pin on the same element, and the pin taking the agent's colour on pickup and grey when done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-13 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-13 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
