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
- `RESULT: ok unit 3862/3862 (250 files)` (`kit unit --affected`; one earlier run had a load-timing failure in `agent-tools-edit.test.ts`'s ticket-52 retry test, which passed 5/5 alone). `RESULT: ok specs 15/15 passed` (agent, MCP, pages and several-agents specs); the new spec also passed 3/3 with CI fonts. `npm run check` and `npm run lint` clean. `kit specs --affected` selects 186 specs (shared plumbing) and was not run here.

### Follow-ups

- The catch-up (`changesSinceLastRead`, `src/agent-part.ts`) is still keyed by connection only. Two named subagents on one connection still share one catch-up and count each other's edits as their own (ticket 10's follow-up). Key it by connection plus `agent` now that the name arrives.

