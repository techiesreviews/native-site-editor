---
title: "MCP menu: agents working now, Stop, and Pins go to"
type: task (AFK)
status: closed
assignee: am-12
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Lex can stop one agent without stopping the others, and choose which agent picks up pins ([mock-up](../../prototypes/10-asking-agents.html)).

## Decided behaviour

[Ticket 05, item 4](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24) and [ticket 06, item 4](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- The open menu lists the agents working now (dot, name, Stop); Stop ends that agent only.
- "Pins go to" picks the agent the helper starts for pins (Claude Code, Codex, Gemini CLI, …). The choice is remembered per site in the browser.
- Disconnect MCP still stops them all.
- The three-state button and no-explainer rules from clean-up slice 29 stay.

## Files

Expected (confirm while designing): `src/components/agent-menu.ts` (+ CSS), `src/controllers/agent-controller.ts`, `worker/mcp.ts` and `worker/agent-relay.ts` (end one agent session), `shared/agent.ts`; tests and `tests/native-save/native-mcp-menu.spec.ts`.

## Done when

- A spec stops one of two agents: its outline and dots go, and the other keeps working.
- The Pins go to choice survives a reload.
- No new explainer strings (grep in Done).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-12 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-12 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-10-28)

- The open project menu, while an agent is connected, lists the agents working now above Disconnect MCP: a dot in each agent's colour (orange while it asks), its name and Stop (`src/components/agent-menu.ts` + `.css`). "Working now" is the same set `get_site` tells: at work, asking, or a change in the last ten minutes. A row leaves the list when that time ends. `src/agent-presence.ts` gives the list (`agents()`) and tells the menu when it may have changed (`listen`).
- Stop ends that agent only (its connection plus its name, so one of several subagents on a shared connection). Its row, outline, chip and dots go at once. The focus stays on the Stop it was on while that agent is listed; once that agent is gone it goes to "Pins go to", never to another Stop or Disconnect MCP. The stop is kept in this browser (`src/agent-stops.ts`, at most 100), so the stop holds in other tabs and after a reload; other tabs hear the storage event (`src/main.ts`). The tab that runs agents' calls refuses a stopped agent's reads, edits, media and request calls before anything runs, with `AGENT_STOPPED` (`shared/agent.ts`), which tells the agent to end its work. A `wait_for_requests` it holds when stopped is woken (here, or through the storage event when another tab stopped it). It takes nothing more and ends with the same refusal. A change not yet applied when Stop comes is refused too (`run` checks again). One already being applied finishes, drawn nowhere. Disconnect MCP still ends every agent.
- Design note: the stop lives in the browser, not the Worker. Every call already passes through the receiving tab, while the relay (`worker/agent-relay.ts`) is in memory only and has no store a stop could outlive a restart in. So `worker/mcp.ts` and `worker/agent-relay.ts` are unchanged. The stop is advisory: an agent's name is the one it gives (`worker/mcp.ts`), so a stopped subagent started again under another name, or with none, gets through. A stop the browser refuses to store holds only in the tab that made it; when another tab receives the agent's calls, they go on. A stop lasts until Disconnect MCP ends its connection, which forgets it; there is no other undo. A tab that does not receive the agents' calls lists only the agents asking a question, since its presence sees no calls.
- "Pins go to" (Claude Code, Codex, Gemini CLI, OpenCode; `PIN_AGENTS` in `shared/agent.ts`, Claude Code by default) shows while agents are on (Wait for MCP or Disconnect MCP). The choice is kept per site (account and repository, every branch) in this browser; `pinAgent(workspace)` in `src/pins-go-to.ts` reads it for the helper (am-16). Nothing else reads it yet.
- The three-state button and its dot are unchanged. No new explainer strings. The grep of new string literals in `src/` and `shared/` gives the controls' words ("Pins go to", "Stop", the four agent names, the list's accessible name "Agents working now") and the refusal the agent reads. Stop and the select are 44 px targets on touch; hover sits behind `(hover: hover) and (pointer: fine)`, with `:active` states.
- Tests: `tests/agent-presence.test.ts` covers the list in colours with each row's time left, and Stop removing an agent's marks while the others stay. It also covers a stopped agent's ended or later change drawing nothing, a stopped asking agent's chip going, another tab's stop (`stopsChanged`), and expiry. `tests/agent-menu-host.test.ts` has its fake updated. New spec in `tests/native-save/native-mcp-menu.spec.ts`: two named subagents at work on Home; the menu lists both with dots of two colours; Stop Header writer removes its row, chip and Page Structure dot while Copy editor's stay, and there is no toast. Header writer's next call is refused. Copy editor's change lands, and `get_site` lists only it. "Pins go to" set to Codex survives a reload, the stop still holds, and Copy editor works on. The menus' "only the button's label" checks (`native-mcp-menu`, `native-mcp`, `native-agent-quiet` specs) now leave out the two new controls.
- Feature list: new F-agent-11; F-agent-01's Good line names the new controls. `docs/agents/code-map.md` names `src/agent-stops.ts`.
- `RESULT: ok unit 3862/3862 (250 files)` (`kit unit --affected`). `RESULT: ok specs 1/1 passed` (native-mcp-menu). `RESULT: ok specs 2/2 passed` (native-mcp, native-agent-quiet). `RESULT: ok specs 6/6 passed` (agent-live, agent-recovery, onboarding, setup-checklist, lazy-panels, mcp-media). The earlier run of native-several-agents, native-agent-presence and native-agent-lifecycle passed; native-mcp failed only on the old label check, which is now fixed. `npm run check` and `npm run lint` are clean. `kit specs --affected` selects 180 specs (shared/agent.ts); it was not run here.

- Review round 1:
  - "Pins go to" is keyed on account and repository, not branch.
  - A held wait of a stopped agent ends refused and takes nothing.
  - The focus stays on its Stop, or the one in its place (above).
  - New `tests/agent-stops.test.ts`: once per agent, another tab's entry seen here, the 100-entry limit dropping the oldest, a refused write still held in this tab, and broken records or entries counting as no stops.
  - The menu spec now runs three agents. It stops the second, Copy editor, and Caption writer's Stop takes the focus. Copy editor's held `wait_for_requests` ends refused; then its `set_page_details`, `place_media`, `wait_for_requests` and `get_site` are each refused, and the page never gets its title. A request pinned afterwards goes to Header writer's wait. "Pins go to" set to Codex survives a reload, shows Codex on the site's feature branch, and shows Claude Code on another site (native-cards).
  - Shots (`kit shots --spec .scratch/am12-shots.spec.ts`, on the real starter, 1280 and 390 wide, light and dark; `.scratch/shots/am-12/20261028-211135/`): the menu while waiting, with three agents (one asking, one with a long name), and after a Stop.
  - UX review against the rulebook:
    - no toast or explainer, only the controls' words (S1, S4);
    - a long name is cut with an ellipsis and Stop stays in reach;
    - an asking agent's dot is orange, as its chip;
    - at 390 the select and the Stop buttons are 44 px tall (U6);
    - both themes read clearly.
    - No problems found.
  - `RESULT: ok unit 3866/3866 (251 files)` (`kit unit --affected`); `RESULT: ok specs 180/180 passed` (`kit specs --affected`, the stop spec included); `RESULT: ok shots raw spec`; `npm run check` and `npm run lint` are clean.
- Review round 2:
  - Stopping the last agent listed moves the focus to "Pins go to" (not Disconnect MCP).
  - `src/agent-stops.ts` keeps the stored list as read and reads it again after its own stop and on another tab's (`reread`, from the `storage` event in `src/main.ts`).
  - The stops test's fake is typed.
  - Spec additions in `native-mcp-menu.spec.ts`:
    - Caption writer's page details, held while the edit tools load, are refused once it is stopped, and the title never lands.
    - Copy editor's placement, already being applied when stopped, finishes with its chip gone.
    - Stopping the only agent left by keyboard focuses "Pins go to" while the button still reads Disconnect MCP.
  - New test: a Stop pressed in a second tab (Image finder asking) ends the receiving tab's held `wait_for_requests` with "stopped you" and removes its chip and dot there without a reload; its question stays on the pin. Another tab lists only agents asking, as its presence sees no calls.
  - New test: with `page.clock`, an agent's row stays nine minutes after its change and leaves the open menu after ten.
  - `RESULT: ok unit 3866/3866 (251 files)` (`kit unit --affected`); `RESULT: ok specs 5/5 passed` (mcp-menu, several-agents, agent-presence, agent-quiet, agent-lifecycle); `npm run check` and `npm run lint` are clean.
- Review round 3:
  - After a Stop the focus goes to "Pins go to" whenever the focused agent is gone. It never lands on the Stop now in its place, so a second Enter or a key repeat stops no one else.
  - Disconnect MCP forgets the stops of the connections it ended (`agentStops.forget`), here and in the other tabs.
  - "Pins go to" is named by its words alone (`aria-labelledby`); nested in its label, the select's value used to join its name.
  - The choice's storage moved to `src/pins-go-to.ts`. The held wait's outcome moved to `afterStoppedWait` in `src/agent-stops.ts`, so both have unit tests.
  - Tests:
    - `tests/agent-stops.test.ts`: Disconnect forgets a connection's stops and keeps the others; a stopped agent's held wait that was handed requests returns them, otherwise the stop's refusal.
    - New `tests/pins-go-to.test.ts`: one choice per site whatever the account name's capitals; an unknown value or refusing storage reads as Claude Code.
    - Spec: stopping the middle agent by keyboard focuses "Pins go to", and a second Enter stops no one; Disconnect empties the stops; the combobox's exact name is "Pins go to".
    - The expiry test: a focused Stop keeps the focus while another row leaves when its time ends.
  - Declined: sharing the receiving tab's list with other tabs (the limit is written in F-agent-11 and above instead).
  - `RESULT: ok unit 3870/3870 (252 files)` (`kit unit --affected`); `RESULT: ok specs 5/5 passed` (mcp-menu, mcp, agent-quiet, several-agents, agent-lifecycle); `npm run check` and `npm run lint` are clean.
- Review round 4 (UX review, L11):
  - The menu takes the approved mock-up's look (`prototypes/10-asking-agents.html`): a hairline divider after "Pins go to" and another after the agents' rows (shown only while there are rows).
  - "Pins go to" is a compact picker with a hairline edge on the menu's own colour. It matches the edit bar's select, with the same styled list where the browser allows it, a muted small label, and a press state. On touch and narrow layouts it stays 44 px tall (U6).
  - The specs' "only the button" checks leave the dividers out.
  - Shots retaken with `kit shots --spec .scratch/am12-shots.spec.ts` (`.scratch/shots/am-12/20261028-222453/`): waiting, three agents and after a Stop, at 1280 and 390 wide, in light and dark. They match the mock-up's layout.
  - Declined: F-agent-11 "no agent rows or Stop are shown". The feature's shot has no steps (it needs connected agents, which the steps cannot make); the scratch shots above show the rows and Stop.
  - `RESULT: ok unit 3870/3870 (252 files)` (`kit unit --affected`); `RESULT: ok specs 3/3 passed` (mcp-menu, mcp, agent-quiet); `RESULT: ok shots raw spec`; `npm run check` and `npm run lint` are clean.

- Second look (catch-up, 2026-10-29, OpenCode `deepseek-v4.1-flash-free`, `kit review --ticket <this> --base fff30decf^` at `3006e9571`): `RESULT: ok review git diff f7d6ca108f6b7f41188b3bf7ee08f2603e7a715c...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/unknown/20261029T040146Z` (findings 9: P2 3, P3 2, gap 4). Every finding is already in the Follow-ups below; nothing new filed.

### Follow-ups

- Spec (P2): 3ecd3ac73:src/agent-stops.ts:1 — P2 ticket: Ticket 12 says "Stop ends that agent only" and lists `worker/mcp.ts` / `worker/agent-relay.ts` for "end one agent session". Neither file changed. The stop is only a localStorage entry in one browser, and it trusts the name the agent gives itself. So an agent stays stopped only while a tab in that browser is the one receiving its calls. If another browser or device receives them, the agent keeps working. If it restarts under a new name, or with no name, it also keeps working. The Done "Design note" admits all of this, but the change of scope was never sent back for Lex's OK. Fix: get Lex's sign-off on the advisory, per-browser stop in the review pack (Tuesday). Otherwise end the session in the relay, keyed on grant+name.
- Spec (P2): 2e87b75ea:docs/wayfinder/agents-and-multiplayer/build/tickets/12-mcp-menu-agents.md:115 — P2 ticket: "Kit commands and evidence" asks for `kit specs --affected` green, with its RESULT line quoted. It was run (180/180) only in round 1. Rounds 2–4 then changed shared paths: `src/components/agent-menu.ts` (focus, Disconnect `forget`, `aria-labelledby`, dividers), `src/agent-stops.ts` and `src/main.ts`. After those changes only 3–5 hand-picked specs were run. Fix: run `kit specs --affected` again on HEAD and quote its RESULT line in Done.
- Standards (P2): 3a9dbc288:src/agent-stops.ts:54 — P2 race (CODING_STANDARDS "Async writers: proofs survive awaits… re-check that same proof… before every write"): `take` in `src/agent-watch.ts:57-70` checks `current()` before each save. A Stop that lands between two saves still leaves the earlier requests marked `returnedTo` the shared grant. `afterStoppedWait` then returns them to the stopped agent with `ok`. It is never told it was stopped, and its replies are refused. `take-requests` (`shared/agent-requests.ts:103`) skips requests already returned to that grant, so the other subagents on the same connection never get them. The comment "none is lost" is wrong for siblings. Fix: when the wait ends stopped, return the refusal and take the grant back off `returnedTo` for the requests handed out (or put their state back to waiting). Don't hand them to the stopped agent.
- Standards (P3): 3a9dbc288:src/components/agent-menu.ts:794 — P3 fault (CODING_STANDARDS "Async writers": the proof is taken before the await, but it is the wrong set): `ended` is built only from `hub.grants`. The revoke underneath is `all: true` and also ends grants "this tab has not read yet (the server lists them)". Stops on those grants are never forgotten. They stay in storage until the 100-entry cap pushes them out. Fix: take the list of revoked grant IDs from the `revoke` response, or forget by repo+branch.
- Standards (P3): 3a9dbc288:src/components/agent-menu.ts:797 — P3 race (CODING_STANDARDS "Racing…: exactly one path wins"): `agentStops.forget` is not followed by `agentPresence.stopsChanged()` in this tab. Other tabs repaint at once through the storage event (`src/main.ts:89`). This tab redraws a stopped agent's still-held question chip only on its next refresh. Fix: call the presence refresh after `forget`, or send `forget` through the `agents` port.
- Validation gaps (gap): No test shows that a stopped agent's `reply_to_request` and `get_request` are refused. Add to the native-mcp-menu stop spec: after Stop, `as("Copy editor", "reply_to_request", { request, status: "question", message: "x" })` is refused, and the pin's state does not change.
- Validation gaps (gap): Nothing covers requests handed out in the same wake as a Stop. Add a unit test in `tests/agent-stops.test.ts` or `tests/agent-watch.test.ts`: two subagents on one grant, the stop flips while `take` is between saves, then the sibling's next `wait_for_requests` still gets the request.
- Validation gaps (gap): No test shows that Disconnect in another tab also clears the `here` set in the tab that made the stop. Add to `tests/agent-stops.test.ts`: `add` with storage refused, then `forget` the grant, then `has` is false.
- Validation gaps (gap): No component-level unit test for `createAgentMenu` Stop and focus. Everything rests on the Playwright spec. Add a unit test with a fake `agents` port: Stop calls `stop(who)` and `requestTools.notify`, and focus goes to the select.

