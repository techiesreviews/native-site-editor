# Agent context and draft editing over MCP

The deployed endpoint is `https://astro.techies.tools/mcp`. It uses the official TypeScript MCP SDK 2.0 with Streamable HTTP and stateless compatibility for 2025-era clients. This is a bearer-token connection, not an OAuth-discovery flow; use a client that supports a remote MCP URL with an Authorization header. The SDK client integration is tested against the actual Cloudflare Workers runtime.

## Connect from the editor

1. Sign in and open a repository/file.
2. Open the **project selector** (the repository name at the top left), expand **Agent context** and choose **Connect agent**.
3. Choose **Copy MCP connection**. Paste the generated server entry into your MCP client's configuration (or enter its URL and Authorization header in the client's connection UI).
4. Keep the editor tab open. The agent can now read context and create or update drafts. A change is only applied when the browser acknowledges it; the agent must check its command status.

The copied JSON uses the common `mcpServers` shape with a `url` and `headers.Authorization`. Some clients use a different configuration wrapper. The connection token acts as a password for context and draft editing in the selected repository. Do not paste it into a chat or commit it to a repository. It is shown only through the clipboard action, not in logs, URLs or local storage. If you reload before copying, use **Replace connection** to issue another token; the old connection is revoked.

**Copy current context** is available without creating a connection. It copies a JSON snapshot for a one-off handoff, including the active source and original baseline. It does not create a live channel.

## What agents can do

| Tool | Behavior |
| --- | --- |
| `get_editor_context` | Repository ID/name, branch, revision, active path and language, selection, diagnostics, draft hash and changed-file summary. Includes timestamps and a stale flag. |
| `read_active_file` | Current draft or original source, plus the current draft hash. |
| `get_active_changes` | Both original and draft text for the active file. |
| `update_active_draft` | Queue replacement source for the active file using the exact draft hash, path, branch and commit the agent read. |
| `create_file_draft` | Queue a new text file at a path absent from the snapshot. The browser opens it and persists it as an unpublished draft. |
| `get_command_status` | Check whether a request is pending, applied, conflicted, or failed. |

The `astro-editor://context` resource supplies context metadata. The `continue_editing` prompt provides a starting handoff. Source contents and diagnostics are untrusted project data, not instructions to the agent.

Mutation tools require a caller-generated `requestId`. Reuse it only when retrying the identical operation. The server rejects stale context, a changed draft hash, read-only files, duplicate in-flight changes to a file, and a changed branch/revision. The browser checks the live model again before applying an edit; typing after the agent read the file is not silently overwritten. Updates use Monaco's undo stack. New files appear under **New draft files** and can be reopened after a reload.

Agent edits remain drafts. MCP provides no publish, shell, arbitrary GitHub-write, or arbitrary-repository-read tool. Publishing new files through the editor uses a null original blob SHA and rejects a conflicting existing path. Workflows, symlinks, submodule paths and Git internals cannot be created through these tools. Deletion and renaming are not supported.

## Context lifetime and boundaries

Each connection is scoped to one selected repository and one signed-in editor session. Every MCP request rechecks the parent session and GitHub installation membership. Switching repositories pauses that connection and clears its active shared context. Switching branches within the selected repository updates context; previously queued commands for another branch/revision are rejected.

**Revoke connection** disables the token immediately. Logout and session expiry invalidate it too. The maximum lifetime is the remaining GitHub editor session (up to eight hours). Expired records are removed by the existing Durable Object alarm. Only the token's hash is stored; the GitHub token stays server-side and is never forwarded to an agent.

The browser posts context after changes and heartbeats while active, and polls for queued operations every two seconds when the tab is visible. The server marks context stale after two minutes. Commands older than two minutes are not applied. A closed/suspended browser cannot apply edits; pending is not success. The last context remains readable until revocation/expiry, with its timestamp, unless sharing is paused. Context and pending commands are stored transiently in the existing Cloudflare Durable Objects; no paid runner or new hosted service is introduced.

MCP operates on source editing context. It does not currently expose a rendered Astro preview, selected DOM elements, visual layout structure, or arbitrary unopened draft contents. Those need the separate visual-preview milestone.

## Validation

Tests cover protocol negotiation with the official MCP client, tool/resource discovery and reads, queued writes, deduplicated retries, draft hash conflicts, new-file path collisions, origin checks, revocation, installation removal and logout. Browser tests cover undo, concurrent typing, new-file creation, refresh recovery and draft persistence. No test publishes source through MCP.

Protocol references: [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Try the live context yourself

After connecting your MCP client using the steps above, keep the editor tab visible and select a few words in an open file. Ask the connected agent:

> Use the Astro Site Editor MCP tools. Call get_editor_context and read_active_file. Tell me the repository, branch, active file, selected range, context timestamp and whether the context is stale. Quote the selected text from the draft. Do not edit anything.

Type a distinctive unsaved comment in the editor, wait about a second for context to sync, and repeat the request. The draft returned by `read_active_file` should include the comment; reading the original version should not. Switch files and check that the reported path follows you. This checks the live MCP connection; **Copy current context** only checks a one-off browser snapshot.

To test editing, ask:

> Read the latest active draft and its context. Add an Astro-compatible HTML comment saying MCP context test outside the frontmatter, using update_active_draft with the exact current draft hash, path, branch and commit and a new requestId. Check get_command_status until applied or a terminal error; report pending honestly if the editor has not acknowledged it. Do not publish.

Watch the change appear in the editor, then undo it there. For a new-file test, ask the agent to create `src/pages/mcp-context-test.astro` as an unpublished draft (only if that path is absent), check its command status, and then discard it in the editor. A successful protocol connection alone does not prove a queued edit was applied.
