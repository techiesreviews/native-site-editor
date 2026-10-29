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

- Review round 1:
  - A follow-up while an agent works on a request is no longer lost. The agent's reply to what came before is refused (409): it says the user added to the request and tells the agent to call `wait_for_requests`, which returns it with the whole thread (`FOLLOWED_UP`, `shared/agent-requests.ts`). A fresh request nobody added to still takes a reply straight away.
  - A held `wait_for_requests` on another connection now looks again when the hold ends, not up to 25 s later: a take reports the earliest `heldUntil` it skipped, and the wait holds only until then (`src/agent-watch.ts`).
  - The agent's pin is light like every pin: a tint of its colour, its colour as the border, and a dark ink of its hue. White on the solid colour measured 3.2–4.0:1 for three of the four colours; the tint and ink measure 7.3–8.1:1. The tint and ink are theme tokens (`--agent-presence[-N]-pin`, `-ink` in `src/theme.css`); the pin sets them with `--agent`.
  - Sizes: Send uses `max(var(--size-compact), var(--size-tap))`, which is 44 px on touch and narrow layouts. The pin's line, gap and widest name are pin variables (`--pin-line`, `--pin-gap`, `--pin-name-max`), now shared by the name, the question and the first line.
  - Send keeps the focus in the box, so after an empty Send the user types straight into it. The fallback error now says "The message could not be sent."
  - Tests:
    - `tests/agent-watch.test.ts`: a follow-up during work refuses the stale reply, and the next wait returns the follow-up; a wait on another connection holds until the hold ends and then takes the request.
    - `native-agent-pins.spec.ts`:
      - waits for both pins to be placed side by side;
      - checks the pin's border colour and that the ink on the tint reaches 4.5:1 for all four agent colours;
      - Send with an empty box sends nothing, and a double Send sends once;
      - a follow-up on the pin still being worked on (state seen) turns it back to waiting, the agent's stale reply is refused, and the same agent takes it again;
      - while Copy editor places media on the heading's section and works through that pin, its outline in the preview has no chip; once done, the chip shows "Copy editor" again (the runtime's `bare`).
  - Shots (`kit shots --spec .scratch/am13-shots.spec.ts`, real starter, 1280 and 390 wide, light and dark): pins on "Recent work" (one done, one Copy editor's), close-ups of them, and the done pin's card with a follow-up typed in. UX review against the rulebook:
    - the agent's pin reads in both themes;
    - done is grey with only its number and ✓ (no name);
    - the card names the agent and has the box and the Send arrow, a full tap target at 390;
    - no toast or explainer.
    One thing to look at: a pin that keeps the focus after its card closes shows its first line over the pin beside it. That is the existing focus behaviour, which the spec works around by opening the second pin from the keyboard. Tapping a done pin on a phone focuses the box and brings up the keyboard (follow-up).
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3878/3878 (252 files)` (`kit unit --affected`). `RESULT: ok specs 7/7 passed` (native-agent-pins, native-mcp, native-several-agents, native-agent-presence, native-agent-quiet, native-mcp-menu, native-lazy-panels). `kit specs --affected`: `RESULT: fail specs 1 of 183 failed: native-media-adding.spec.ts`. That failure is the PDF preview's 30-second limit under load, a spec this change does not touch; it passed alone (`RESULT: ok specs 1/1 passed`). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean.

- Review round 2:
  - The pin names the agent that does the work, not the watchdog that took it. A take names the taker only provisionally (`agentTook`). The first agent to read the request by its id (`get_selection` with the request, which the connection prompt asks for) is on it instead. That agent's pin and colour are its own, and its outline on the page drops its chip. A reply names its agent too. The tab saves the reader as the agent after the read; a read that loses a race saves nothing, and the reply then asks the agent to read again.
  - Stale replies are refused even after the watchdog has taken the follow-up again. Once the user adds to a request, it records which agents have read their message since (`readBy`, by a take or by its id). `reply_to_request` from any other agent is refused with 409 and nothing is recorded, so the follow-up cannot be closed unread, whatever state the request is in. The rule replaces the earlier "open with a user message last" check. The `reply_to_request` description says so (tool fingerprint updated).
  - Colours: only a request being worked on asks for its agent's colour (`src/agent-menu-host.ts`). Finished requests of earlier sessions no longer take places in the order of arrival.
  - On touch, tapping a pin no longer brings up the keyboard. The card focuses its first action (Clear or Dismiss), and only a question's card focuses its box.
  - Agents still never read `agent`, `agentTook`, `readBy` or `heldUntil`; they do see the names on the agents' messages in a thread.
  - Tests:
    - `tests/agent-watch.test.ts`: a watchdog's take, then Copy editor's read names Copy editor, and a second reader does not take over. A stale reply after the watchdog took the follow-up is refused until Copy editor reads it.
    - `tests/agent-presence.test.ts`: a finished request of an earlier grant takes no colour; the agent at work gets colour 0.
    - `tests/agent-menu-host.test.ts`: only the request being worked on asks for a colour.
    - `native-agent-pins.spec.ts` follows the prompt's setup: "Watchdog" waits and Copy editor reads, works and replies. The pin shows Watchdog until Copy editor reads, then Copy editor in its own colour. A stale reply after the watchdog took the follow-up is refused. New phone test (390 px, touch): tapping a done pin opens its card in view and on top, with Clear focused and the box not.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3882/3882 (252 files)` (`kit unit --affected`). `RESULT: ok specs 7/7 passed` (native-agent-pins, native-agent-quiet, native-mcp, native-several-agents, native-mcp-menu, native-agent-presence, native-lazy-panels). `npm run check` and `npm run lint` are clean.
  - `kit specs --affected`: `RESULT: ok specs 183/183 passed`.

- Review round 3:
  - A pin that only a watchdog's wait took names no one. It keeps its spinner, in no agent's colour, until an agent reads it by its id or replies. The watchdog therefore takes no colour, so the first agent at work gets the first colour (`agentTook` is skipped in `agent-pins.ts` `workingAgent`, in the presence `pinned` list and in the host's colour lookup).
  - Two agents reading one request at once: a read whose save lost the race reads again, at most `TAKE_TRIES` times, as a take does (`src/agent-watch.ts` `find`). Its reply is then accepted.
  - The icon-only Send button has a tooltip ("Send"). The pin's text pieces use logical properties throughout. The pin's state mark is cached in a `WeakMap`, not a `data-mark` attribute.
  - Round 1's refusal told the agent to call `wait_for_requests`. Since round 2 it says to read the request with `get_selection (request)`.
  - Tests:
    - `tests/agent-watch.test.ts`:
      - two reads where the first save loses: both reads are kept, and the losing reader's reply is accepted;
      - a follow-up whose hold ran out is taken by another connection's watchdog, then read by the original agent: that agent is on it again and its reply is accepted.
    - `tests/agent-presence.test.ts` and `tests/agent-menu-host.test.ts`: a watchdog that only took a request takes no colour.
    - `native-agent-pins.spec.ts`:
      - the watchdog-only pin shows its spinner, with no name and no agent colour;
      - Copy editor gets the first colour, and its outline in the preview is in it too;
      - the phone card's in-view and on-top checks are polled;
      - a new dark-scheme test checks the 4.5:1 contrast for all four agent colours.
    - `native-mcp.spec.ts`: a pin taken by a wait shows its spinner, and reading it names the agent.
  - Shots (`kit shots --spec .scratch/am13-shots.spec.ts`, real starter, light and dark): three pins on "Recent work" at 1280 and 390 (done, Copy editor's, the watchdog's only), close-ups, the done card, and on a 390 touch phone the done pin tapped. UX review:
    - the watchdog-only pin is the plain blue waiting style with its spinner, telling no name;
    - Copy editor's pin is in the first colour;
    - the phone card opens in view above the bottom sheet with Clear focused, and no keyboard comes up.
  - `RESULT: ok doctor 11/11 checks passed`. `RESULT: ok unit 3885/3885 (252 files)` (`kit unit --affected`). Of native-agent-pins, native-agent-quiet, native-mcp, native-several-agents, native-mcp-menu, native-agent-presence and native-lazy-panels, six passed together; native-mcp then passed alone after its pickup check was updated (`RESULT: ok specs 1/1 passed`). `RESULT: ok shots raw spec`. `npm run check` and `npm run lint` are clean.
