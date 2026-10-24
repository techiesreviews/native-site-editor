---
label: wayfinder:map
title: Agents and multiplayer
charted: 2026-10-24
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A finished build plan with mock-ups Lex has approved, for working with agents in the editor. It covers:

- several agents and subagents working at the same time while Lex works, each one shown working where it works;
- asking them easily: pins stay, plus whatever chat or MCP form the research favours;
- real shared editing with agents and people: GitHub collaborators, and guests with no account who join through a synced session;
- what anyone sees is always the latest version, whoever or whatever changed it, including coding tools that edit the files directly;
- the cheapest running cost, and easy to self-host so each team pays for its own.

Built in stages: (1) several agents at once and seeing them work; (2) typing in the same paragraph together; (3) people, and live outside changes.

## Notes

- **Planning only.** Tickets produce decisions, not code. The build starts after the clean-up ships (`docs/wayfinder/clean-up-before-features/`, do not edit) and is first in Lex's order of 2026-10-23 (`todo-list` memory): this map, then the atomic design catalogue, the detail pass, site quality, site structure, styling.
- **What the clean-up already decides or builds** (inputs, do not re-ask): invisible multiplayer, where agent and Media work finishes in a background page on its own site and page (build slices 27 and 34); agent presence on a section like Figma (slice 33); the three-state MCP menu with a watchdog subagent (slice 29, [Lex request 02](../../work/lex-requests/issues/02-simple-mcp-menu.md)); the 8-hour connection with automatic tab takeover (slice 98, on dev, not yet in production); agents told where Lex is typing, with a change to that exact part waiting until he clicks away (slice 52). Slices 27 and 34 are built so this map's shared editing can reuse the background page and per-page Undo.
- **Lex in plain words** ([kitchen.md](../../agents/kitchen.md) house rules): one question round at a time, each question with a recommended answer; technical questions too, explained plainly with file paths. Status reports terse.
- **UX rules:** no toasts and no explainer lines anywhere; feedback appears where the action happens (`no-toasts-feedback-in-place` memory).
- **Cost:** Lex (2026-10-24): "the cheapest possible option"; internal use first; self-hosters set it up themselves (the Deploy to Cloudflare button, root `wrangler.jsonc`) so the cost is theirs. Anything that costs money waits for Lex. Today's rule "drafts, context, commands and conversations are never mirrored in Durable Objects" (CONTEXT.md, Agent connection; the Durable Object reduction map) may have to change for shared editing: that is a decision for Lex with numbers, probably an ADR.
- **Skills:** `grilling` with `domain-modeling` for every grilling ticket (CONTEXT.md is the glossary; GLOSSARY.md for sign-in terms); `research` for research tickets (findings on a `research/am-NN-<slug>` branch, never merged); `prototype` for mock-ups.
- **Charting answers (Lex, 2026-10-24):** agentic workflow means agents inside the editor (the kitchen keeps its own software-factory map); everyone is in for multiplayer (one agent with Lex, several agents and subagents at once, and other people), with several agents at the same time mattering most; direct file edits by coding tools join, so syncing must keep what is shown the latest; worst pains today: asking agents with a pin, the connection not staying up, and not seeing agents work while he works; the chat does not need to work when his computer is off; pins are not replaced by a chat; whether a chat panel exists at all waits on research ("let's first see what is available, or that we just use an extensive MCP"), with [Dive Radio: How to Design an MCP](https://www.youtube.com/live/uwUqcQKx6Ww) as his reference.
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier agents-and-multiplayer`. Claim by filling in `assignee:` and pushing before work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Decide how several agents and subagents work at once](tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24): agents name themselves, colours in order of arrival; edits target the exact part so others' changes never refuse them; outline and chip per agent, orange on a question, dots in Page Structure and Pages; Stop per agent in the MCP menu; agents see who works on what; prototype approved
- [Find what an "extensive MCP" can do for working with agents](tickets/02-research-what-an-mcp-can-do.md#resolution-2026-10-24): canvas tools build no chat, people bring their own agent; MCP Apps final but client support uneven; `wait_for_requests` stays; our gaps are a preview picture, showing where the agent works, agent-started conversations and undo of agent drafts; 36 tools today
- [Find the cheapest way to edit the same page live together](tickets/03-research-cheapest-shared-editing.md#resolution-2026-10-24): Yjs over a store-nothing encrypted relay in the existing agent Durable Object, ~30 KB, nothing new for self-hosters, ~3% of the free daily allowance per busy hour; needs someone with the page online; server copy or WebRTC ranked lower
- [Find how the editor can drive agents on Lex's own subscriptions](tickets/01-research-agents-on-own-subscriptions.md#resolution-2026-10-24): only via a helper on his computer that connects out to our server and runs Claude Code and Codex (ACP) on his plans, at no extra cost; the hosted tab can never use a subscription; ChatGPT writes on Plus untested
- [Find how the editor can always show the latest files](tickets/04-research-always-the-latest.md#resolution-2026-10-24): GitHub push webhook relayed to open tabs (seconds, nearly free; webhook is off today), folder watcher in Chromium; three-way merge into drafts; unpushed local clones are the one gap

## Not yet specified

- **Rights and roles beyond a synced session:** whether guests ever get lasting access, and what a collaborator may do that a guest may not. Sharpens after the synced session ticket.
- **Undo and history with several editors:** whose Undo undoes what when Lex, agents and people edit one page; per-person history. Hangs on the shared-editing mechanism.
- **Saving with several editors:** who presses Save to GitHub for shared drafts, and what a commit says about who wrote what.
- **Self-host setup for shared editing:** what a self-hoster must switch on (services, keys, limits) and how the Deploy button covers it. Hangs on the mechanism and its cost.
- **Agent identity:** names and colours per agent and subagent across tabs and sessions; whether Lex can tell two Claude subagents apart.
- **Stage hand-off:** the build folder (README with rules, gates and waves; slices), once the decisions above are closed.

## Out of scope

- **The kitchen** (agents building the editor): the [software-factory map](../software-factory/map.md).
- **Agents that run without Lex's computer** (paid cloud agents on an API key): Lex 2026-10-24, the chat does not need to work when his computer is off. Back on the list for later.
