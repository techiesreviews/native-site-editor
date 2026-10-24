---
title: "The MCP menu: Connect, Wait, Disconnect, and nothing else"
type: task (AFK)
status: closed
assignee: lead-29
builder: claude
blocked_by: [98-agent-connection-stays]
---

## Goal

Lex (2026-10-23), decisions in [Lex's request 02](../../../../work/lex-requests/issues/02-simple-mcp-menu.md): the agent (MCP) menu has three states and no explainers, no toasts, no Watch controls. Feedback appears where the action happens.

## Decided behaviour

Read the request's "Decided" list; it is the spec. In short:

- One button and the coloured dot in use today (no agent icon):
  - **Connect to MCP** (not connected): copies the connection prompt; the button's own label confirms ("Copied") for a moment.
  - **Wait for MCP** (prompt copied, no agent yet): pressing it copies the prompt again; the dot pulses.
  - **Disconnect MCP** (connected = an agent is running and watching): disconnects every agent on the connection.
- Watching is automatic while connected (remove Watch for requests, Stop watching, Watch again, the 10-minute wait control and its texts). Rewrite `connectionPrompt` in `src/agent-prompts.ts` shorter: connect, `get_site`, then start a **"watchdog" subagent** that keeps calling `wait_for_requests` and reports each request back to the main thread, which makes the change and replies; everything stops when the connection is disconnected. Keep the token-safety rules.
- Several agents share one connection and prompt: verify the server accepts several agents on one connection (sessions on one grant); make it so if not. Remove "Connect another agent" and "Copy the prompt again".
- Remove all tab texts (taking over is automatic since ticket 98), "Reconnecting…", "Waiting for connection…", every error toast and error text: on a problem the button returns to **Connect to MCP** and the dot shows the state. Exception: browser storage full with unsaved changes shows **Download unsaved changes** inside the menu.
- Requests list: no heading, no "Nothing waiting"; shown only when there are requests.
- No toasts from this menu at all.

## Files

- `src/components/agent-menu.ts` (+ its CSS), `src/agent-prompts.ts`, `src/agent-transport.ts`, `src/agent-watch.ts`, `src/agent-resume.ts` (only where texts or the watch toggle live), `worker/mcp.ts` and `worker/agent-relay.ts` only if several agents per connection need it
- Tests: `tests/agent-*.test.ts` and `tests/native-save/native-agent-*.spec.ts` that assert the removed texts or controls (update, do not delete coverage of behaviour); a new `tests/native-save/native-mcp-menu.spec.ts`
- `CONTEXT.md` "Agent connection" if it names Watch

## Done when

- A browser spec walks: Connect to MCP (label confirms the copy, no toast) → Wait for MCP (press copies again) → an agent connects → Disconnect MCP → the dot changes; a second agent joins the same connection; a lost connection returns the button to Connect to MCP without any toast or text.
- `grep` shows none of the removed texts left in `src/` (list them in Done).
- The prompt asks for the watchdog subagent; a unit test pins its key lines.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit shots --compare dev` of the menu in each state (Lex sees them).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-29 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.

## Done (2026-10-23)

### Behaviour

- **One button and its dot** (`src/components/agent-menu.ts`, `agent-menu.css`): **Connect to MCP** (off, idle, another site shown, or any problem) copies the prompt and its label reads **Copied** for 2 s (`CONFIRM_MS`), then **Wait for MCP** (pulsing amber dot), whose press copies the same prompt again; once an agent uses the connection, **Disconnect MCP** (green dot) revokes every connection of the site on the server (`revoke { all, repoId, branch }`), the shared token, unused tokens and connections this tab has not read yet included. The dot alone shows in-between states (grey pulse: connecting, reconnecting, taking over) and problems (red: paused, quota, unavailable, takeover failed). In a problem state, Connect to MCP turns agents on again for the open site, and Disconnect MCP comes back with the connection (sign-out ends access at any time; `CONTEXT.md` says so); with another site shown it makes that site's own connection (the first site stays remembered). Any tab of the site shows Wait for MCP while a token waits for its agent; in a tab without that prompt (another tab copied it, or a reload), its press copies a prompt of its own. A new prompt revokes the site's unused tokens older than two minutes (`FRESH_TOKEN_MS`; a newer one may be another tab's fresh prompt), and only when the Worker refuses because the site's connections are full (`siteFull`, a 409) it revokes every unused token and tries once more; any other failure revokes nothing. Wait for MCP copies this tab's prompt again only while its token still waits (read fresh), so a prompt another tab reclaimed is never copied. A press that makes no prompt shows the red problem dot (`data-state="failed"`) until the next press, a turn on or off, another site shown, or an agent using a connection; a press always does what its label said. Connect to MCP always copies a prompt: from off or a problem, when a token already waits (another tab's or another browser's), it copies this tab's own prompt if it still waits, otherwise a new one. A refused clipboard write shows the problem dot too. Connect to MCP in a tab where another tab receives and nothing is connected makes a prompt there. The dot does not pulse under reduced motion.
- **Removed**: the hint line and every tab, error and status text, the Copy again, Cancel, Retry, Take over, Try again, Move agents here, Turn on again and Connect another agent links, the Watch row (Watch for requests, Stop watching, Watch again, the 10-minute countdown and its texts), the button tooltips, and the menu's notices (`say()`). The flyout beside Disconnect MCP lists the requests still with an agent or the user (an agent's question replaces its text), only when there are some: no heading, no summary line, no "Nothing waiting". Download unsaved changes is the one other control, shown only while this browser cannot keep agent edits; after a full storage, a finished download lets agents try again (a browser still full stops them again before any write); blocked storage keeps the button for the tab.
- **Watching is automatic** (`src/agent-watch.ts`): the Watch record (`agentWatch`, `WATCH_MS`, `WATCH_WAITS`) is gone; the receiving tab holds every wait up to 25 s (the relay's budget) until a request arrives; `waitMs` 0 (the site owner's switch) answers at once. `worker/mcp.ts`: an empty wait asks the agent to call again until Disconnect MCP; the closed-editor, busy and lost answers ask it to wait a moment and call again; the `wait_for_requests` description, the `watch_editor` prompt and the conventions resource (`worker/site-conventions.ts`) say the same. `WatchReport` left `shared/agent-requests.ts`.
- **Several agents on one connection**: the server already accepted several MCP clients on one token (each POST authenticates the token); the relay allowed only one held wait per site, which refused a second agent's watchdog. It now holds up to `WAITS_PER_SITE` (3) waits per site (`worker/agent-relay.ts`), leaving pending slots for edits. Agents on one token share a grant, so a request reaches one of them; agents on different grants (a token and an OAuth connection) each get it once, a take that loses the race at the same wake reading again (`TAKE_TRIES`).
- **Prompt** (`connectionPrompt`, `src/agent-prompts.ts`): shorter; connect, `get_site`, start a "watchdog" subagent that keeps calling `wait_for_requests` and reports each request to the main thread, which makes the change and replies; everything stops at Disconnect MCP (calls fail with 401). Token rules kept (in memory only, never saved or repeated; given to the watchdog in its instructions only). A task (Build it with an agent) comes before the requests step. A hint that says to stop (the owner's switch) overrides the loop, and that hint names the watchdog.
- The label reads **Connect to MCP** everywhere it is named (`src/onboarding-copy.ts`, setup checklist, spotlight CSS, worker messages). `CONTEXT.md` "Agent connection": automatic watching, Disconnect ends every agent, several agents per connection; the Take over sentence went.

`grep` finds none of these in `src/`: "Connect with MCP", "Waiting for connection…", "Copy again", "Copy the prompt again", "Connect another agent", "Take over", "Move agents here", "Turn on again", "Reconnecting to remote agents…", "Taking over agent changes…", "Another tab receives agent changes for this site.", "The receiving tab closed.", "Watch for requests", "Stop watching", "Watch again", "Watching for requests until", "Watch paused", "Watch is paused by the site owner.", "Nothing waiting", "agent working", "What agents wait on", "Your sign-in to the editor ended", "Remote agents are paused: the editor", "This browser can't keep a live connection for agents.", "Agent edits are stopped", "Agent edits are off", "Downloaded … file", "The download failed", the menu's "Clipboard access was denied…", "Show it and answer". (Agent-facing transport messages and other screens' own texts remain.)

### Tests

- New `tests/native-save/native-mcp-menu.spec.ts`: Connect to MCP (label reads Copied, no toast) → Wait for MCP (pulsing dot; a press copies the same prompt again) → an agent connects (Disconnect MCP, green dot) → a second agent joins the same token, both watchdogs hold a wait at once and one gets the request → Disconnect MCP ends both agents and the dot returns; a cut relay socket returns the button to Connect to MCP with no toast or text and a changed dot. Each state checks the menu shows only its label. Also: reduced motion stops the pulse while waiting and reconnecting; a second tab shows Wait for MCP and its press keeps the first tab's token working; Disconnect MCP ends an agent whose connection the menu never read; a refused copy never reads Copied; five reloads each pressing Wait for MCP still copy a working prompt with at most five grants; owner-paused agents show Connect to MCP, and once unpaused Disconnect MCP ends the agent; Connect to MCP in a tab where another receives with nothing connected copies a prompt.
- `tests/agent-watch.test.ts`: automatic holds (any number in a row, 25 s, the relay budget, release on notify), two agents on one connection, the relay's `WAITS_PER_SITE`, the usage harness without Watch, and the prompt's watchdog lines pinned; a relay-level case with a token grant and an OAuth grant waiting at once, each receiving the request once.
- Updated for the removed controls and texts: `agent-controls`, `agent-runtime-budget`, `mcp-runtime` unit tests; `native-agent-quiet` (automatic watching live test, owner pauses with no text), `native-agent-lifecycle` (automatic takeover instead of Take over; Connect to MCP for another site instead of Move agents here; the frozen-owner explicit takeover spec went with the button, its fence stays in `agent-transport.test.ts`), `native-agent-live`, `native-agent-recovery` (download only), `native-mcp`, and the label rename in the other MCP specs.

### Commits

- `b5f2f29d` The MCP menu: Connect, Wait, Disconnect, and nothing else
- `689f7b30` Review fixes round 1: Disconnect revokes on the server, Wait for MCP in every tab, unused tokens left alone, reduced motion, raced takes, stop hint, timers cleared on destroy.
- `3354f6f5` Review fixes round 2: unused tokens reclaimed, Connect to MCP where another tab receives, the site re-checked before copying, problem states documented.
- `6b88a015` Review fixes round 3: the storage-full message names Download unsaved changes; the unused-token clean-up (`revokeUnused`, `src/agent-resume.ts`) is fenced to the site the prompt began on; a blocked storage keeps its Download button; tests for the watchdog hints, bounded take retries and the clean-up race.
- `52271787` Review fixes round 4: Wait for MCP never copies a reclaimed token; only a full site reclaims every unused token; a failed press shows the problem dot; old Watch records are removed from the browser.
- `e27b7897` Review fixes round 5: the failed dot clears on a turn on or off, another site, or an agent connecting, and a press does what its label said; Wait for MCP copies only after a fresh read for the same site; Disconnect turns off only the site it began on; returning to a tab after a failed press reads its connections once.
- Review fixes round 6 (this change, after the rebase onto slice 27): Connect to MCP always copies a prompt, also when a token already waits; a refused copy shows the problem dot; slice 27's multiplayer specs press Connect to MCP; race specs for Disconnect and Wait for MCP during a site switch; a tab where another tab receives also re-reads its connections on return while it offers Wait for MCP.

### Review decisions

- Declined (round 2): a Disconnect MCP button in problem states (paused, unreachable, lost). Request 02 says problems show Connect to MCP; `CONTEXT.md` "Agent connection" says Disconnect MCP comes back with the connection and sign-out ends access at any time, and `native-mcp-menu.spec.ts` covers the unpaused revoke. Open for Lex to change.
- Declined (round 2): removing the transport's `takeover()` and `retry()`. Both are still used inside the transport and by its unit tests.
- Declined (round 2): merging the two lifecycle takeover specs. One checks that drafts survive and the other tab offers Disconnect MCP, the other that the agent continues after the owner closes.
- Noted (round 5): while a quota or cooldown has a retry time, the button stays disabled with no text until then (request 02: no text); it repaints itself when the time passes.
- Noted (round 3): with the editor closed, the watchdog now calls about once a minute until the permission ends (at most 8 hours). That is the cost of automatic watching (Lex, request 02); ticket 18 had kept this case quiet.

- Decision for Lex (round 6): Download unsaved changes shows for any browser-storage problem, blocked storage included, without checking that unsaved changes exist (request 02 names "full with unsaved changes"). Blocked storage also stops agent edits and puts the tab's work at the same risk, and the download states what it holds (README.txt); narrowing it needs the drafts store in the menu.
- Declined (round 6): `forEachAwait` unit tests for the menu's `revoke()`, `copyAgain()` and `start()`. The unit runner has no DOM to mount the menu (ticket 98 declined the same); their site-switch fences are proven in the browser instead (`native-mcp-menu.spec.ts`: Disconnect and Wait for MCP during a switch, a reclaimed token with a failing check), and `revokeUnused` has its `forEachAwait` case.

### Evidence

- Before/after against dev (`kit shots --compare dev`, 1280 and 390, light and dark): Connect state `/home/ubulex/Projects/native-site-editor/.scratch/shots/lead-29/20261023-182201/`, Wait state `.../lead-29/20261023-191126/`. Copied, Disconnect and a problem need an agent and a cut socket, which shot steps cannot drive: `kit shots --spec .scratch/lead29/menu-states.spec.ts` on the real starter shot all five states (Connect, Copied, Wait, Disconnect, problem; light and dark) in `.../lead-29/20261023-195221/`.
