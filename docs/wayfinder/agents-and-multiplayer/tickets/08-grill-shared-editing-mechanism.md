---
title: Decide how shared editing works and what it may cost
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-research-cheapest-shared-editing, 04-research-always-the-latest, 07-grill-synced-session]
---

## Question

With research 03 and 04 and the synced-session decision: which way do edits travel (peer-to-peer or a relay per page), which library merges them, what is kept on the server and for how long, and what monthly cost is acceptable for internal use and for a self-hoster? Does today's "never mirrored in Durable Objects" rule change (an ADR if so)? How do typing in the same paragraph, an agent's whole-section change, and an outside change from GitHub or a folder meet without anyone losing work?

## Resolution (2026-10-24)

Decided with Lex. Recorded in [ADR 0003](../../../adr/0003-shared-editing-over-a-store-nothing-relay.md).

1. **Yjs over the existing agent relay**, encrypted and storing nothing: "yes, maybe test it to make me understand more visually". A visual demo follows: `../prototypes/08-typing-together.html`.
2. **Typing goes out live**, and an agent's whole-element replacement still waits until the person clicks away: yes.
3. **Saving shared changes:** whoever saves, saves all changes in those files and names every author: yes.
4. **One relay for everything**, with the GitHub App webhook switched on (one manual change to Lex's App; new self-hosters get it at setup): "ok".
5. **Cost:** stays inside Cloudflare's Free plan (the preview-link ticket).
