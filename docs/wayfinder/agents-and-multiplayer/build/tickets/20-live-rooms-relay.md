---
title: "Live rooms in the relay: locked, store nothing"
type: task (AFK)
status: open
assignee: am-20
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

## Room key (runner decision, am-20, 2026-10-30)

Taken as the safest easy-to-undo option; it goes in Lex's Tuesday pack. Build it this way and record it in the Done.

- **No key on the server, ever.** The Worker and the relay never make, hold or store a room key; Durable Object storage stays at 0 keys.
- **The first one in makes it.** On joining, the relay tells a client (plain control message, no content) whether anyone else is in the room. Alone: the client makes a fresh random AES-GCM 256 key in memory only.
- **Later ones are handed it, wrapped.** A joiner sends a fresh one-time ECDH P-256 public key; any member who has the key answers with the room key encrypted for that joiner (ECDH, then HKDF, then AES-GCM). The relay forwards only public keys and wrapped keys, never the key itself.
- **Agents** join the same way: past the room access check with their agent connection, they get the key from a tab that has the room open; no tab open means no room (ADR 0003: someone with the page must be online).
- **Synced-session links** (slice 30) keep the key after `#`; this slice only leaves the access-check seam for their token.
- Known limit, to state in the Done: this keeps the key away from anything that reads or logs relay traffic, but the editor's own server serves the code, so it does not protect against a changed server. Undoing it later means changing only the handover messages in `shared/live-room.ts` and `src/live-room.ts`; nothing stored has to be moved.

The Goal's "starts only after stage 1 is released" is superseded by the build README's Tuesday rule (Lex, 2026-10-27: a stage starts once the stage before has an empty frontier); say so in the Done.

## Files

Expected (confirm while designing): `worker/agent-relay.ts`, `worker/app.ts` (socket route), a new `shared/live-room.ts` (message shapes), a new `src/live-room.ts` (client: AES-GCM, socket, reconnect); tests in `tests/` with Miniflare, as the proof of concept did (`prototype/am-12-typing-together-poc`, `prototypes/typing-together-poc/`).

## Done when

- Tests: two clients exchange encrypted messages through a room; the relay sees only ciphertext; Durable Object storage holds 0 keys; a stranger without access is refused; a vanished client's presence ends after 30 seconds.
- `kit size` unchanged at boot (the client loads lazily).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-20 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-20 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` RESULT quoted (boot unchanged).
