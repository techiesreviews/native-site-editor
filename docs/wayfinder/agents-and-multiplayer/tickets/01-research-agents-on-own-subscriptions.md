---
title: Find how the editor can drive agents on Lex's own subscriptions
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex (2026-10-24) wants "some kind of visual chat interface (at least for now) which can be connected to a local subscription model in cli, or using ChatGPT", and "let's first see what is available". What can actually be done today, and what does each option cost Lex and allow under the providers' terms?

- **A helper on Lex's computer** that the hosted editor (a browser tab on Cloudflare) talks to, driving Claude Code (Claude Agent SDK, `claude -p`, stream-json) and Codex (`codex exec`, the Codex app-server protocol) on his own subscriptions; the Agent Client Protocol (ACP) adapters for both; how a browser page reaches a local helper safely (localhost WebSocket, pairing, origin checks, Private Network Access rules in Chrome and Safari).
- **ChatGPT:** whether ChatGPT (apps, connectors, developer mode with remote MCP servers, Apps SDK) can drive our existing MCP server, and whether a ChatGPT subscription can be used from our own UI at all.
- **Terms:** what Anthropic's and OpenAI's consumer terms allow for using a subscription through a third-party UI or helper.
- **Subagents:** how each option runs several agents or subagents at once and reports their progress.

Existing pieces: the MCP server (`worker/mcp.ts`), the relay (`worker/agent-relay.ts`), the connection prompt (`src/agent-prompts.ts`). Give each option a plain verdict (works today / works with limits / not possible), its set-up steps for a non-technical user, and its cost.

## Resolution (2026-10-24)

Findings: `docs/wayfinder/agents-and-multiplayer/research/01-agents-on-own-subscriptions.md` on branch `research/am-01-agents-on-own-subscriptions` (commit `02a554a1`, never merged).

- **Only through a helper on Lex's computer.** It starts Claude Code and Codex on his own plans, and they edit through the existing MCP server. Both providers allow this for one person on their own machine. The hosted editor tab can never use a subscription itself: Anthropic forbids it, and OpenAI requires approval.
- **Best shape:** the helper connects out to the editor's server, as a tab does today, so the browser never has to reach the computer. It can do the waiting for pins itself, which also addresses "doesn't stay connected". Cost: nothing beyond the plans.
- **Verdicts:**
  - Helper connecting out: works today, needs building.
  - Tab talking straight to a local helper: works with limits (Chrome asks permission, Safari blocks).
  - ACP inside the helper: works today and reports each subagent's progress.
  - Claude channels (pins pushed into a session): preview only, with a warning at every start.
  - Claude Remote Control: only in Claude's own apps.
  - ChatGPT on our MCP server: works with limits. Full write access is documented only for Business, Enterprise and Edu, so Lex should test a write on Plus.
  - "Sign in with ChatGPT" in our own chat: only inside the helper.
- **Risks:**
  - Anthropic announced and then paused (2026-06-15) moving scripted use to separate credit; notice is promised before any change.
  - Agents act with Lex's rights on his machine: limited permissions, with approvals sent to the editor.
  - Several agents use plan limits faster.
- **Later:** Claude Max has included $100–200 a month of API credit since 2026-10-07, which only matters for the out-of-scope cloud agents. OpenAI's "MCP Events" could push pins to ChatGPT, but needs a newer MCP protocol version than ours.
