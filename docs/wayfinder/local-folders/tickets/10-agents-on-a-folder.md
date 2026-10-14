---
title: Decide how agents connect to a folder
type: grilling (HITL)
status: closed
assignee: Lex + Codex (grilling, T3 578a58fb)
blocked_by: [04-research-agents-on-a-folder]
---

## Question

With the research in hand: which ways of connecting an agent are offered for a folder (Connect with MCP token, OAuth connectors such as claude.ai), what the user does in each, how long a connection lasts, whether it stays with one folder or follows the tab, what an agent sees when the tab is closed, and how several tabs on the same folder decide which one applies agent changes.

## Comments

### Questions from research 04 (2026-10-13)

- Should a connection stay with the folder it was allowed for (recommended by the research), or follow the tab to other folders?
- When the agent goes quiet, does the server keep the shared files for the full 8 h, or delete them after about 30 minutes and ask the tab again when the agent returns?
- When Claude Code opens a different browser than the Chrome holding the folder, is "open this page in Chrome" enough, or is a pairing code needed from the start?

### Round 1 (2026-10-14)

Lex chose to keep each connection with its approved folder. Switching projects does not share the new folder through that connection; another folder needs its own connection.

### Round 2 (2026-10-14)

Lex chose to offer both connection routes for a folder:

- **Connect with MCP**: copy the setup prompt and token into Claude Code or Codex.
- **OAuth connector**: start in the agent app's connector settings, open browser consent showing the folder's name, then choose Allow.

Both routes use MCP and need no GitHub sign-in for a folder. The folder's allowed text files are shared only when the agent actually connects. Agent changes remain drafts for the user to review and save.

### Round 3 (2026-10-14)

Lex chose an absolute eight-hour window for planned folder connections in a browser. The first folder connection starts the window; later folder connections in that browser share its end time, without extending it. Show the time remaining. After expiry, reconnecting starts a new window; Disconnect can end access earlier. Expiry invalidates access and the server deletes the shared files.

### Round 4 (2026-10-14)

Lex chose to keep the shared files on the server until Disconnect or the absolute eight-hour expiry. Agent inactivity alone neither deletes the shared text nor extends access.

### Round 5 (2026-10-14)

Lex chose to keep the last shared copy available for agent reads when the final tab for the folder closes, until Disconnect or expiry. Clearly identify the copy as possibly outdated and show when it was last shared. Agent changes cannot apply until the folder is reopened and has caught up with the files on disk.

The settled outside-change rules still apply: disk checking pauses while all project tabs are hidden, so the shared copy is not guaranteed current. Only a visible leader tab that has caught up may apply agent changes. Pending changes retain the existing bounded expiry and base checks; this decision does not promise indefinite queuing or set a new timeout.

### Round 6 (2026-10-14)

Lex chose one visible leader tab to handle agent changes for a folder, with followers sharing the same drafts. Leadership transfers only when the leader closes, becomes hidden or is unavailable; changing focus alone does not transfer it. Keep one effective authority so a change cannot apply twice. When all tabs are hidden, changes wait until a visible leader has caught up with the files on disk before applying them.

### Round 7 (2026-10-14)

Lex chose Disconnect MCP to stop all agents for the current approved folder only. Revoke that folder's token and OAuth grants and delete its shared files from the server; other folders stay connected. Saved files on disk and local editor drafts remain. Cancelling an unused token never uploads folder files, and queued incomplete changes belonging to revoked grants cannot apply later.

### Round 8 (2026-10-14)

Lex chose instructions and Copy link for an OAuth authorization page opened in the wrong browser or profile. Copy and open the authorization link in the browser and profile holding the approved folder, then review its named-folder consent and choose Allow. Coding agents can use the setup prompt and token route as a fallback. Pairing codes are later work, outside this map's initial connection plan.

## Resolution (2026-10-14)

Lex confirmed the shared understanding below after rounds 1–8. Close only this ticket; this is a planning decision, with no editor implementation or build handoff started.

1. **Offer both routes, without GitHub sign-in.** Connect with MCP gives a setup prompt and token to copy into Claude Code or Codex. An OAuth connector starts in the agent app's connector settings, opens browser consent naming the folder, and requires Allow. Both routes use MCP; agent changes become local editor drafts for the user to review and Save to folder.
2. **Share only after an authenticated agent actually connects.** Opening a folder or menu, signing in, and making or copying an unused token do not upload folder files. The automatic shared folder copy contains only allowed saved and draft site text, with file-path metadata, subject to the established ignored, hidden and secret exclusions and explicit editor-file allowlists. Secret files such as `.env` are never shared. Image and other media bytes are not automatically uploaded as part of this copy; the media manager on a folder remains with the handoff, and this resolution does not decide future agent media tools.
3. **Keep each connection with the approved folder.** Switching projects never broadens access or shares the new folder. Another folder needs its own token or OAuth grants, even within the same browser window of access.
4. **Use one absolute eight-hour window in that browser.** The first folder connection starts it; later folder connections share the remaining time and the same end time. Show time remaining. Agent activity, inactivity and further connections do not renew it. Expiry invalidates access and makes the server delete the shared files; reconnecting after expiry starts a new window. This is the planned folder lifetime, not a change to today's GitHub lifetime.
5. **Keep the shared copy when agents go quiet.** Inactivity alone does not delete it. It remains until Disconnect MCP for that folder or the browser window's absolute expiry.
6. **Disconnect the current approved folder only.** Disconnect MCP revokes all that folder's token and OAuth grants and makes the server delete its shared files, including when no folder tab is open to perform deletion. Other folders stay connected; their shared expiry is not extended or restarted. Saved disk files and local editor drafts remain. Cancelling an unused token never uploads folder files. Queued incomplete changes belonging to revoked grants cannot apply later.
7. **Allow dated, possibly stale reads while the folder is unavailable.** When its final tab closes, the agent can read the last shared copy until Disconnect or expiry. Identify it as possibly outdated and show its last shared time. When all project tabs are hidden, disk checking pauses as already settled, so the copy is not guaranteed current. Changes wait for a visible leader to reopen the folder if necessary and catch up with disk before applying them. Existing bounded pending-change expiry and expected-version checks remain; no indefinite queue or new timeout is promised.
8. **Keep one automatic, stable visible leader.** One visible tab handles agent changes for the folder; followers share the same drafts. Transfer leadership when that tab closes, becomes hidden or is unavailable, with no overlapping authority or double application. Changing focus alone does not transfer it. If all tabs are hidden, wait for a visible leader and its disk catch-up before applying changes.
9. **Open OAuth consent in the folder's browser and profile.** If authorization opens elsewhere, explain this and offer Copy link to open the authorization link where the approved folder is held. The copied setup prompt and token remain a fallback for coding agents. Pairing codes are later work, without a new build ticket in this map.

Today's GitHub connection behavior stays unchanged. Direct tools writing to disk remain outside changes under [Decide how changes made outside the editor show up](07-outside-changes.md#resolution-2026-10-14): follow the disk version, remove affected drafts without recovery and preserve unrelated drafts. Multiplayer remains separate future work. ADR 0002 stays proposed; this resolution does not start the build handoff or editor implementation.

### Research boundary

The source research is branch `research/lf-04-agents-on-a-folder`, commit `d872a69a`, file `docs/wayfinder/local-folders/research/04-agents-on-a-folder.md`, recorded by [Research what agents on a folder need from the Worker](04-research-agents-on-a-folder.md#resolution-2026-10-13). Its eight-hour lifetime, 32 MB storage budget, pinned grants and CIMD approach began as proposals. This ticket records only the confirmed product choices above; the 32 MB budget and implementation mechanisms are not additional product decisions.

CIMD remains a recommendation to avoid the current Dynamic Client Registration cap, not a requirement imposed by Claude's protocol: [Claude's connector authentication documentation](https://claude.com/docs/connectors/building/authentication) supports DCR and CIMD and explains that DCR creates a new client on each fresh connection, while CIMD avoids that registration call. The historical research is preserved rather than rewritten as a build specification.
