---
title: Find how the editor can drive agents on Lex's own subscriptions
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

Lex (2026-10-24) wants "some kind of visual chat interface (at least for now) which can be connected to a local subscription model in cli, or using ChatGPT", and "let's first see what is available". What can actually be done today, and what does each option cost Lex and allow under the providers' terms?

- **A helper on Lex's computer** that the hosted editor (a browser tab on Cloudflare) talks to, driving Claude Code (Claude Agent SDK, `claude -p`, stream-json) and Codex (`codex exec`, the Codex app-server protocol) on his own subscriptions; the Agent Client Protocol (ACP) adapters for both; how a browser page reaches a local helper safely (localhost WebSocket, pairing, origin checks, Private Network Access rules in Chrome and Safari).
- **ChatGPT:** whether ChatGPT (apps, connectors, developer mode with remote MCP servers, Apps SDK) can drive our existing MCP server, and whether a ChatGPT subscription can be used from our own UI at all.
- **Terms:** what Anthropic's and OpenAI's consumer terms allow for using a subscription through a third-party UI or helper.
- **Subagents:** how each option runs several agents or subagents at once and reports their progress.

Existing pieces: the MCP server (`worker/mcp.ts`), the relay (`worker/agent-relay.ts`), the connection prompt (`src/agent-prompts.ts`). Give each option a plain verdict (works today / works with limits / not possible), its set-up steps for a non-technical user, and its cost.
