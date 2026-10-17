---
label: wayfinder:grilling
title: Define disconnect, grace and reconnect behavior
type: grilling (HITL)
status: closed
assignee: Codex lead with Lex
blocked_by: []
---

## Question

What precisely happens when the last editor tab disconnects, during the five-minute grace period, and after cleanup?

Settle whether remote agent permissions are revoked at cleanup; whether a still-connected remote agent can extend retention; what reconnecting restores; how pending edits and responses behave while the browser is unavailable; and the distinction between immediate access revocation and physical record deletion on explicit sign-out or revocation. Keep browser drafts and GitHub sign-in separate from temporary agent data.

## Comments

- Initial agreement, 2026-10-17: five-minute grace after the last editor connection ends, cancelled by reconnecting in time; connected background tabs do not start cleanup; sign-out/revocation ends access immediately. The detailed behavior above is still open.
- Accepted interview round, 2026-10-17: cleanup after the five-minute grace also expires remote-agent permissions. Remote-agent traffic alone cannot extend retention. Reconnection after cleanup needs a fresh agent connection; GitHub sign-in remains intact.
- Accepted interview round, 2026-10-17: while no editor tab is connected, refuse new operations with an editor-unavailable result rather than accumulating a server-side queue.
- Accepted interview round, 2026-10-17: explicit sign-out or revocation ends access and requests immediate deletion of temporary agent data. The five-minute grace applies to connection loss. The implementation must account for transient cleanup failures without restoring revoked access.
- Final interview round accepted, 2026-10-17: use detected disconnection, preserve an absolute expiry backstop, reconcile ambiguous edits against browser receipts, and restore unexpired permissions only after a fresh workspace check. This completes the product decision; implementation mechanics remain in dependent tickets.
- Research available in [live relay and cleanup](../research/live-relay-and-cleanup.md): silent network loss has no documented maximum detection latency; cleanup alarms can be delayed or retried. The next round must distinguish the five-minute eligibility deadline from guaranteed physical deletion time.

## Answer (2026-10-17)

The user accepted the following contract in two interview rounds:

1. Temporary agent state becomes eligible for cleanup five minutes after the last editor tab's live connection is detected as ended. A connected background tab still counts as connected. This is not a guaranteed physical deletion deadline or a deadline measured from undetectable network loss.
2. Preserve the existing absolute session/permission expiry as a backstop. Remote-agent requests alone cannot prolong editor presence or the disconnect grace period.
3. Reconnection within the grace period cancels cleanup for the same live generation. It may reuse unexpired agent permissions only after checking the current workspace again. The browser supplies current state; stale commands are refused.
4. Without an editor tab available, refuse new agent operations with an editor-unavailable result rather than accumulating a server mailbox.
5. An edit whose result is lost is unknown until reconciled against its browser receipt. Neither automatic replay nor a success report is justified without that evidence.
6. At cleanup, remove temporary agent draft copies, shared context, queued commands, conversations and associated agent permissions. A subsequent connection requires fresh agent authorization. Keep browser drafts, GitHub sign-in and GitHub App configuration.
7. Explicit sign-out or revocation ends access immediately and requests immediate temporary-data deletion. Transient deletion failure cannot restore access. Respect the operation's ownership scope; revoking one connection must not silently revoke unrelated connections.

The concrete mechanism must be idempotent, recheck presence and generation when an alarm runs, and prevent late work from recreating expired state. The linked research describes those technical constraints without prescribing storage budgets or transport ownership.

Acceptance scenarios for the later implementation: first of two tabs closes; last tab closes; a connected background tab; reconnect immediately before the deadline; late/retried cleanup after reconnect; reconnect after cleanup; a remote agent waiting alone; unknown edit outcome; and sign-out/revocation with delayed physical cleanup. Browser drafts and sign-in survive temporary-agent cleanup in every applicable scenario.
