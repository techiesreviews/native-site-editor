---
title: Find what an "extensive MCP" can do for working with agents
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex's alternative to a chat in the editor is "that we just use an extensive MCP", as discussed in [Dive Radio: How to Design an MCP](https://www.youtube.com/live/uwUqcQKx6Ww) (summary under Comments). With the agent in its own client (Claude Code, Codex, ChatGPT), what can the MCP side do in late 2026 to make asking, watching and answering easy?

- Current MCP features and their support in Claude Code, Codex and ChatGPT: progress notifications, elicitation (the server asking the user), sampling, tasks or long-running calls, resources and subscriptions, MCP Apps or other UI shown inside the client.
- How design and canvas tools (Figma, Paper, Pencil, Framer, Webflow, tldraw and similar) shape their MCP servers for agents that edit a live canvas with a person at the same time: tool size, reading the canvas, presence, showing the agent's work in the product.
- What our 12 tools (`shared/agent-*.ts`, `worker/mcp.ts`) and `wait_for_requests` would need to change.

End with a plain comparison against a chat panel in the editor (what Lex would see and do in each).

## Resolution (2026-10-24)

Findings: `docs/wayfinder/agents-and-multiplayer/research/02-what-an-mcp-can-do.md` on branch `research/am-02-what-an-mcp-can-do` (commit `1a0456d4`, never merged).

- **Canvas tools build no chat panels.** Figma, Webflow, Framer, Paper, Pencil, tldraw and Canva all have people bring their own agent through MCP and give it a screenshot to check its work. Live selection needs a bridge to an open editor, and our receiving tab already is one.
- **MCP 2026-07-28:** sessions are dropped, tasks (long jobs) become an extension, sampling is on its way out, and MCP Apps are final.
- **Support by client:**
  - Claude Code: elicitation and tasks, but no MCP Apps.
  - Claude desktop and claude.ai: MCP Apps, but no elicitation or tasks, and a 240 s call limit.
  - ChatGPT: MCP Apps and elicitation.
  - Codex: elicitation, with a 60 s call limit by its docs and 300 s by its source.
  - No client lets a remote server push a pin into a running agent; only Claude Code channels from a local helper can (research preview).
- **`wait_for_requests` stays the base:** its 25 s wait fits every client. A tasks version in Claude Code would let the agent start on a pin without the watchdog subagent.
- **Biggest gaps are ours:**
  - no picture of the preview;
  - no way to show where the agent works;
  - agents cannot start a conversation on a pin;
  - no undo or discard of their own drafts.
- **Tool count:** 36 tools today, not 12.
- **Compared with a chat panel:** an extensive MCP covers asking and watching in apps Lex already uses; a panel would still need ticket 01's helper. Recommendation: build the MCP upgrades and the helper first, then decide on a panel (ticket 06).
- **Unconfirmed:**
  - whether channels stop on 2026-07-28 connections;
  - whether Codex shows MCP Apps.

## Comments

- 2026-10-24, lead: summary of the talk (Dive Radio ep. 15, Tommy and Ridd of Inflight, with Jitter, Magic Patterns, Mobbin/Paper and mcp-use's Andrew Carter; transcript read in full by a subagent). No guest builds a chat into the product: users bring their own agent and reach the product through MCP ("If a product doesn't have an MCP, I don't use it"). Principles: expose everything a person can do ("anything a user can do, an agent should be able to do"; external agents get "the same tools, the same prompt guidance, the same access" as the in-house harness); let agents check their own work (screenshots, their own browser); save tokens by making the path obvious; each tool's reply names the next step, because MCPs lose the discoverability of a UI; many tools are fine when each is unambiguous (clients defer tool search); errors say how to recover ("run read document again"); MCP Apps (UI inside ChatGPT or Claude's chat) only where it helps. Multiplayer: "many many agents at once" on one canvas, an MCP as "a single source of truth" so agents don't "step on each other's toes"; live cursors and presence were not discussed.
