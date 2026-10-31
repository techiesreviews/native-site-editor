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

- A pin a wait took now shows an agent at once (`src/agent-presence.ts` `onPin`, wired in `src/agent-menu-host.ts`). Every agent call that is let in (`admit` in `src/components/agent-menu.ts`) records its agent as heard on its connection, acting unless the call is `wait_for_requests`; a change acts too. Stored requests (an old open question, a pin read long ago) count for nothing. The pin shows the taker when it acts (a worker's own wait, even beside other agents). A watchdog (heard only waiting) takes no colour while another agent is named: its take shows its connection's one agent that acted this session, however long it has been quiet (the main agent waits on its watchdog), as the connection prompt's watchdog and main agent have it (final review's P1); with several, the spinner until one reads it or replies; with none (a lone agent waiting first, or a reload), the taker itself until another agent acts (the next review's P1). Once named, a watchdog's take keeps its agent until done, even when another agent starts work; a stop (am-12) unnames it. An agent acting for the first time, or a stop, names the pins again at once: the presence tells the MCP menu's listeners and the host repaints the pins whose names changed, without waiting for a request to change (runner fix after the UX round's two P1s). Taken again after a follow-up, it is named afresh.
- Over a heading, the pin row stands clear of the line just above it when there is room (the eyebrow line over the starter's hero heading). `clearAbove` (`src/components/agent-pin-geometry.ts`) takes the top of the nearest earlier sibling stacked over the heading when it ends closer than a pin row and is short (at most two pin rows tall: an eyebrow or kicker). Siblings beside it, over it or hidden are passed over, reading at most four. Only headings, and one step at most (runner fix after round 3's P1): a run of paragraphs, list items or cards keeps each pin on its own element. The preview runtime measures siblings with the same box rules as the element (`rectOf`) and sends the result on pin rects and on the selection's rect, so Ask agent's note and the first pin share one anchor. `noteAnchor` stands both above it. With no room at the frame's top, they stand on the element's own edge, as before.
- Unit tests: `tests/agent-presence.test.ts` covers:
  - a pin taken by a wait and answered without a read shows that agent's name and colour while it works (fails before the fix: the pin was never "pinned" to the agent);
  - a watchdog's take (heard only waiting) names its connection's one agent that acted (get_site counts), however long it has been quiet, and the watchdog takes no colour; with several, the spinner;
  - with no other agent that acted, the taker alone is named, and gives way at once to its connection's agent when that one first acts (no request changing);
  - a worker's own wait names it, even beside another agent acting;
  - once named after another agent, a watchdog's take keeps it while a third agent starts work; a stop names the one agent left;
  - a stopped taker is not named; a stored question left open counts for nothing;
  - other connections and stopped agents do not count.
  Also `tests/agent-pin-geometry.test.ts` (`clearAbove`: eyebrow, a kicker over it, a tall block, beside, hidden, overlapping layer, a run of lines or cards, the sibling read limit; the `clear >= top` guard), `tests/agent-menu-host.test.ts` and `tests/preview-protocol.test.ts`.
- Specs: the new `native-agent-pins-actual.spec.ts` (`@actual`, its own file so `kit specs` still runs the default tests of `native-agent-pins.spec.ts`; both share `tests/native-save/agent-pins-support.ts`) runs at 390 and 1280, light and dark. Ask agent's note is clear of the eyebrow line before the first pin exists; the agent's own wait names both pins in its colour; the pin row is clear of the eyebrow line and the heading; done turns it grey with no agent colour. `ASE_PIN_SHOTS=<dir>` saves the shots. In the default test the watchdog's take names Copy editor at once in the first colour (acting through get_site, the connection's one agent acting), before any read. The `admit` → `heard` wiring is covered there: unheard, the watchdog would be named. `native-mcp.spec.ts` expects the agent's own wait to name both pins at once.
- Out of the listed Files, needed for the behaviour: `src/agent-menu-host.ts`, `src/components/agent-menu.ts`, `src/components/native-preview-runtime.js`, `src/components/preview-protocol.ts`, `src/components/edit-bar.ts`, `src/components/agent-pin-geometry.ts`, `tests/native-save/native-mcp.spec.ts`.
- Checks: `kit specs --affected` (started at the fourth runner commit; the last two presence-only commits were served live to the rest of the run, and the four agent spec files rerun on the final code passed): `RESULT: ok specs 138/138 passed`; `kit unit --affected`: `RESULT: ok unit 2591/2591 (165 files)`; `kit doctor`: `RESULT: ok doctor 11/11 checks passed`.
- Size: `kit size` boot 362 KB (+1 KB vs dev@f10ddc1), exactly at the 362 KB budget.
- Known limit: the agents heard and at work are per tab, so a tab that is not receiving may name the taker where the receiving tab names the connection's agent.
- Shots (real starter, scripted: waiting, taken by a wait, one done; 390 and 1280, light and dark): `.scratch/shots/build-am-45-pin-shows-agent/20261029-101226/` (main checkout; retaken after the runner fix), contact sheets `contact-390.webp`, `contact-1280.webp`; every shot checks no pin covers the eyebrow line ("LARKSPUR STUDIO").
- Feature list: F-agent-04 Good and Files updated.

### UX follow-ups

- UX (looks off): F-canvas-14 the page updates in place and the page scroll holds, but each edit raises a dark "Text changed" toast with Undo (S4) that sits over the code pane's lines at 390 (U5); the Publish button carries a "1" count (S2); a code token in the light pane reads at 3.8:1 (L12); the crumbs read "section.flow › h2" (S7) (.scratch/ux/am-45/20261029-105140-w9Eomk/add-panel-F-canvas-14-390-light-live-strip.webp)
- UX (looks off): F-bar-01 after Heading is added, a "Heading added. Into Section "Recent work" › after Div" toast with Undo shows at both widths (S4, and "Div" is code, S7); the crumbs read "body › main.page" (S7); no frame in this strip shows the edit bar on the new heading (.scratch/ux/am-45/20261029-105140-w9Eomk/editor-F-bar-01-390-light-bar-strip.webp)
- UX (looks off): F-bar-02 the level goes to H3 and Italic sets in place, but a "Heading level H3" toast with Undo follows (S4); at 390 the bar's "Heading" label and controls sit over the card link "Read about Meadow Row Allotments" above it (U5); the handle is 20 px tall and the selects and B/I buttons are 28 px, all crowded together (U6); the crumbs read "section.flow › h3" (S7) (.scratch/ux/am-45/20261029-105140-w9Eomk/editor-F-bar-02-390-light-level-strip.webp)

### Follow-ups

- Spec (P2): a90bfb907:src/agent-presence.ts:113 — P2 ticket: the ticket says a pin keeps its agent "until done", but a lone taker's pin can change agent while that taker is still working. If an agent's first call is a wait, `takenBy` names the taker itself, and line 116 (`named.delete(id)`) throws that choice away. If another agent on the same grant then acts (any `get_site`, for example), `hear` → `name()` puts that agent's name on the pin instead. Fix: also record a taker that names itself in `named`. Let it give way only to an agent that reads or replies on that request, not to any agent that acts on the connection.
- Spec (P2): 4c5bbb71a:src/agent-presence.ts:136 — P2 fault: a watchdog that names its own take gets the first colour for the rest of the session. This breaks am-13's rule that a watchdog takes no place in the order of arrival, which the ticket's Done section repeats ("a watchdog takes no colour"). The case: a reload, or a watchdog waiting before its main agent's first call. `name()` calls `arrive()` on the watchdog, and the host's `colour()` (src/agent-menu-host.ts:66) does the same. `arrivals` is never cleared, so the main agent's pins and outline get the second colour from then on. Fix: when a take names a taker that has not acted, show its name without `arrive()`/`colour()`. Only give it a colour slot once it acts.
- Spec (P3): 991efa45c:src/agent-presence.ts:110 — P3 ticket: once a watchdog's take is named after its main agent, one non-wait call from the watchdog changes the pin back to the watchdog. The cause is order: `heard.get(took)?.acts ? taker` is checked before `before?.took === took ? before.who`. That breaks "keeps it until done". Fix: check `before` (the kept name) before the taker-acts branch.
- Spec (P3): 530507d66:src/agent-menu-host.ts:62 — P3 fault: some name changes never repaint the pin, which breaks the ticket's "names the pins again at once". `pinNames` compares only `.name`. So the listener at line 72 skips a change from no one to an unnamed agent (`name: ""`), and a change between two agents with the same name on different grants. Fix: compare agent keys (`JSON.stringify([who.grant, who.name])`) instead of names.
- Spec (P3): c94b2f6d3:src/components/agent-pin-geometry.ts:21 — P3 ticket: the ticket says "The pin row never covers text", but with no room above the eyebrow the row lands on the eyebrow. When `lifted.below` is true, `noteAnchor` falls back to `at(rect.top)`, which stands the row above the heading. `tests/agent-pin-geometry.test.ts` (top 40, clear 12) asserts this: the row sits at 14–36, over an eyebrow at 12–32. This happens whenever the hero is scrolled near the top of the frame. Fix: in that case hang the row under the heading's top (`below: true` at `rect.top`), or record it as an accepted limit in the ticket.
- Validation gaps (gap): tests/agent-menu-host.test.ts: the `listen: () => () => {}` stub means the repaint path is never tested. Add a test that captures the listener, changes what `onPin("req-took")` returns, calls the listener, and asserts a second `requests` call with the new agent and colour. Calling it again with nothing changed should add no call.
- Validation gaps (gap): tests/agent-presence.test.ts: add `heard(watchdog, false)` → `questions([took(watchdog)])` → `heard(copy)` → `show(..., copy)`, then assert `colour(copy) === 0`. The current code gives 1.
- Validation gaps (gap): tests/agent-presence.test.ts: add a case where taker A waits and takes the pin, then agent B on the same grant acts, and assert which agent the pin names. This pins down the "keeps it until done" choice.
- Validation gaps (gap): agent-menu unit test: assert that a `requests` call with `tool: "wait_for_requests"` calls `agents.heard(who, false)`, that other tools call `heard(who, true)`, and that a stopped agent's call never calls `heard` and is refused with `AGENT_STOPPED`. Today only the default e2e spec covers this, and only indirectly.
- Validation gaps (gap): Heading-only `clearAboveEl` rule: add a `native-agent-pins.spec.ts` assertion (or a runtime unit test) that a pin on a `<p>` under a short line gets no `clear` in its pin rect.

