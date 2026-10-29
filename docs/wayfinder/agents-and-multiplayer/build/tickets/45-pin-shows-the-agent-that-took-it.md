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

- A pin a wait took now shows an agent at once (`src/agent-presence.ts` `onPin`, wired in `src/agent-menu-host.ts`). Every agent call that is let in (`admit` in `src/components/agent-menu.ts`) records its agent as heard on its connection, acting unless the call is `wait_for_requests`; a change acts too. Stored requests (an old open question, a pin read long ago) count for nothing. The pin shows the taker when it acts (a worker's own wait, even beside other agents). A watchdog (heard only waiting) takes no colour: its take shows its connection's one agent acting in the last ten minutes (AT_WORK_MS), as the connection prompt's watchdog and main agent have it; with none or several, the spinner until one reads it or replies. Once named, a watchdog's take keeps its agent until done, even when another agent starts work; a stop (am-12) unnames it. An agent acting for the first time, or a stop, names the pins again at once: the presence tells the MCP menu's listeners and the host repaints the pins whose names changed, without waiting for a request to change (runner fix after the UX round's two P1s). Taken again after a follow-up, it is named afresh.
- Over a heading, the pin row stands clear of the line just above it when there is room (the eyebrow line over the starter's hero heading). `clearAbove` (`src/components/agent-pin-geometry.ts`) takes the top of the nearest earlier sibling stacked over the heading when it ends closer than a pin row and is short (at most two pin rows tall: an eyebrow or kicker). Siblings beside it, over it or hidden are passed over, reading at most four. Only headings, and one step at most (runner fix after round 3's P1): a run of paragraphs, list items or cards keeps each pin on its own element. The preview runtime measures siblings with the same box rules as the element (`rectOf`) and sends the result on pin rects and on the selection's rect, so Ask agent's note and the first pin share one anchor. `noteAnchor` stands both above it. With no room at the frame's top, they stand on the element's own edge, as before.
- Unit tests: `tests/agent-presence.test.ts` covers:
  - a pin taken by a wait and answered without a read shows that agent's name and colour while it works (fails before the fix: the pin was never "pinned" to the agent);
  - a watchdog's take (heard only waiting) names its connection's one agent acting (get_site counts), and the watchdog takes no colour; with none or several, the spinner; named at once when that agent first acts;
  - a worker's own wait names it, even beside another agent acting;
  - a worker's own take is named once it is at work, and being at work lapses after ten minutes without a change;
  - a stored question left open does not count against the only agent heard now;
  - a named take keeps its agent while others are heard or work, and loses it on a stop, a lone taker's too;
  - other connections, stopped agents and agents quiet for ten minutes do not count.
  Also `tests/agent-pin-geometry.test.ts` (`clearAbove`: eyebrow, a kicker over it, a tall block, beside, hidden, overlapping layer, a run of lines or cards, the sibling read limit; the `clear >= top` guard), `tests/agent-menu-host.test.ts` and `tests/preview-protocol.test.ts`.
- Specs: the new `native-agent-pins-actual.spec.ts` (`@actual`, its own file so `kit specs` still runs the default tests of `native-agent-pins.spec.ts`; both share `tests/native-save/agent-pins-support.ts`) runs at 390 and 1280, light and dark. Ask agent's note is clear of the eyebrow line before the first pin exists; the agent's own wait names both pins in its colour; the pin row is clear of the eyebrow line and the heading; done turns it grey with no agent colour. `ASE_PIN_SHOTS=<dir>` saves the shots. In the default test the watchdog's take names Copy editor at once in the first colour (acting through get_site, the connection's one agent acting), before any read. The `admit` → `heard` wiring is covered there: unheard, the watchdog would be named. `native-mcp.spec.ts` expects the agent's own wait to name both pins at once.
- Out of the listed Files, needed for the behaviour: `src/agent-menu-host.ts`, `src/components/agent-menu.ts`, `src/components/native-preview-runtime.js`, `src/components/preview-protocol.ts`, `src/components/edit-bar.ts`, `src/components/agent-pin-geometry.ts`, `tests/native-save/native-mcp.spec.ts`.
- Checks: `kit specs --affected`: `RESULT: ok specs 137/137 passed`; `kit unit --affected`: `RESULT: ok unit 2587/2587 (165 files)`; `kit doctor`: `RESULT: ok doctor 11/11 checks passed`.
- Size: `kit size` boot 362 KB (+1 KB vs dev@f10ddc1), exactly at the 362 KB budget.
- Known limit: the agents heard and at work are per tab, so a tab that is not receiving may name the taker where the receiving tab names the connection's agent.
- Shots (real starter, scripted: waiting, taken by a wait, one done; 390 and 1280, light and dark): `.scratch/shots/build-am-45-pin-shows-agent/20261029-101226/` (main checkout; retaken after the runner fix), contact sheets `contact-390.webp`, `contact-1280.webp`; every shot checks no pin covers the eyebrow line ("LARKSPUR STUDIO").
- Feature list: F-agent-04 Good and Files updated.
