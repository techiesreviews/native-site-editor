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

Run on the local Worker (Miniflare Durable Objects, real relay sockets) and with fake clocks, not against dev: the dev deploy needs Lex's GitHub sign-in in a browser. Lex decided (2026-10-22) that this stands in for decided behaviour item 4; he checks the real-deploy cases on the preview editor at his end check (see Follow-ups). All three cases end in the same server rule; two browser rules lead into it.

1. **Some minutes without using it, tab open.** Cause: the 5-minute grace removed the *permission itself*, not temporary data. Once the workspace saw no handshaken editor socket, `SessionStore.alarm` fenced the ledger entries and `deleteCleanedGrants` deleted the grant record and hub entry; the next MCP call failed authentication with 401 "Agent connection expired or was revoked." (the same text this session's own configured MCP server reports). Any socket gap of 5 minutes triggers it while the tab stays open: a backgrounded or frozen tab whose socket closed, a laptop sleep, a deploy restart, or browser recovery giving up (`agent-recovery.ts` pauses after 5 attempts in 2 minutes and waits for Retry). No idle fault in a *visible, connected* tab: the transport pings every 45 s and the relay's auto-response answers; a relay wake from hibernation re-handshakes on the same socket. A new fake-clock test holds a tab live for 2 hours (pings answered, visibility checks, a mid-way relay reset) with no reconnect. Evidence: the old lifecycle test "last close records close + five minutes; alarm deletes record, hub entry and ledger" asserted exactly this deletion.
2. **Refresh.** Cause: "remote agents on" was per tab and never remembered. After a reload the agent menu started off (and was not even loaded until the project menu opened), so no tab handshook; 5 minutes later case 1's rule deleted the permission. Before that, tools answered "not sharing".
3. **New tab.** Same cause as 2: the new tab started with agents off. With the first tab still open the agent kept working through it; once that tab closed or lost its socket, nothing received and the permission was deleted 5 minutes later.

### Behaviour now

- **Permission lasts 8 hours** from when the agent connected (`AGENT_PERMISSION_LIFETIME`), capped by the editor sign-in, with or without a tab. The connect route and the OAuth token's `expires_in` report that expiry; `GET /api/agent/connections` leaves out connections past their 8 hours (from `createdAt`), so a tab forgets a site whose permission ended while the sign-in lasts. An editor sign-in itself lasts at most 8 hours less a minute (GitHub's token lifetime), so in practice a permission ends with the sign-in it was made in.
- **The 5-minute grace removes temporary agent data only** (drafts mirror, context, requests, inline receipts: `clearTemporary`, internal route `/agent-temporary`) from each listed session hub; a hub with nothing to clear is not rewritten. A failed clear retries in 30 s. No tombstones or ledger fences are written now; ledger entries an earlier version fenced (`"cleaned"`) but did not delete finish their removal once (`removeCleanedGrants`), and one rebound away since is only released. Sign out and Disconnect still end access at once; agent requests never count as presence.
- **"Remote agents on" is remembered per site** (account, repository, branch) in localStorage (`native-site-editor:agents-on:…`); the menu also sets the existing startup key (`agent-history:…`), so the controller mounts it at startup with no boot code added. A reload, a new tab or switching a tab to a remembered site turns agents back on with the existing connections (`resumeAgents` in `src/agent-resume.ts`: re-checks the activation after each await); the site is forgotten when its connections are gone (Disconnect, Cancel, a refused first prompt, an ended sign-in, 8 hours passed, Move agents here for the old site). Turning agents off in one tab turns them off in the site's other tabs.
- **Connections reads**: one at a time (`serialReads`); a resume waits out a read in flight for another activation and reads for itself. Every agent API call has a 15 s deadline (`API_DEADLINE`, headers and body): no answer counts as a network failure, so the menu never stays connecting with no way forward, and a resume read that times out keeps agents on as for a 503.
- **No tab open means waiting**: with a valid permission and no receiving tab, every tool answers at once with `{"state":"waiting","message":"The editor isn't open for <repo> on branch <branch>. Open it and the agent can continue: …"}` and its own steps (sign in, open that repository and branch, make sure remote agents are on, keep the tab open); `get_site` returns `available: false, state: "waiting"`. When a tab opens with agents on, the next call reaches it on the same connection.
- **Automatic takeover** (Lex, 2026-10-22): when the receiving tab closes, another open tab on the same site with agents on takes over by itself, with no Take over click. Tabs elect one at a time (`registry.elect`, a Web Lock) and recheck the owner inside the election, so exactly one receives; the most recently focused tab asks at once, the others after `SUCCESSION_DELAY` (1 s). Explicit Take over still works.
- CONTEXT.md "Agent connection" and the code map describe these rules.

### Tests

- `tests/agent-lifecycle.test.ts`: a permission survives 10 minutes with no tab, tools wait (HTTP 200, not 401) and the same token reaches a tab that opens; the waiting message names the connection's own site and remote agents on; 8-hour end; the grace removes temporary data and keeps the permission; a clean hub is not rewritten; failed clears retry in 30 s, also with two session hubs where one fails; legacy tombstones still refuse until expiry; legacy fenced entries are finished once, or only released when rebound away; one grace does both legacy removal and temporary data; sign-out and revoke deny at once.
- `tests/agent-transport.test.ts`: an idle visible tab stays live for 2 hours on a fake clock; when the owner closes, the remaining tab takes over by itself; with two tabs left the most recently focused one takes over and exactly one receives; explicit Take over still works.
- `tests/agent-menu-resume.test.ts`: `resumeAgents` with `forEachAwait` (site switch, `destroy()`, Disconnect at each await); `serialReads`: skipped reads, two waiters each reading in turn, a rejecting read ahead keeps its rejection, a read that never settles holds its waiter.
- `tests/mcp-oauth.test.ts`: with a 16-hour sign-in, the connect route and OAuth report 8 hours, and after 8 hours the connections list leaves both out.
- `tests/agent-workspace-binding.test.ts`: with a stale shared context for another site, a tool call through `/mcp` waits for the connection's own site.
- `tests/native-save/native-agent-lifecycle.spec.ts`: reload and new tab keep agents on; owner close hands over to the other tab with no click; Disconnect in another tab turns this tab off with no takeover; an unanswered check keeps agents on; a check that never answers times out to on, and a later switch onto a remembered site still resumes; removed elsewhere, ended sign-in, refused first Connect and 8 hours passed each forget the site; in-tab switches to remembered sites, held checks through a switch (removed connection, paused agents); Move agents here.
- `tests/native-save/native-agent-quiet.spec.ts`: after a reload, one connections read and one socket that stays connected through two idle minutes on a fake clock.
- MCP and usage tests expect the waiting answer.

### Commits

- `81fc3bfc` Agent connection stays: 8-hour permission, remembered opt-in, waiting instead of disconnected
- `51e64b4a` Review fixes round 1 (waiting steps, legacy cleanup, CONTEXT wording, boot bytes, three specs)
- `997aa96f` Review fixes round 2 (`resumeAgents` with `forEachAwait`, 8-hour reporting tests, legacy plus live grace)
- `9c87461a` Review fixes round 3 (in-tab switch to a remembered site, read settles on its own answer, forget-path specs, rebound legacy entry)
- `c0863def` Review fixes round 4 (busy reads waited out, expired connections left out of the list)
- `6e98cf33` Review fixes round 5 (`serialReads`, two-hub grace, MCP-level binding test, dead `notSharingMessage` removed)
- `b7684edc` docs: Lex's automatic tab takeover decision
- This round: automatic takeover, API deadline, cross-tab off, `serialReads` failure rows, Done section.

### Review decisions

- Fixed: every Spec, Standards and validation-gap finding in rounds 1–6 except those below.
- Declined: a unit test mounting the real agent menu (no DOM library in the unit runner; the held-check browser specs cover the real ports instead); the waiting result keeps `isError: true` on purpose (nothing was done; commented in `worker/mcp.ts`); the stale `agent-history:` startup mark for a site other than the open one (harmless, heals on the next request check).
- Lead and Lex decisions: reproduction on dev replaced by Lex's preview check; receiving-tab handover became automatic takeover (Lex, 2026-10-22); the boot budget needs no decision after the rebase (342 KB of 355 KB).
- Grok second opinion: not run in the build (builders do not run `kit review`); the slice runs or skips it before landing and records that.

### Evidence

`RESULT` lines for this round are in the build report: `kit unit --affected`, `kit specs --affected` (the MCP specs included), `npm run check`, `npm run lint`, `kit size` (boot 342 KB, budget 355 KB).

### Follow-ups

- Lex, at his end check on the preview editor: idle 10+ minutes with the tab open, refresh, new tab, and close the receiving tab with a second one open.
- Spec (P2): cadeb802:docs/wayfinder/clean-up-before-features/build/tickets/98-agent-connection-stays.md:72 — P2: The Done section's `### Commits` list has the wrong SHAs. I
- Standards (P3): cadeb802:src/agent-transport.ts:503 — P3: `succeed()` starts a `clock.setTimeout` (0 ms or `SUCCESSION_DELAY`) and never keeps the handle. `stop()` (line ~535) 
- Standards (P3): cadeb802:src/agent-transport.ts:510 — P3: Inside the election, after `await ownerPresent()`, the "owner present" branch checks only `epoch === at` before `show(
- Validation gaps (gap): In `tests/agent-transport.test.ts`, nothing covers the path where the owner crashes and leaves its hint (the hint is still in the registry, but its lock is rele
- Validation gaps (gap): Nothing covers the new 15 s `API_DEADLINE` on a mutating call. Only the never-answering GET `connections` is tested. Test to add, in `native-agent-lifecycle.spe
- Validation gaps (gap): There's no test for `succeed()` when `navigator.locks` is missing. In that case `elect` runs `work()` directly and `held()` falls back to comparing the hint. Te

## Comments

- 2026-10-22, Lex: **when the receiving tab closes, another open tab on the same site takes over automatically** (no Take over click, the agent never stalls). Lex will do one real-life check on the preview editor at his end check: idle 10+ minutes, refresh, new tab.
