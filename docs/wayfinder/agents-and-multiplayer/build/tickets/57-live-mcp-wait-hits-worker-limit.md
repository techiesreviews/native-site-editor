---
title: "The live editor's agent wait call sometimes fails with Cloudflare error 1102 (worker over its CPU or memory limit)"
type: bug (AFK)
status: needs-triage
assignee:
builder: claude
blocked_by: []
---

## Goal

During the 2026-10-31 security hot fix, an agent connected to the live editor (editor.techies.tools, version dde78e7c, MCP server 2.3.0). It called `wait_for_requests` once a minute for 75 minutes while no editor tab had the site open. 5 of 69 calls failed with Cloudflare error 1102, meaning the Worker went over its CPU or memory limit. The retry a minute later worked each time.

Two more findings:
- With the tab closed, `wait_for_requests` answers at once ("isn't open, wait a minute"). An agent that doesn't pause made about 1,480 calls in 7 minutes and got 503s.
- An idle wait shouldn't cost enough CPU or memory to hit the limit.

## Decided behaviour (to confirm in triage)

- Find what in the `/mcp` request path (token check, per-request server and handler since MCP server 2.3.0, room or state lookups) uses enough CPU or memory to hit 1102 on an idle wait, and bring it well under the limit.
- When the tab is closed, `wait_for_requests` either holds the call (long poll up to its normal wait) or returns a `retryAfter` that the helper and agents respect, so a busy loop can't happen.
- A test or a measured check (local Worker with production limits, or `wrangler tail` on the preview) shows no 1102 over 100 idle waits.

## Files

To find: `/mcp` handler in the Worker, the `wait_for_requests` tool, the helper (`@techiesreviews/editor-helper`) wait loop.

## Done when

- The cause is named in this ticket.
- 100 idle waits on the preview with no 1102 and no 503.
- The tab-closed answer can't drive a busy loop.
