---
title: "Agent connection: a failed mark-used step is not swallowed; the fake hub serializes operations"
type: task (AFK)
status: open
assignee: ak-41
blocked_by: []
builder: sol
---

## What

Two follow-ups Sol noted in media slice 99
(`docs/wayfinder/media-manager/build/tickets/99-mcp-signout-flake.md`, Done notes). Lex approved both
(2026-10-16).

1. **A failed mark-used step is lost.** `worker/app.ts` (`/mcp`) calls `markGrantUsed`
   (`worker/agent-context.ts`) on a connection's first request and swallows any error.
   `markGrantUsed` saves `usedAt` on the grant record first and then sends `use-grant` to the session's
   hub. If the hub step fails, the record already says "used", so later requests skip the step and the
   editor tab waits on **Waiting for connection…** for good. Make the failure visible (logged) and
   repairable: the hub learns of the first use before the record is marked, so a failed hub step leaves
   the record unmarked and the next request tries again. The MCP request itself still goes on. Keep the
   first-use rule: `usedAt` is set once and never moved (the hub's `use-grant` keeps the first value);
   no grant is reissued or extended.
2. **The fake hub lets operations overlap.** The test server's fake Durable Object
   (`tests/native-save/server.ts`) runs hub operations and draft-text stores straight away, while
   production (`worker/index.ts`) runs them inside `blockConcurrencyWhile`; two concurrent operations
   can read the same hub and the later write drops the earlier one's change. Run them one at a time per
   object, like production, through a small module a unit test can import.

## Files

- `worker/agent-context.ts`
- `worker/app.ts`
- `tests/native-save/server.ts`
- `tests/native-save/fake-hub.ts` (new: the fake's hub routes, serialized per object)
- `tests/agent-grant-reliability.test.ts` (new)
- this ticket

## Done when

- A unit test fails the hub's `use-grant` once and shows the next request repairs the hub's
  `usedAt`; it fails on the old order.
- A unit test runs two concurrent hub operations on the fake and both changes survive; it fails without
  the serialization.
- `npm run check`, unit, lint; `kit specs --affected` and `tests/native-save/native-mcp*.spec.ts` pass.
- Sol review on the PR; merged into `dev` through `kit pr`.
