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
- Stop ends that agent only (its connection plus its name, so one of several subagents on a shared connection). Its row, outline, chip and dots go at once. The focus stays on the Stop it was on while that agent is listed, else moves to the Stop now in its place. With no row left it goes to "Pins go to", never to Disconnect MCP. The stop is kept in this browser (`src/agent-stops.ts`, at most 100), so the stop holds in other tabs and after a reload; other tabs hear the storage event (`src/main.ts`). The tab that runs agents' calls refuses a stopped agent's reads, edits, media and request calls before anything runs, with `AGENT_STOPPED` (`shared/agent.ts`), which tells the agent to end its work. A `wait_for_requests` it holds when stopped is woken (here, or through the storage event when another tab stopped it). It takes nothing more and ends with the same refusal. A change not yet applied when Stop comes is refused too (`run` checks again). One already being applied finishes, drawn nowhere. Disconnect MCP still ends every agent.
- Design note: the stop lives in the browser, not the Worker. Every call already passes through the receiving tab, while the relay (`worker/agent-relay.ts`) is in memory only and has no store a stop could outlive a restart in. So `worker/mcp.ts` and `worker/agent-relay.ts` are unchanged. The stop is advisory: an agent's name is the one it gives (`worker/mcp.ts`), so a stopped subagent started again under another name, or with none, gets through. A stop the browser refuses to store holds only in the tab that made it; when another tab receives the agent's calls, they go on.
- "Pins go to" (Claude Code, Codex, Gemini CLI, OpenCode; `PIN_AGENTS` in `shared/agent.ts`, Claude Code by default) shows while agents are on (Wait for MCP or Disconnect MCP). The choice is kept per site (account and repository, every branch) in this browser; `pinAgent(workspace)` in `agent-menu.ts` reads it for the helper (am-16). Nothing else reads it yet.
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
