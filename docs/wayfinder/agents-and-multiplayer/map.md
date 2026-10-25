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
- **Build plan:** [build/README.md](build/README.md).
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier agents-and-multiplayer`. Claim by filling in `assignee:` and pushing before work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Hand off the agents and multiplayer build plan](tickets/14-task-hand-off-build-plan.md#resolution-2026-10-25): 22 slices in three stages (8, 7, 7), each released after Lex's end check; starts after the clean-up is released; first wave 10 and 11
- [Decide whose Undo undoes what with several editors](tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25): your Undo undoes only your typing; an agent's change undone from its pin or chip; others' from their author outline; changes elsewhere undo on their own page
- [Prove typing together on the real stack](tickets/12-prototype-typing-together-poc.md#resolution-2026-10-25): works and "feels great"; four rules added to ADR 0003; others show as a caret with a small first-letter circle (a tiny model icon for agents), name on hover
- [Mock up several agents working while Lex works](tickets/10-prototype-agents-working-while-lex-works.md#resolution-2026-10-25): stage-1 mock-up approved; Ask agent stays icon-only
- [Decide how Lex asks agents to do something](tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24): pins are conversations that take follow-ups; no chat panel; an agent-agnostic helper starts any coding agent through ACP and connects through the MCP (no new button); six new agent abilities; the pin takes the agent's colour
- [Decide what Lex sees when files change outside the editor](tickets/09-grill-outside-changes-live.md#resolution-2026-10-24): updates in place with a brief author chip; three-way merge into unsaved changes; on a true clash the latest shows, with Lex's words one Undo away; folders merge too
- [Decide how shared editing works and what it may cost](tickets/08-grill-shared-editing-mechanism.md#resolution-2026-10-24): Yjs in the browsers over the existing relay, encrypted, storing nothing (ADR 0003); typing sent live; whoever saves saves all, naming authors; one relay for edits, presence, preview and GitHub push news
- [Decide the preview link for sharing a site](tickets/11-grill-preview-link.md#resolution-2026-10-24): hot preview (live while Lex's editor is open, nothing stored) on a separate cheap domain, a subdomain per site; self-hosters run their own; anyone with the link, 30 days; Cloudflare stays on Free until a real limit bites
- [Decide what a synced session is for people without an account](tickets/07-grill-synced-session.md#resolution-2026-10-24): Share live link while Lex's tab is open; guests edit text, pictures and sections; only Lex saves, publishes, changes files and settings, and uses agents; no view-only link (that is the preview link); authors named in the commit; collaborators join automatically
- [Decide how several agents and subagents work at once](tickets/05-grill-several-agents-at-once.md#resolution-2026-10-24): agents name themselves, colours in order of arrival; edits target the exact part so others' changes never refuse them; outline and chip per agent, orange on a question, dots in Page Structure and Pages; Stop per agent in the MCP menu; agents see who works on what; prototype approved
- [Find what an "extensive MCP" can do for working with agents](tickets/02-research-what-an-mcp-can-do.md#resolution-2026-10-24): canvas tools build no chat, people bring their own agent; MCP Apps final but client support uneven; `wait_for_requests` stays; our gaps are a preview picture, showing where the agent works, agent-started conversations and undo of agent drafts; 36 tools today
- [Find the cheapest way to edit the same page live together](tickets/03-research-cheapest-shared-editing.md#resolution-2026-10-24): Yjs over a store-nothing encrypted relay in the existing agent Durable Object, ~30 KB, nothing new for self-hosters, ~3% of the free daily allowance per busy hour; needs someone with the page online; server copy or WebRTC ranked lower
- [Find how the editor can drive agents on Lex's own subscriptions](tickets/01-research-agents-on-own-subscriptions.md#resolution-2026-10-24): only via a helper on his computer that connects out to our server and runs Claude Code and Codex (ACP) on his plans, at no extra cost; the hosted tab can never use a subscription; ChatGPT writes on Plus untested
- [Find how the editor can always show the latest files](tickets/04-research-always-the-latest.md#resolution-2026-10-24): GitHub push webhook relayed to open tabs (seconds, nearly free; webhook is off today), folder watcher in Chromium; three-way merge into drafts; unpushed local clones are the one gap

## Not yet specified

- **Rights and roles beyond a synced session:** whether guests ever get lasting access, and what a collaborator may do that a guest may not. The synced session (ticket 07) gives guests edit rights for the session only.
- **Self-host setup for shared editing:** what a self-hoster must switch on (services, keys, limits) and how the Deploy button covers it. ADR 0003 says nothing new beyond the GitHub App webhook; confirm in the build.

## Out of scope

- **The kitchen** (agents building the editor): the [software-factory map](../software-factory/map.md).
- **Agents that run without Lex's computer** (paid cloud agents on an API key): Lex 2026-10-24, the chat does not need to work when his computer is off. Back on the list for later.
- **Unpushed local clones:** a coding tool editing a local copy of a GitHub site without pushing is not seen until pushed (Lex 2026-10-24, [ticket 09](tickets/09-grill-outside-changes-live.md)).
