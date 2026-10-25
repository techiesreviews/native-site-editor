---
title: "Live rooms in the relay: locked, store nothing"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [15-agent-tools-ask-and-undo, 16-helper-any-agent, 17-long-job-wait]
---

## Goal

The carrier for typing together, hot preview and outside-change news ([ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md)). Stage 2 starts only after stage 1 is released.

## Decided behaviour

[ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decisions 2 and 5 and its Proven section:

- One live room per site, branch and file inside the existing agent relay Durable Object, using hibernation.
- The room forwards encrypted messages only and stores nothing.
- A room access check: editor sign-in, an agent connection, or a synced-session token.
- A 30-second presence timeout, and a clean leave announced at once.
- How signed-in tabs and agents get the room key is designed in `decide` (README lead decisions).

## Files

Expected (confirm while designing): `worker/agent-relay.ts`, `worker/app.ts` (socket route), a new `shared/live-room.ts` (message shapes), a new `src/live-room.ts` (client: AES-GCM, socket, reconnect); tests in `tests/` with Miniflare, as the proof of concept did (`prototype/am-12-typing-together-poc`, `prototypes/typing-together-poc/`).

## Done when

- Tests: two clients exchange encrypted messages through a room; the relay sees only ciphertext; Durable Object storage holds 0 keys; a stranger without access is refused; a vanished client's presence ends after 30 seconds.
- `kit size` unchanged at boot (the client loads lazily).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` RESULT quoted (boot unchanged).
