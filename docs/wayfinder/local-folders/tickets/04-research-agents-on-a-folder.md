---
title: Research what agents on a folder need from the Worker
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What must change in `worker/` so that an agent can connect to a folder project without GitHub, and every MCP read comes from the tab? Lex settled that nothing leaves the computer before an agent connects, and that once one connects the server holds the site's own text files (not ignored, hidden or secret files) until disconnect. Design: an editor session that does not need GitHub (a new session kind, how it is minted, rate limits and storage budget per session, lifetime and revocation); the Connect with MCP token flow on it; whether OAuth connectors (claude.ai, Claude Desktop, Claude Code `/mcp`) can work with such a session and what the consent page shows, and if not what is possible instead; how `SiteFiles`, `list_files`, `read_file`, `export_site` and `get_site` read from the tab's shared files instead of GitHub (a file manifest in the context, texts uploaded by hash, limits); how the context schema names a folder project without colliding with GitHub repo ids; whether a connection is pinned to one folder or follows the tab between folders and repositories; and which security risks change (phishing through dynamic registration, anyone minting sessions, files leaving the machine). Check against `docs/mcp.md`, `worker/agent-context.ts`, `worker/agent-operations.ts`, `worker/site-files.ts`, `worker/oauth.ts` and the MCP authorization spec.

## Resolution (2026-10-13)

Full findings: branch `research/lf-04-agents-on-a-folder` (commit d872a69a), file `docs/wayfinder/local-folders/research/04-agents-on-a-folder.md`. No source code changed.

1. **A session without an account.** A `kind: "local"` Worker session with its own cookie, created only when the user connects an agent (never on opening a folder): 8 h, creation limits per network and overall, at most 32 MB of text per session, and a total storage cap that fits a self-host on Cloudflare's free plan (techies-reviews is 2.8 MB of text).
2. **Today's tab shares too early for folders.** It starts sharing as soon as a token exists, before any agent used it (`agent-menu.ts:140, 316-345`); for folders it must wait for a connected agent. Shared files are deleted on Disconnect only if the tab is open to send the pause; the server must delete them itself.
3. **Reads come from what the tab shares.** A file list in the context and texts uploaded by hash (as drafts are now); `SiteFiles` reads either GitHub or these. A folder is named by a project key (`folder:<uuid>`), not a fake repo id. The Worker also refuses hidden and secret paths itself.
4. **OAuth on an anonymous session can work.** The MCP spec (2026-07-28) and OAuth leave user recognition to the server; a session cookie is allowed. The claude.ai popup carries the cookie; Claude Code opens the default browser, which may not be the Chrome holding the folder. The consent page names the folder, the client's address, what is uploaded and when it is deleted.
5. **claude.ai needs Client ID Metadata Documents (CIMD).** It registers a new client on every connection, so today's limit of 10 registrations per network per hour can already block users. CIMD fixes that and makes fake "Claude" links easier to spot; it helps GitHub projects too and can ship first.
6. **Pin a connection to the folder it was allowed for**; following the tab would upload folders nobody agreed to share. The hub keeps one shared context per project.
7. **Slice order:** project key and file-reading seam with GitHub unchanged; the folder session; tab-shared files; Connect with MCP on a folder; CIMD and consent hardening; OAuth for folders; later, a pairing code.

Not verified: whether Claude Desktop opens sign-in in the system browser; whether a `claude.com` callback exists alongside `claude.ai`.
