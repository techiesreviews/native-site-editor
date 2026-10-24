---
title: Prove typing together on the real stack
type: prototype (HITL)
status: open
assignee: Lex + claude (prototype)
blocked_by: [08-grill-shared-editing-mechanism]
---

## Question

Lex (2026-10-24), after the [demo](../prototypes/08-typing-together.html): "can we create a poc with the stack you are thinking of?"

Does [ADR 0003](../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) work for real? The proof uses:

- a Cloudflare Worker with a Durable Object relay that uses WebSocket hibernation and only forwards;
- Yjs in two or more real browser tabs, with AES-GCM encryption and the key after `#`;
- other people's carets with name chips in a code pane and in a small rendered preview;
- going offline and catching up;
- an "agent" client (a script) whose whole-element change waits while someone types in that element.

It is a throwaway on a `prototype/am-12-typing-together-poc` branch, run locally (`wrangler dev`), and never merged. Deploying it to a `workers.dev` address on Lex's account waits for his OK. Lex tries it, and the result either confirms the ADR or changes it.
