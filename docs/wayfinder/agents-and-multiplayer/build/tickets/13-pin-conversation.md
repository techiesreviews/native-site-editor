---
title: "A pin is a conversation"
type: task (AFK)
status: closed
assignee: am-13
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

## Done (2026-10-29)

- Any pin takes a follow-up. Every pin's card has a message box and a Send button (arrow icon, 44 px on touch); Enter sends too. The box says "Answer…" on a question and "Add to this…" otherwise. In the tray, only questions have a box, as before. Sending closes the card onto its pin, which turns back to waiting. `requestOperation` "answer" (`shared/agent-requests.ts`) no longer needs an agent's reply first: it takes a message on any request not dismissed (waiting, worked on, question, done or answered).
- Who is on a pin: a request now keeps `agent` (`shared/agent.ts`). It is the first agent to take it while it waited (`wait_for_requests` passes the caller's name, `src/agent-watch.ts`), then whoever replied. A follow-up holds the reopened request for that agent's connection for a minute (`heldUntil`, `FOLLOW_UP_HOLD_MS`); other connections get it after that, so a request is never stuck with a gone agent. Agents never read `agent` or `heldUntil`. Each agent reply in the thread keeps the agent's name, and the card shows it in place of "Agent".
- The pin of a request being worked on is drawn in that agent's colour with its name, in place of the spinner. The element's marching outline is in that colour too. Colours come from `agentPresence.colour(who)`, so a pin matches the agent's outline and dots (`src/agent-menu-host.ts`). A request kept from before names still shows the spinner. Done and answered pins stay grey, with no name. A pin pops when an agent picks it up.
- The name chip sits on the pin only. While an agent works on a pin on a page, its presence outline on that page has no name chip (`AgentMark.pinned` in `src/agent-presence.ts`, `bare` in `native-preview.ts` and `native-preview-runtime.js`). The chip is back once the pin is done, or when the agent works on another page.
- Several pins on one element already stood side by side; the new spec checks it. Ask agent in the edit bar was already icon-only and is unchanged (the ticket guessed `edit-bar.ts`). `src/controllers/agent-controller.ts` and `agent-pin-geometry.ts` needed no change.
- Agent instructions: the `wait_for_requests` description and the connection prompt (`worker/mcp.ts`) now say that a request comes back when the user follows up on it, done ones included, to the agent already on it first.
- Tests:
  - `tests/agent-watch.test.ts`: the first taker is on the request; a follow-up on a done request is held from another connection (with `all` too) and goes back to the same agent with the whole thread; a follow-up on a waiting request; the hold running out hands it to another connection; a dismissed request is refused.
  - `tests/agent-presence.test.ts`: a pin's colour matches the agent's outline; no chip on that page while it works through the pin; the chip is back elsewhere and once done.
  - `tests/agent-menu-host.test.ts`: presence is told before the pins.
  - `tests/agent-tool-table.test.ts`: fingerprint updated for the new description.
  - New `tests/native-save/native-agent-pins.spec.ts`: two pins on the heading side by side; Copy editor's pickup turns them its colour with its name, and the outline matches; done is grey with no name; a follow-up typed in the done pin's card and sent with Send reopens it; Copy editor gets it back with the thread, and the pin is in its colour again.
  - `native-mcp.spec.ts` updated: a picked-up pin shows the client's name in place of a spinner; the card names the agent; a clicked done pin focuses its box.
- Feature list: F-agent-04 updated (Try, Good, Files, Spec).
- `RESULT: ok unit 3876/3876 (252 files)` (`kit unit --affected`). `RESULT: ok specs 1/1 passed` (native-agent-pins). Related specs (native-several-agents, native-agent-presence, native-agent-quiet, native-mcp-menu, native-lazy-panels, native-agent-pins) passed in one run; native-mcp then passed alone after its done-card check was updated (`RESULT: ok specs 1/1 passed`). `npm run check` and `npm run lint` are clean. `kit specs --affected` and `kit shots` were not run here.
