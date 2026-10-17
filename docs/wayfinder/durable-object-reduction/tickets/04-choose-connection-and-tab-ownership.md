---
label: wayfinder:grilling
title: Choose agent connection modes and tab ownership
type: grilling (HITL)
status: closed
assignee: Codex lead with Lex
blocked_by: [01-define-disconnect-and-reconnect, 03-research-live-relay-and-cleanup]
---

## Question

How do browser-local tools and opt-in remote MCP connect to the authoritative editor tab, and how is ownership transferred between tabs?

Choose default connection behavior, remote discovery and consent signals, supported clients, same-workspace tab sharing, repository/branch/account isolation, owner handover and unavailable-tab responses. Assess the existing uncommitted WebMCP path and whether a local companion or built-in chat is needed for this effort. Preserve current remote MCP compatibility without requiring an extension.

## Comments

- The user accepted all three recommendations on 2026-10-17.

## Answer (2026-10-17)

1. Pin each agent connection to one account, repository and branch. Selecting another tab or site cannot silently redirect its tools. A workspace change needs an explicit rebind or new connection, with stale in-flight commands rejected.
2. One editor tab receives agent edits for a workspace. Another tab showing the same workspace may explicitly take ownership. Focus changes alone do not transfer ownership. Ownership checks and generations must prevent two tabs from applying the same command.
3. Preserve the accepted default: browser-local tools access browser drafts; remote MCP remains compatible with existing clients without requiring an extension, and is explicit opt-in. Ordinary startup, menu opening and local mode must not implicitly start remote polling.
4. Built-in agent chat and a local subscription companion are separate follow-ups. The quota mitigation uses browser-local tools and existing remote MCP clients and does not depend on shipping a new agent UI or local runtime.

The transport implementation must share communication between compatible tabs without crossing account/repository/branch boundaries. Its eventual acceptance checks must cover explicit takeover, the owner closing, background tabs, browser restart and stale messages. The five-minute presence/cleanup contract remains defined in [disconnect behavior](01-define-disconnect-and-reconnect.md).
