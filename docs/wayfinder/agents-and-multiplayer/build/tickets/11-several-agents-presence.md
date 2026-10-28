---
title: "Several agents: names, colours and presence"
type: task (AFK)
status: closed
assignee: am-11
builder: claude
blocked_by: []
---

## Goal

Show every agent working while Lex works, each in its own colour and name ([approved mock-up](../../prototypes/05-agents-at-once.html)). Builds on clean-up slice 33's single-agent presence (`src/agent-presence.ts`).

## Decided behaviour

[Ticket 05, items 1, 3 and 5](../../tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24):

- Every agent tool takes an optional short `name`; the connection prompt tells each subagent to name itself.
- Colours come in order of arrival from existing theme colours (MCP green, components violet, video pink, data teal); orange stays for a question and blue for Lex's selection.
- On the page: an outline and name chip per agent, with the chip orange while that agent asks a question.
- The agent's dot shows on its section's row in Page Structure and on another page's row in Pages and files.
- Reading the site tells each agent who works on what.
- No progress bars, status text or toasts.
- Takes in clean-up [35, the agent's name on its chip](../../../clean-up-before-features/build/tickets/35-agent-name-on-presence.md) (Lex 2026-10-26: later, here): with no name given, the chip shows the MCP client's name (`clientInfo.name` in `worker/app.ts`, e.g. "Claude Code"), then "Agent".

## Files

Expected (confirm while designing): `src/agent-presence.ts`, `src/components/native-preview-runtime.js` (several boxes), `src/components/page-structure.ts` (+ CSS), `src/pages-and-files-explorer.ts` (+ CSS), `shared/agent-tool-table.ts` (the `name` argument), `shared/agent-read.ts` (who works on what), `src/agent-prompts.ts`, `src/theme.css` only if a token is missing; tests and a new `tests/native-save/native-several-agents.spec.ts`.

## Done when

- A spec with three named agents on the shown page draws three outlines with chips in three colours; Page Structure rows carry their dots; an agent on another page shows a dot on that page's row.
- An agent's question turns its chip orange.
- `get_site` lists who works on what.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-11 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-11 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-10-28)

- Every MCP tool takes an optional `agent`: the caller's own short name (clipped to one line, 40 characters). It is `agent`, not `name`, because `change_collection` already takes `name` for the collection (`shared/agent-tool-table.ts` `AGENT_ARGUMENT`). The Worker adds it to everything the call sends the tab. With no name, it uses the connection's MCP client name (`clientInfo.name` from its first `initialize`, as the hub records it), else the editor shows "Agent" (`worker/mcp.ts`). This takes in clean-up 35. The site instructions, the Ask-agent prompt and the connection prompt (`src/agent-prompts.ts`) tell each agent and subagent to name itself.
- An agent is its connection plus its name, so subagents sharing a connection show apart. `src/agent-presence.ts` keeps each one's colour in order of arrival from four theme colours: MCP green, components violet, video pink, data teal (new tokens `--agent-presence-2…4` in `src/theme.css`, sent to the frame by `src/theme.ts`). A fifth agent reuses the first colour.
- On the page shown, each agent at work draws its own outline and name chip in its colour (`native-preview-runtime.js`). Chips on one corner stand side by side. Each section's Page Structure row wears its agents' dots and says it is busy. An agent at work on another page dots that page's row in Pages and files (`src/components/pages-tree.ts`; the ticket guessed `pages-and-files-explorer.ts`). The dots are shared: `src/components/agent-dots.ts` + `.css`.
- An agent's question (`reply_to_request` with `question`) records who asked on the request (`reply.by`, kept from agents' reads). While the question waits, that agent's chip turns orange and its outline keeps its colour. When the agent is not otherwise at work, its outline stands on the request's section. The question is held to its request's site and branch, so a reload keeps it and another branch drops it.
- `get_site` lists `agents`: who works on what. Each entry has the name, `file`, `section` (a get_page id) and `asking`. It covers agents at work now, agents asking, and agents whose last change was in the last ten minutes, plus a note to leave others' sections alone (`shared/agent-read.ts`). `docs/mcp.md` describes it.
- Tests: `tests/agent-presence.test.ts` (several agents, colours, questions, who works on what, who reaches presence); `tests/agent-watch.test.ts` (who asked kept, hidden from agents); `tests/agent-tools-read.test.ts` (get_site `agents`); `tests/mcp-runtime.test.ts` (name and client fallback reach the tab); `tests/agent-tool-table.test.ts` (every tool has `agent`); menu-host and pages-host fakes updated. New `tests/native-save/native-several-agents.spec.ts`: three named agents draw three outlines with chips in three colours, the rows carry their dots, a fourth on About dots About's row, a question turns its chip orange, and `get_site` lists all four. `native-agent-presence.spec.ts`: the chip now shows the client's name.
- Feature list: F-agent-05 updated.
- Review fixes: a name of any length is clipped, never refused, and the call still lands (`worker/mcp.ts`). The recent changes `get_site` lists stay through a reload of the same branch, keyed by site and branch as questions are. The preview places chips after clamping them to the page's width; a chip that would pass the right edge starts a row below. Chips also step past Lex's edit bar, so a question's orange chip is not hidden while Lex selects in that section (found in the shots). The dots' entrance lasts 200 ms. The spec waits on observable state before branching. It now has two agents on one section (side-by-side chips, two dots on that row) and a fifth agent whose question shows on its request's section; the relay runs at most five calls of a site at once, so four stay held. New `tests/agent-dots.test.ts` covers the dots on a row and in Pages and files, and the presence and mcp-runtime tests cover a same-branch reload and a 200-character name.
- Shots (`kit shots --spec .scratch/am11-shots.spec.ts` on the real starter, 1280 and 390 wide, light and dark): preview outlines with chips, two chips side by side on Recent work, Page Structure dots, About's dot in Pages, a question's orange chip. UX review against the rulebook: colours tell agents apart in both themes, nothing to click on the outlines, no status text or toasts (S1), and the dots fit the rows at 390 wide. One problem found and fixed: the question's chip was under the edit bar. Two agents on one section share one outline edge (the later one's colour drawn on top); their chips and dots tell them apart.
- `RESULT: ok unit 3864/3864 (251 files)` (`kit unit --affected`). `kit specs --affected`: `RESULT: fail specs 1 of 186 failed: native-agent-quiet.spec.ts`. That failure is a socket-count timing check under a fake clock, not touched here; it passed alone and on two reruns (`RESULT: ok specs 1/1 passed`, twice). `RESULT: ok specs 3/3 passed` (several agents, presence, canvas-avoid) after the last runtime change. `npm run check` and `npm run lint` are clean.

- Review round 2: a same-branch reload repaints the marks still shown (`agentPresence.loaded()` at each load), and the preview keeps its marks for the new frame document instead of dropping them at deactivation. A waiting question's orange chip therefore stays after a reload in the tab. Tests:
  - the presence unit test asserts a fresh paint after a same-branch load;
  - unnamed questions keep `by = { grant, name: "" }` and show as "Agent" (agent-watch and presence tests);
  - `native-several-agents.spec.ts` refreshes the branch from GitHub and sees the chip again (the menu re-telling its requests also repaints here, so the unit test is what pins the reset);
  - `native-agent-presence.spec.ts` pins chip placement: past the edit bar, then a new row at the outline's left when the next chip would pass the right edge.
  `RESULT: ok unit 3864/3864 (251 files)`; `RESULT: ok specs 5/5 passed` (several agents, presence, branch menu, canvas-avoid, lifecycle); `npm run check` and `npm run lint` are clean.

- Review round 3:
  - `get_site` gives an agent that only asks the section its question is about (the section its outline stands on).
  - On the page shown, Pages and files dots that page's row for agents at work on the page as a whole (its details, or a change in no one section), who show nowhere else.
  - Tests: two agents of one connection (one at work on Home, one asking on About) come back as two entries in arrival order (presence unit test); the shown page's row with a whole-page agent (agent-dots test); `native-several-agents.spec.ts` switches to the dark theme and back while three outlines are drawn and checks that every outline and chip stays drawn in the theme's colours. The agents' colours are the same in both themes, so the step pins the repaint, not a colour change.
  - `RESULT: ok unit 3865/3865 (251 files)`; `RESULT: ok specs 3/3 passed` (several agents, presence, pages look); `npm run check` and `npm run lint` are clean.

### Follow-ups

- The catch-up (`changesSinceLastRead`, `src/agent-part.ts`) is still keyed by connection only. Two named subagents on one connection still share one catch-up and count each other's edits as their own (ticket 10's follow-up). Key it by connection plus `agent` now that the name arrives.

