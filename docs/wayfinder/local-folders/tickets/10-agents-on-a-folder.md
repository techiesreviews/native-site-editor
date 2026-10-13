---
title: Decide how agents connect to a folder
type: grilling (HITL)
status: open
assignee:
blocked_by: [04-research-agents-on-a-folder]
---

## Question

With the research in hand: which ways of connecting an agent are offered for a folder (Connect with MCP token, OAuth connectors such as claude.ai), what the user does in each, how long a connection lasts, whether it stays with one folder or follows the tab, what an agent sees when the tab is closed, and how several tabs on the same folder decide which one applies agent changes.

## Comments

### Questions from research 04 (2026-10-13)

- Should a connection stay with the folder it was allowed for (recommended by the research), or follow the tab to other folders?
- When the agent goes quiet, does the server keep the shared files for the full 8 h, or delete them after about 30 minutes and ask the tab again when the agent returns?
- When Claude Code opens a different browser than the Chrome holding the folder, is "open this page in Chrome" enough, or is a pairing code needed from the start?
