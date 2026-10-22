---
title: "Agent connection stays: 8-hour permission, remembered opt-in, waiting instead of disconnected"
type: task (AFK)
status: closed
assignee: lead-98
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-22): "the MCP connection is unstable, unlike before; it disconnects very fast." It drops **after some minutes of not using it, on refreshing, or when opening the editor in a new tab.** Since the Durable Object build (production `3e562baf`, 2026-10-21) the rules are: agent permissions are removed 5 minutes after the last editor tab's live connection is detected as ended (`worker/agent-lifecycle.ts:4` `DISCONNECT_GRACE`, `worker/agent-maintenance.ts`), and remote agents are an explicit opt-in per tab that is not remembered (CONTEXT.md "Agent connection"). Temporary agent data cleanup after 5 minutes is what saves Durable Object load; the permission record itself is tiny.

## Decided behaviour

Lex (2026-10-22), replacing the 2026-10-17 rule for permissions only:

1. **Permission lasts 8 hours** (absolute from when the agent connected, or the existing absolute backstop if shorter) whether or not an editor tab is open. The 5-minute grace still removes temporary agent data (drafts mirror, context, receipts) after the last tab goes; Sign out and Disconnect still end access at once. Agent requests alone still never keep temporary data alive.
2. **"Remote agents on" is remembered per site** (account, repository, branch) in the browser until Lex turns it off; a reload or a new tab on the same site comes back with agents on.
3. **No tab open means waiting, not disconnected:** with a valid permission and no receiving tab, tools answer at once with a clear waiting result ("The editor isn't open for <site>. Open it and the agent can continue.") instead of an auth error; when a tab opens with agents on, the agent continues on the same connection without reconnecting.
4. **Diagnose first** (`mattpocock-skills:diagnosing-bugs`): reproduce each of Lex's three cases (idle for some minutes with the tab open; refresh; new tab) against dev before changing code, and record which rule or fault causes each. If the idle case drops while the tab is open and visible (for example a socket idle timeout, background-tab throttling, or a missed heartbeat), fix that as a fault; a visible, connected tab must never lose the agent.

Update CONTEXT.md "Agent connection" to the new rules.

## Files

Find the exact set while diagnosing; expected: `worker/agent-lifecycle.ts`, `worker/agent-maintenance.ts`, `worker/agent-relay.ts`, `worker/agent-store.ts`, `worker/mcp.ts`, `worker/index.ts` (socket handshake/grace), `src/agent-transport.ts`, `src/agent-owner.ts`, `src/components/agent-menu.ts`, `CONTEXT.md`, and their tests (`tests/agent-*.test.ts`, the MCP specs under `tests/native-save/`). Stay out of `src/main.ts` unless unavoidable (then set its ceiling per the README).

## Done when

- A written diagnosis in the Done section names the cause of each of the three cases, with evidence.
- Tests prove: a permission survives 10 minutes with no tab and works when a tab opens; it ends after 8 hours; Sign out/Disconnect end it at once; temporary data is still removed after the 5-minute grace; a reload and a new tab on the same site keep agents on; with no tab, a tool call returns the waiting result, not an auth error; an idle visible tab keeps the agent connected (fake clock).
- `scripts/agents/kit unit --affected`, `kit specs --affected` (including the MCP specs), `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_REVIEW_MODEL=claude-opus-5-5 kit bg slice-98 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-98 --timeout 2h`. Big, delicate slice: one Grok second-opinion review on the final version (`ASE_REVIEW_MODEL=grok-4.7 kit review --ticket <this ticket>`) before landing, within the weekly budget.

## Done (2026-10-22)

### Diagnosis

Reproduced against the local Worker (Miniflare Durable Objects, real relay sockets) and with fake clocks; the dev deploy needs Lex's GitHub sign-in in a browser, which this session does not have. All three cases end in the same server rule; two browser rules lead into it.

1. **Some minutes without using it, tab open.** Cause: the 5-minute grace removed the *permission itself*, not temporary data. Once the workspace saw no handshaken editor socket, `SessionStore.alarm` fenced the ledger entries and `deleteCleanedGrants` deleted the grant record and hub entry; the next MCP call failed authentication with 401 "Agent connection expired or was revoked." (the same text this session's own configured MCP server reports). Any socket gap of 5 minutes triggers it while the tab stays open: a backgrounded or frozen tab whose socket closed, a laptop sleep, a deploy restart, or browser recovery giving up (`agent-recovery.ts` pauses after 5 attempts in 2 minutes and waits for Retry). No idle fault in a *visible, connected* tab: the transport pings every 45 s and the relay's auto-response answers; a relay wake from hibernation re-handshakes on the same socket. A new fake-clock test holds a tab live for 2 hours (pings answered, visibility checks, a mid-way relay reset) with no reconnect. Evidence: the old lifecycle test "last close records close + five minutes; alarm deletes record, hub entry and ledger" asserted exactly this deletion.
2. **Refresh.** Cause: "remote agents on" was per tab and never remembered. After a reload the agent menu started off (and was not even loaded until the project menu opened), so no tab handshook; 5 minutes later case 1's rule deleted the permission. Before that, tools answered "not sharing".
3. **New tab.** Same cause as 2: the new tab started with agents off. With the first tab still open the agent kept working through it; once that tab closed or lost its socket, nothing received and the permission was deleted 5 minutes later.

### Behaviour now

- A permission lasts 8 hours from when the agent connected (`AGENT_PERMISSION_LIFETIME`, capped by the editor sign-in's own expiry), with or without a tab. The connect route and the OAuth token's `expires_in` report that expiry. An editor sign-in itself lasts at most 8 hours less a minute (GitHub's token lifetime, `worker/app.ts`), so in practice a permission ends when the sign-in it was made in ends: a connection made late in a sign-in ends sooner than 8 hours after connecting.
- The 5-minute grace after the last editor tab's socket ends removes temporary agent data only: each listed session hub drops its drafts mirror, context, requests and receipts kept inline (`clearTemporary`, internal route `/agent-temporary`), keeping grant metadata. `AgentLifecycle.begin` replaces `fence`; no tombstones or ledger fences are written now (ones written earlier still refuse their id until they expire). A failed clear retries in 30 s. Ledger entries an earlier version had fenced (`"cleaned"`) but not yet deleted finish their removal on the next cleanup (`removeCleanedGrants`: conditional record delete, hub entry, ledger release), so they stop listing and counting toward the 5-connection cap. Agent requests still never count as presence. Sign out and Disconnect still end access at once.
- "Remote agents on" is remembered per site (account, repository, branch) in localStorage (`native-site-editor:agents-on:…`). The menu also sets the existing startup key (`agent-history:…`) while agents are on, so the controller mounts it at startup with no new code there (it rewrites that key on its first request check, so a stale one heals); the menu turns agents back on with the agents' existing connections (no new token or prompt) and forgets the site when its connections are gone. Disconnect, Cancel, a failed first prompt, an ended sign-in and Move agents here (for the old site) turn it off.
- With a valid permission and no receiving tab, every tool answers at once with a waiting result (`{"state":"waiting","message":"The editor isn't open for <repo> on branch <branch>. Open it and the agent can continue: …"}` plus its own steps: open the editor, sign in, open that repository and branch, make sure remote agents are on, keep the tab open; no create-a-repository steps); `wait_for_requests` says to stop and tell the user; `get_site` returns `available: false, state: "waiting"`. When a tab opens with agents on, the next call reaches it on the same connection.
- CONTEXT.md "Agent connection" and the code map describe the new rules.

### Tests

- `tests/agent-lifecycle.test.ts`: permission survives 10 minutes with no tab, tools return the waiting result (HTTP 200, not 401) and the same token reaches a tab that opens; 8-hour end (and a shorter sign-in ending it sooner); grace removes temporary data and keeps grant, hub entry and ledger; failed clear retries; legacy tombstones still refuse until expiry; sign-out and revoke deny at once (kept). Tests that only covered permission deletion and its fences were removed.
- `tests/agent-transport.test.ts`: an idle visible tab stays live for 2 hours on a fake clock.
- `tests/agent-lifecycle.test.ts` also: the waiting message reopens the connection's own repository and branch and names remote agents on, with no create-a-repository steps; a removal an earlier version fenced but did not finish is finished once (record, hub entry and ledger entry go; an unknown outcome stays counted and retries in 30 s).
- `tests/native-save/native-agent-lifecycle.spec.ts`: a reload and a new tab come back with agents on with no new prompt, the agent keeps working, and Disconnect turns them off across reloads. Specs that clicked Connect in a second tab now rely on the remembered choice.
- `tests/native-save/native-agent-quiet.spec.ts`: after a reload, agents come back on with one connections read and one socket that stays connected through two idle minutes (visible, then hidden) on a fake clock; the clock pauses at each heartbeat until the relay's real answer arrives.
- `tests/native-save/native-agent-lifecycle.spec.ts` also: a remembered site stays on with one socket when its connections check goes unanswered, and comes back off with the site forgotten and no socket once its connection was removed elsewhere; Move agents here brings the new branch back on after a reload and leaves the old one off.
- MCP and usage tests expect the waiting answer instead of "not sharing".

### Byte budget

Boot code is unchanged (`src/controllers/agent-controller.ts` differs from the branch start only in comments; both boot bundles are 672,978 bytes before compression, +7 B gzip from chunk-name hashes). The lazily loaded agent menu grows by 183 B gzip. `kit size` reports boot 355 KB against the 355 KB budget: the start point (`d000f1cf`) measures within and this branch over, so the start point sits within a few bytes of the line; Lex decides whether to raise the budget or trim elsewhere.

