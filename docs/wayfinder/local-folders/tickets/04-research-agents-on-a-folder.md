---
title: Research what agents on a folder need from the Worker
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

What must change in `worker/` so that an agent can connect to a folder project without GitHub, and every MCP read comes from the tab? Lex settled that nothing leaves the computer before an agent connects, and that once one connects the server holds the site's own text files (not ignored, hidden or secret files) until disconnect. Design: an editor session that does not need GitHub (a new session kind, how it is minted, rate limits and storage budget per session, lifetime and revocation); the Connect with MCP token flow on it; whether OAuth connectors (claude.ai, Claude Desktop, Claude Code `/mcp`) can work with such a session and what the consent page shows, and if not what is possible instead; how `SiteFiles`, `list_files`, `read_file`, `export_site` and `get_site` read from the tab's shared files instead of GitHub (a file manifest in the context, texts uploaded by hash, limits); how the context schema names a folder project without colliding with GitHub repo ids; whether a connection is pinned to one folder or follows the tab between folders and repositories; and which security risks change (phishing through dynamic registration, anyone minting sessions, files leaving the machine). Check against `docs/mcp.md`, `worker/agent-context.ts`, `worker/agent-operations.ts`, `worker/site-files.ts`, `worker/oauth.ts` and the MCP authorization spec.
