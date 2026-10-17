---
label: wayfinder:research
title: Research live relay and reliable cleanup mechanisms
type: research (AFK)
status: closed
assignee: Codex research subagent (gpt-6.1-sol, low)
blocked_by: []
---

## Question

Which supported mechanisms can provide browser-owned agent state, event-driven remote MCP and five-minute cleanup without recreating idle polling or persistent draft mirrors?

Use current Cloudflare, MCP and browser primary sources, plus this project's relevant code. Establish WebSocket hibernation and auto-response behavior; clean closes versus silent network loss; alarm precision, retries and reconnect races; whether inbound remote MCP HTTP calls can await browser responses without per-request storage polling; state needed after object restart; bounded transient buffering; and compatibility constraints. Separate technical facts from product choices and do not claim a five-minute deadline from physical network loss is guaranteed.

## Comments

- Findings belong in `../research/live-relay-and-cleanup.md`, with primary-source citations and an explicit note that the working tree contains uncommitted changes. Research produces no application changes.

## Answer (2026-10-17)

The [primary-source research](../research/live-relay-and-cleanup.md) establishes the available mechanisms and their limits. Event-driven relay can replace storage polling; outstanding HTTP requests prevent hibernation, so pending calls need finite bounds. Silent disconnect detection and alarm delivery do not provide a hard deadline measured from physical network loss. Cleanup needs idempotency and generation checks. MCP 2026-07-28 and legacy transport cancellation semantics must be handled separately.

The research report is preserved on the research-only branch [`research/durable-object-live-relay`](https://github.com/techiesreviews/native-site-editor/tree/research/durable-object-live-relay) at commit `535c19d36aa9c244bb1addf33bf0b8fcd3b9b30f`. Only that report was committed; the active checkout and its index were unchanged. This branch is evidence, not an application implementation branch, and has no pull request.

Product choices remain in the dependent tickets. The report lists isolated experiments required before an implementation can claim compatibility, cleanup reliability or measured savings.
