---
title: "Agent connection: a failed mark-used step is not swallowed; the fake hub serializes operations"
type: task (AFK)
status: closed
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
   repairable, so the next request tries again (as built: the hub is the only record of the first use;
   see Done). The MCP request itself still goes on. Keep the
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
  `usedAt`; it fails on the old code. A Disconnect during the step stays final.
- A unit test runs two concurrent hub operations on the fake and both changes survive; it fails without
  the serialization.
- `npm run check`, unit, lint; `kit specs --affected` and `tests/native-save/native-mcp*.spec.ts` pass.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-17)

- **Mark-used.** The hub is now the only record of a connection's first use. `authenticateAgent`
  (`worker/agent-context.ts`) returns the hub it already reads on every request; `markGrantUsed` sends
  `use-grant` only while that hub lists the connection unused, and never writes the grant record.
  `/mcp` (`worker/app.ts`) logs a failure ("agent connection's first use not recorded") and serves the
  request; the next request reads the hub again, finds it unused and retries. `use-grant` keeps the first
  time and client (`??=`), so a late or stale request cannot move them. Records saved by the old code
  with `usedAt` but an unused hub get repaired too (the record's `usedAt` is no longer read). One fewer
  storage write per connection. A client name sent only with a failed `initialize` is not kept.
- **Fake hub.** `tests/native-save/fake-hub.ts` answers the test server's `/agent-operation`,
  `/agent-drafts` and `/agent-draft`, running operations and draft stores one at a time per object
  (request JSON read first), like `blockConcurrencyWhile` in `worker/index.ts`; a failing operation
  does not block the queue. `tests/native-save/server.ts` uses it.
- **Commits.** 8c86197c claim; 08f1952e build (Sol); 41541a53 review 1 fix; f0e9c45c review 2 redesign;
  6d626631 review 3 test; close.
- **Tests.** `tests/agent-grant-reliability.test.ts` (5): failed `use-grant` retried next request,
  stale request cannot move it, record written once; Disconnect at every await point stays revoked
  (`forEachAwait`); two concurrent `add-grant`s keep both; two concurrent draft stores keep both texts
  and index entries; a throwing operation does not block the next. Each fails against the old code or
  with serialization bypassed (checked by temporary reverts). Ran: `npm run check`, `npm run lint`,
  unit (mcp-runtime, worker-speed, workflow-protection + new: 66/66); `kit specs` native-mcp 14/14,
  native-mcp-media 5/5, native-discard, native-component-loader, native-delete-card-race,
  native-components all green; `kit specs --affected` selects none.
- **Review (GPT-6.1 Sol), 3 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-41/`.
  Round 1 (P2): a failed record write after the hub step let a retry save a new time and client; fixed
  (41541a53), plus the draft-store test. Round 2: P1, the late record write could recreate a record a
  Disconnect had just deleted, so a revoked token would work again; P2, a failed hub read fell back to
  the retry's time. Both fixed by the redesign (f0e9c45c), with the await-race test. Round 3: no
  defects; draft-index assertion added. Rejected: a request-level `/mcp` test with an injected hub
  failure (would need failure injection in the Miniflare harness; the app.ts part is log-and-continue,
  the retry rule is unit-tested and the MCP specs pass end to end).
