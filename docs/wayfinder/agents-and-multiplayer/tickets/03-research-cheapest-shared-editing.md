---
title: Find the cheapest way to edit the same page live together
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

Lex (2026-10-24): real multiplayer "the cheapest possible option"; internal use first; self-hosters set it up themselves so they pay. What is the cheapest sound way for Lex, agents and people to type in the same paragraph of a site's HTML and CSS at once?

- **Merging edits:** shared-editing libraries (Yjs, Automerge, Loro, others current in 2026): size in the browser, text versus element-tree editing, how they map onto our files and drafts (`src/draft-store.ts`, `src/native-site-runtime.ts`) and the editing preview (`src/components/native-preview-runtime.js`), and how an agent's edit (a whole replacement from MCP) merges with live typing.
- **Carrying edits:** peer-to-peer between browsers (WebRTC, with only a tiny meeting point on the server), a Cloudflare Durable Object per page with WebSocket hibernation, or another relay. Durable Objects are now possible on the free plan; give real numbers: what an hour of two people and three agents on one page costs on the free plan and on Workers Paid, and what happens when a free limit is hit.
- **Our current rules:** the Durable Object reduction (`docs/wayfinder/durable-object-reduction/`) and "drafts are never mirrored in Durable Objects" (CONTEXT.md, Agent connection): which option keeps them, which needs them changed.
- **Joining without an account:** what a "synced session" link needs from each option (Excalidraw, tldraw and Figma links as references; end-to-end encryption in the link).

Give two or three ranked options with cost, effort and what a self-hoster must set up.
