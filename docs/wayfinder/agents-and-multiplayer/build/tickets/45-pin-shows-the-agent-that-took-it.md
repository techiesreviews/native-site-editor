---
title: "A pin shows the agent that took it, however it was taken (follow-up on 13)"
type: task (AFK)
status: closed
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

## Done (2026-10-29)

- A pin a wait took now shows an agent at once (`src/agent-presence.ts` `onPin`, wired in `src/agent-menu-host.ts`): the taker when it is at work itself or its connection has no agent at work yet this session (a change, a question, a pin read or replied to); else that connection's one agent at work; with several, the spinner until one reads it or replies. Once named, a take keeps its agent until done, even if another agent of the connection starts work. The pin takes that agent's colour; a watchdog only takes one when it is the agent shown.
- The pin row stands clear of what stands just above its element when there is room (the eyebrow line over the starter's hero heading): the preview runtime reports the top of earlier siblings closer than a pin row (`clear` on `pin-rects`), `noteAnchor` stands the pins above it, and the Ask agent note follows the selection's pins. With no room at the frame's top, the pins stand on the element's own edge, as before.
- Unit tests: `tests/agent-presence.test.ts` (a pin taken by a wait and answered without a read shows that agent's name and colour while it works; the watchdog/several-agents cases; other connections and stopped agents do not count), `tests/agent-menu-host.test.ts`, `tests/agent-pin-geometry.test.ts`, `tests/preview-protocol.test.ts`. The first presence case fails before the fix (the pin was never "pinned" to the agent).
- Specs: `native-agent-pins.spec.ts` has a new `@actual` test at 390 and 1280, light and dark: the agent's own wait names the pin in its colour, the pin row is clear of the eyebrow line and the heading, and done turns it grey with no agent colour. `ASE_PIN_SHOTS=<dir>` saves the shots. The default test now expects the watchdog's name (no agent at work on its connection yet) until Copy editor reads, then Copy editor in the second colour. `native-mcp.spec.ts` now expects the agent's own wait to name both pins at once.
- Out of the listed Files, needed for the behaviour: `src/agent-menu-host.ts`, `src/components/native-preview-runtime.js`, `src/components/preview-protocol.ts`, `src/components/edit-bar.ts`, `src/components/agent-pin-geometry.ts`, `tests/native-save/native-mcp.spec.ts`.
- Known limits: which agents are at work is per tab, so another tab may name the taker where the receiving tab names its worker. A pin named after a watchdog stays on it until the next request update, even if a worker starts editing meanwhile.
- Shots (real starter, scripted: waiting, taken by a wait, one done; 390 and 1280, light and dark): `.scratch/shots/build-am-45-pin-shows-agent/20261029-064919/` (main checkout), contact sheets `contact-390.webp`, `contact-1280.webp`; every shot checks no pin covers the eyebrow line ("LARKSPUR STUDIO").
- Feature list: F-agent-04 Good and Files updated.
