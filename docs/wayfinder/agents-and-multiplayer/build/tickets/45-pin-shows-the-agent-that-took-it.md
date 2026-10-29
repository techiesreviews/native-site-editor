---
title: "A pin shows the agent that took it, however it was taken (follow-up on 13)"
type: task (AFK)
status: open
assignee: am-45
builder: claude
blocked_by: [13-pin-conversation]
---

## Goal

Slice 13 (PR #252) colours a picked-up pin with the agent's colour and name only once that agent reads the request by id. An agent that takes a pin through its wait (watchdog) and replies without that read leaves the pin on the plain spinner, never named, then grey when done. That is the main pickup path for many agents, so the pin often doesn't say who is on it (ticket 13 Follow-ups, P3 on `docs/agents/features.md:1058`). Slice 13's screenshots also showed the row of pins covering the small eyebrow line just above a heading ("LARKSPUR STUDIO" on the starter).

## Decided behaviour

- A pin takes the colour and name of the agent that took it the moment it is taken, whether by `wait_for_requests` (watchdog) or by reading it, and keeps it until done (lead, 2026-10-29; easy to undo).
- When a watchdog takes a request on behalf of a connection that has several agents, the pin names the agent that replies or reads first; until then it shows the connection's agent if there is only one, else the spinner.
- The pin row never covers text: it sits clear of the element above the heading (the eyebrow line) at 390 and 1280 wide, light and dark.
- `docs/agents/features.md` F-agent-04 says this.

## Files

- `src/agent-watch.ts`, `src/agent-pins.ts`, `src/agent-presence.ts` and their unit tests; the pin row CSS
- `tests/native-save/native-agent-pins.spec.ts`
- `docs/agents/features.md` (F-agent-04)

## Done when

- Unit test: a pin taken by a wait and answered without a read shows that agent's colour and name while being worked on; fails before the fix.
- The pins spec covers the watchdog path; shots at 390 and 1280, light and dark, show the eyebrow line uncovered.
- `kit unit --affected`, `kit specs --affected` (RESULT line quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; shots; report the RESULT lines.
