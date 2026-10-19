# Preview evidence, Gate 2 (2026-10-19)

Raw notes behind the Gate 2 rows P1–P8 in [rollout.md](rollout.md). P7 (canary cleanup): phases A and B (see below).
Worker `native-site-editor-preview`, https://preview-editor.techies.tools. All times UTC.
Release commit `58fd637b` (app code unchanged up to `eef16b5d`, which moved `dev` during the run: docs, scripts and tests only).
Test site: `techiesreviews/Empty` (started with Starter site, published once at 13:46). Browser: T3 preview tab, default profile,
signed in as `techiesreviews`. Agent side: curl JSON-RPC to `/mcp` with the Bearer token from Connect with MCP; the token was
kept in a 0600 scratch file and deleted at the end. No tokens, cookies or draft text are recorded here.

## Before the rows

- The CI preview deploy did **not** deploy: `deploy-preview.yml` runs on every `dev` push but the repository has no
  `CLOUDFLARE_API_TOKEN` secret, so its Deploy step prints "No CLOUDFLARE_API_TOKEN secret yet" and exits 0 (run
  39255263382 for `58fd637b`). The live version at the start was `7bcdbf07` (09:37). So CI could not replace a switch
  deployment during this run, and preview only changes when someone runs `npm run deploy:preview` / `kit preview`.
- Deployed the release commit by hand: `6e751b85-1b8c-4387-9152-e749c52fffa0` (13:44:49), all switches at the committed values.
- Preview SessionStore namespace `7407bb63063b452da0d235ac504b3099`. Analytics: Cloudflare GraphQL
  `durableObjectsInvocationsAdaptiveGroups` and `durableObjectsPeriodicGroups` per minute and per `objectId`, read with the
  wrangler OAuth token. Adaptive/periodic groups are sampled aggregates, not billing. `inboundWebsocketMsgCount` reads 0 for every
  object all day even while the tab sent frames; only `outboundWebsocketMsgCount` moves.
- **Other traffic**: someone else used preview during the whole run (object `b08f9bcc…`, ~200 requests and ~58 GB-s between
  13:45 and 14:20, plus about ten small objects). Namespace totals are therefore not this run's; the numbers below are for this
  workspace's object `1303eed4…` (identified by timing: first seen at the 14:00 connect, frames matching the tab's log).
- Browser limits: the T3 tab only renders while its inline preview is open (with `open: false` requestAnimationFrame never fires and
  the editor canvas never loads), so the tab was opened visible. Its `document.visibilityState`/`hidden` are pinned to "visible"
  as own non-configurable properties, so a **hidden tab could not be produced or simulated**. Network evidence came from a
  fetch/WebSocket wrapper injected into the page (method, path, status, frame type only) plus Resource Timing.

## P1 — signed-in steps (version `6e751b85`)

- Remote off, fresh tab, never connected: load 13:47:45, menu opened 13:49:07 (shows only Connect with MCP). 13:49:08–14:00:29
  (11 min visible, includes the menu, a manual edit and a save): **0 agent requests, 0 sockets**; the only requests were the save
  (`POST /api/publish` 200 at 14:00:20, `/api/snapshot`, `/api/change-status`).
- Manual: added a paragraph (Undo enabled, Publish enabled), Publish → "Saved to GitHub" 14:00:20.
- Remote off with an existing grant (after reload, 14:14:55): menu opened 14:15:18, 0 agent requests, 0 sockets until Connect.
- Remote on: Connect with MCP 14:00:35 → `GET /api/agent/connections`, `POST /api/agent/connect`, `GET /api/agent/connections`,
  one socket (handshake/ready 14:00:37). Agent: `initialize` 200 (14:01:15), `tools/list` 36 tools, `read_file index.html`
  (hash `0fa5b97a…`), `edit_file` requestId `g2-p1-edit-1` → applied (hash `e0da0fab…`) 14:01:44–46, the identical call again →
  the same receipt (applied, same hash) 14:01:46–47, `get_command_status` → applied, same hash. One **Undo** restored the original
  file (read_file hash back to `0fa5b97a…`, marker text gone): one Undo step for the two calls.
- DO (object `1303eed4`): 14:00 3 req, 14:01 10 req, 1.99 s active, 0.255 GB-s, rows read 2 / written 0, 8 frames out; 14:02 3 req.
- Each tool call after a quiet gap began with the relay sending `reset` and the tab re-handshaking (14:01:22, 14:01:45, 14:02:04):
  the object had been evicted and a fresh isolate restored the hibernated socket. Calls 1 s apart did not reset.

## P2 — hibernation (version `6e751b85`)

- Connected idle, tab visible, no tool calls: 14:03:08–14:13:09 (10 min). Tab log: 0 HTTP requests; 13 `ping` → `pong` pairs every
  45 s (14:03:34 … 14:12:35); no other frames.
- DO object `1303eed4` per minute: **no rows at all 14:03–14:13** (0 requests, 0 active time, 0 rows, 0 frames), so pings were
  answered by the auto-response without waking the object and active duration did not grow between messages.
- Hidden half: **not measured** (the browser tool cannot hide a tab; see limits above).

## P3 — deployment restart (versions `1c301438`, `685e1f53`, `36ceb129`, `6dcb1f47`)

Four redeploys of the same commit with `npm run deploy:preview`. The wrapper held the tab's `result` frames when asked, so an edit
could be waiting while the new version went live.

1. 14:13:57 upload; tab main thread busy 14:14:01.7–14:14:31.7; edit `g2-p3-edit-1` 14:14:03 → `failed`, "The editor did not receive
   this (timeout). Nothing was changed" (the restored socket had not handshaken, so the command was never sent; no command frame in
   the tab). Version `1c301438`. Later `get_command_status` → unknown ("not found").
2. Version `685e1f53` (created 14:15:50) went live before the edit (14:15:52), so this was not a restart test. Edit `g2-p3-edit-2`
   applied in the tab, result held → agent got **unknown** "Check get_command_status; do not replay"; after releasing,
   `get_command_status` → applied.
3. Same with version `36ceb129` (live 14:17:30.7, edit 14:17:30.9). Edit `g2-p3-edit-3` → unknown, then status → applied.
4. **The restart row**: edit `g2-p3-edit-4` sent 14:18:17.5, command reached the tab 14:18:18.78 (result held), version `6dcb1f47`
   went live 14:18:21.77, the relay sent `cancel` at the 10 s deadline 14:18:28.75 and the agent got **unknown** (timeout, "do not
   replay"). Releasing the held result at 14:18:42.87 woke the new version: `reset` → handshake → ready (14:18:43.0), the stale result
   was ignored. `get_command_status` 14:18:45 → **applied** (hash `47b933b8…`); the file has the change exactly once. No command was
   re-sent by the relay or the tab (one command frame per request id in all four runs).
- The tab's socket never closed across the four deploys (one socket 14:15:23 → tab close 14:29:51); every new version took it over
  with `reset` + fresh handshake on its next event. The deploy did not abort the in-flight call: the old instance finished it at its
  deadline. The "waiting edit" was produced by holding the tab's result, not by a real network loss.
- DO object `1303eed4`: 14:14–14:18 about 10 s active per minute (the 10 s deadlines), 1 DO error in 14:15 (status not read).

## P4 — detection vs deletion (version `6dcb1f47`)

Probe: `read_file` with the token every 10 s from 14:29:52.
1. Last editor tab closed: 14:29:51–14:29:52.4 (`t3_preview_close` returned before 14:29:52.400).
2. Server noticed: by 14:29:53.45 (first probe 14:29:52.585, 0.87 s: "The editor tab is not sharing a site right now"); the
   object wrote 2 rows in 14:29.
3. Cleanup deadline (noticed + 5 min): about 14:34:52–14:34:53.
4. Deleted: between 14:34:49.3 (last probe still "not sharing") and 14:34:59.14 (HTTP 401 "Agent connection expired or was
   revoked."). The object wrote 6 rows in 14:34 (12 read), nothing else in 14:30–14:33 beyond the probes (5–6 requests, ~20 ms a minute).
- Survived: a new tab at 14:35:13 was still signed in (`/api/session` 200), listed repositories and opened Empty (App config intact),
  and showed the unsaved draft (Publish 1, the agent's last change on the page).

## P5 — Watch (version `6dcb1f47`)

- Watch off: `wait_for_requests` 14:18:58 answered in 0.48 s, `requests: []`, hint "Do not call wait_for_requests again on your own".
- Watch turned on 14:19:05 ("until 4:29 PM (9:59 left, 25 waits left)"). Back-to-back waits (waitSeconds 25): held waits 14:19:11
  (25.1 s), one interrupted client call (curl stopped; the server kept that wait open, so the next 14 calls 14:19:49–59 answered at
  once "Another wait for this site's requests is already open (one at a time)" and did not use the budget), then 14:20:32–14:28:27
  twenty held waits of 24.2–25.2 s (waitsLeft 22 → 3), the last 14:28:52 held 13.0 s and ended at the deadline 14:29:05
  ("The user's Watch ended, so stop waiting"). 13 more calls 14:29:05–18 each answered in 0.2–1.5 s with the same hint.
- **Stopped by itself at 14:29:05.09, 10 min after turning on; 23 waits held (≤ 25)**. The menu then read "Watch paused at 4:29 PM."
- Separate edit after: `g2-p5-edit-1` 14:29:30 → applied.
- DO object `1303eed4` during Watch: about 57 s active per minute, 7.3 GB-s per minute (14:20–14:27), 4–6 requests a minute; 14:28
  31.7 s; 14:29 0.25 s. Watch waits are the cost Watch is meant to have.

## P6 — switches one at a time

New connection 14:36:29 (new token; the old one was deleted in P4).

**`AGENT_RELAY` off — version `519dae9d-2bec-49d5-9878-e83fd8ef4a97` (live 14:37:06).**
- Agent: `tools/call read_file` → 200 with tool error "Remote agents are paused by the site owner." (`agents-paused`);
  `tools/list` → 403 JSON-RPC -32003 same text; `POST /api/agent/connect` → 403.
- The already-open socket stayed open (ping/pong 14:37:14).
- After reload, menu opened: 0 requests. Connect with MCP 14:37:48 → one `GET /api/agent/connections` 403, the menu shows
  "Remote agents are paused by the site owner." with **Disconnect MCP** and **Retry**, no socket. 14:37:49–14:41:09: 0 requests,
  0 sockets (no reconnect loop, no polling).
- Manual edit (added a paragraph) 14:38; after reload 14:41:15 still signed in, the paragraph and the agent's earlier draft kept.

**`AGENT_RELAY` back on, `AGENT_WATCH` off — version `5c762253-6976-4f1c-9982-ec6dbc2e88b9` (live 14:41:58).**
- The tab still showed the pause (Connect clicked 14:41:36). **Retry** 14:42:13 → one `GET /api/agent/connections` 200, socket
  handshake/ready 14:42:14.9, menu "Disconnect MCP" — reconnected with the existing grant, no new token.
- Watch off: the menu shows "Watch is paused by the site owner."; `wait_for_requests` (waitSeconds 25) 14:42:21 answered in 1.1 s
  with hint "Watch is paused by the site owner. Agents still get requests when they ask."
- Agent edit `g2-p6-watchoff-edit` → applied; manual paragraph added; Undo enabled.

**`AGENT_WATCH` back on, `AGENT_LIFECYCLE_CLEANUP` off — version `0a4e708d-a128-4661-af73-96f931c60d91` (live 14:42:53).**
- The connected tab kept showing "Watch is paused by the site owner." (no button) after the deploy, after opening the menu and after a
  focus event: the menu only re-reads `/api/agent/connections` on Connect / consent checks / while waiting, so a connected tab does not
  learn that Watch is back on. After reload + Connect with MCP (14:43:42, one `/connections` 200) it showed "Watch again"; Watch
  14:43:51 "until 4:53 PM (25 waits left)"; `wait_for_requests` (waitSeconds 5) 14:43:53 held 6.5 s, waitsLeft 24. Stop watching 14:44:05.
- Cleanup off: last tab closed 14:44:05.5–14:44:06.1 (first probe 14:44:06.5 already "not sharing"); deadline about 14:49:06.
  Probes every 30 s 14:44:06–14:51:55: always "not sharing", never 401, so the grant was kept 2 min 49 s past its deadline. The
  object wrote 1 row in 14:49 (4 read): the alarm rewrote its deadline (postponed 6 h) instead of the 6 rows of P4's deletion.
  Other minutes 14:44–14:51: only the probes (2 requests, under 10 ms active a minute). DO statuses other than success all day for
  this object: four `clientDisconnected` (14:15, 14:36, 14:42, 14:43 = tab reloads/closes).

**`AGENT_LIFECYCLE_CLEANUP` back on — version `3005bc6a-d4a4-4535-bc93-ce7a04d85e96` (live 14:53:10), all three on.**
- 14:53:20 probe: still "not sharing" (grant still there; nothing deletes it before the postponed wake).
- **Deleted at the next wake: not measured.** The postponed wake is about 20:49 UTC (alarm 14:49 + 6 h), after this run. The
  grant was deliberately left untouched for it (no tab connected afterwards: a handshake would clear the pending cleanup). Re-check:
  object `1303eed4…` in `durableObjectsPeriodicGroups` should show rows written (about 6, as in P4 14:34) in the 20:49 minute, and
  the editor's Connect with MCP for Empty should then find no connected agent (`/api/agent/connections` grants 0 instead of 1).
- **Re-checked 22:36–22:40 (P7 phase B): deleted at the next wake, 20:49 UTC.** Object `1303eed4…` (alarm 20:49:06 in the phase A
  manifest) in 20:49: 1 request, 6 rows written, 8 read, 0.51 s active, the same 6 rows as P4's deletion at 14:34. In the same
  minute object `1bd18a14…` wrote 3 rows (and 2 more at 20:59); that object is this grant's record (created at the 14:36
  connection with 3 rows written, read by every probe 14:44–14:51). Nothing else touched either object 15:09–20:48. The 22:38
  rescan found `1303eed4…` with 2 keys (lifecycle and workspace ledger, no alarm) and `1bd18a14…` with 0 keys; no agent grant is
  left in the namespace. `/api/agent/connections` was not read (it needs a signed-in browser tab).

## P8 — rollback rehearsal

**All three off — version `8b9c4d27-511d-4e96-8a2d-d7c404d00cbf` (live 14:54:09).** Tab loaded 14:53:30 under the all-on version.
- Old-tab routes from that tab: `GET /api/agent/hub`, `POST /api/agent/context`, `POST /api/agent/claim` → **410**
  `editor-updated` "This editor was updated. Reload this tab to keep using agents." (also 410 without a cookie).
- Agent: `wait_for_requests` and `read_file` → tool error "Remote agents are paused by the site owner." (`agents-paused`).
- Menu: Connect with MCP 14:54:26 → one `GET /api/agent/connections` 403, the pause message with Disconnect MCP and Retry, no socket.
  **14:54:27–14:59:35: 0 requests, 0 sockets** (no reconnect loop, no polling).
- Reload 14:59:38: signed in (`/api/session` 200), drafts kept (Publish 1, earlier agent and manual changes on the page), 0 agent
  requests on load; a manual paragraph added, Undo enabled.
- DO object `1303eed4`: **0 requests 14:54–14:59** (one probe each in 14:53 and 15:00). Namespace 14:54:10–15:00:20: 32 requests,
  all on other objects (other users and this tab's ordinary session calls).

**All back on — version `fb3a29a8-7856-46cc-a5c9-eea8a1e7a837` (live 15:00:22),** deployed with `npm run deploy:preview` from an
unmodified tree at `origin/dev` `eef16b5d` (no app change since `58fd637b`); vars `"on","on","on","off","off"`.
- 15:00:43 agent probe: "not sharing" (relay serving again, no tab connected); `tools/list` 200. Tab
  `GET /api/agent/connections` 200, `controls.watch: true`, 1 grant (the P6 grant waiting for its 20:49 wake).

## P7 phase A — inventory, plan, first canary (versions `1e720519`, `418fb9c6`, `7deda2d0`)

Lead's go-ahead for preview only. `AGENT_LEGACY_MAINTENANCE` set to `"on"` in `wrangler.preview.jsonc` (uncommitted) and
deployed with `npm run deploy:preview`: version `1e720519-3d21-4f17-81ce-12359d1d1339` (15:05:53), switches on, on, on, **on**, off.
`MAINTENANCE_INVENTORY_TOKEN` and `MAINTENANCE_CLEANUP_TOKEN` (64 hex each, random) put with `wrangler secret put` from stdin:
versions `418fb9c6-a31d-4c21-92eb-eddcd7453929` (15:06:07) and `7deda2d0-f1dc-4cba-802d-6be7eb413323` (15:06:10, live).
Deviation from rollout step 1: the hourly job needs the two values, so they are kept in one 0600 scratch file (not committed,
never printed); the lead shreds it when P7 ends.

**Inventory** (`durable-inventory.mjs`, namespace `7407bb63…`, manifest in the main checkout `.scratch/durable-inventory/`).
- `--limit 10` (as written in step 2) cannot list: the script asks the object-list API for `max(10, limit − processed)` ids and
  the API answers **400, code 10077 "Malformed parameter: limit is too low" for every limit below 100** (checked 10, 11, 20,
  50, 99; 100 and 1000 work). The run 15:06:29 ended `paused` with nothing scanned (0 maintenance calls). Ticket 27's "list API
  minimum of 10" is wrong; see product observation 4. The remaining passes used `--limit 100` (the script's maximum).
- 15:07:16 `limited` (100 listed, 80 classified, 20 empty); 15:07:52 `paused` (129 / 105 / 24; the follow-up list of 71 hit the
  same 400); 15:08:04 **`complete`**: **scanned 129, classified 105, empty 24, deferred 0, unknown 0, inaccessible 0, pending 0**,
  permission confirmed. 105 maintenance calls charged (namespace budget, UTC day 2026-10-19).
- Records found: sign-in session 3, app config 1, repository cache 6 preserved + 2 expired, agent grant 2, legacy agent hub 3
  (all `preserve`, none `legacy-candidate`), agent lifecycle 4, alarm deadlines 9, workspace ledger 4. No unknown or review records.

**Plan** (`durable-cleanup.mjs` without `--delete`, no network), 15:08: eligible **2**, deferred 0, review 0,
awaiting-browser-recovery 0, oversized 0, needs-reinventory 0. Both eligible objects have the same shape: 3 keys, one expired
orphan repository cache, plus a live agent grant and its alarm deadlines (`preserve`). So both are **per-key (`keys`) with a
retained wake on 2026-10-19**; **no `deleteAll` object exists**.
- `1bd18a14…`: grant expires 21:41:20 UTC (retained wake then).
- `70d8822f…`: grant expires 15:31:04 UTC, before its canary hour; its own expiry may rewrite the object, in which case its canary
  is deferred `changed` (safe: nothing written) and needs a rescan.

**First canary** (`--delete --limit 1`), 15:08:49.7–15:08:50.5 UTC (hour 15, no earlier canary; the read-only inventory touched
the same objects at 15:07):
`RESULT: limited durable-cleanup {"scanned":129,"classified":105,"deleted":1,"deferred":1,...,"unresolvedCommands":0,"complete":false}`
(`limited` = stopped at `--limit 1`; the script exits 1 for it). Checkpoint (main checkout
`.scratch/durable-inventory/preview-7407bb63….cleanup.json`): object `1bd18a14…` (hash `6a218001…`), status deleted, **method
`keys`, 3 keys, 1 deleted, retained wake day 2026-10-19** (at about 21:41 UTC), allowance 2. Budget after: 107 calls today.
Row accounting (rollout step 5) is the lead's: object `1bd18a14…`, rows written in hour 15 and in its wake's hour 21.

**Remaining canaries**: kit job `p7-canaries` (`.scratch/p7-canaries.sh`, log `.scratch/p7-canaries.log`, both uncommitted),
started 15:09:41. It runs exactly one `--delete --limit 1` at HH:02 UTC of each new hour (first 16:02) and stops on
`canary-complete`, at ten canaries in total, when a run adds no canary (nothing eligible left), or on any error (exit non-zero).
With 2 eligible objects it should run `70d8822f…` at 16:02 and stop at 17:02. No batches or `--canary-verified` were run.
Since no `deleteAll` canary can exist, rollout step 5 cannot give bounds; but nothing is left for batches after the two canaries.
`AGENT_LEGACY_MAINTENANCE` stays on and both secrets stay set until the lead finishes P7 (steps 7–8).

## P7 phase B — canary 2, row accounting, rescan, verify, switch-off (versions `7deda2d0` → `aba83912`)

**Canary 2** (job `p7-canaries`) 16:02:04: `RESULT: complete durable-cleanup {"scanned":129,"classified":105,"deleted":1,`
`"deferred":0,"unknown":0,...,"complete":false}`; object `70d8822f…` (checkpoint key `5ce7f606…`) **kept**, 0 of 3 keys
deleted, no method, wake day 2026-10-19. The 17:02 run stopped on a transient `wrangler whoami` failure; the lead ran it by hand
at 17:06:05: nothing left (plan eligible 2, both handled), so the canary set is two objects. Both maintenance tokens were exposed
in a session log at about 17:05 and rotated at once (`wrangler secret put`); they are now deleted (below).

**Row accounting (rollout step 5).** Checkpoint `.scratch/durable-inventory/preview-7407bb63….cleanup.json` (main checkout);
checkpoint keys are hashes, matched to objects by the `expected` fingerprint in the manifest. Rows from GraphQL
`durableObjectsPeriodicGroups` per `objectId` and minute (sampled aggregates, not billing), read 22:36–22:40.

| Canary | Object (checkpoint key) | Method, keys, retained wake | Canary hour rows written | Quiet hour (17) | Wake hour rows written |
| --- | --- | --- | --- | --- | --- |
| 1, 15:08:50 | `1bd18a14…` (`6a218001…`) | `keys`, 3 keys, 1 deleted; wake 2026-10-19 21:41:20 | hour 15: **2** (all in 15:08; 15:00 and 15:07 were reads with 0 rows) | 0 | hour 21: **0**; the 21:41 wake never ran. Hour 20: 5 (3 at 20:49, 2 at 20:59) from P6's cleanup deleting this grant record, not from the canary |
| 2, 16:02:04 | `70d8822f…` (`5ce7f606…`) | kept, no method, 3 keys, 0 deleted; wake day 2026-10-19 (manifest alarm 15:31:04, before the canary) | hour 16: **0** (1 request, 1 row read) | 0 | not observed: 3 rows at 15:13 (before the canary, other traffic; why it was kept), nothing after 16:02 to 22:40; the rescan found it with 0 keys |

- Quiet hour: the whole namespace had no analytics rows 17:00–19:59, so the quiet-hour subtraction is 0 for both objects.
- Other traffic: hour 15 also had the read-only inventory touching all 129 objects and other users' objects writing rows; hour 16
  had two other objects; hour 20 had P6's wake. Per-object numbers exclude them, but canary 1's wake could not be seen on its own.
- **Result: no bound.** There is no `deleteAll` object, canary 1's wake never ran on its own, and canary 2 deleted nothing, so
  `rowsPerObject`/`rowsPerKey` cannot be picked (step 5: "needs accounting"). **No batches were run, and none are needed**:
  nothing eligible was left after the two canaries.

**Rescan and verify (step 7).** `durable-inventory.mjs --rescan --limit 100`: 22:38:01 `limited` (100 scanned, 80 classified,
20 empty); resumed 22:38:32 `paused` (132 / 108 / 24; the follow-up list below 100 hit code 10077 again); 22:38:49 **`complete`**:
`RESULT: complete durable-inventory {"scanned":132,"classified":108,"deferred":0,"unknown":0,"inaccessible":0,"empty":24,`
`"pending":0,"complete":true}`, permission confirmed, list complete. Records: agent lifecycle 4, workspace ledger 4, alarm
deadlines 1, repository cache 3 (preserve), sign-in session 1, app config 1; no agent grant, legacy hub, expired cache or unknown
record. `durable-cleanup.mjs --verify` 22:39:08:
`RESULT: complete durable-cleanup {"scanned":132,"classified":108,"deleted":1,"deferred":0,"unknown":0,"review":0,`
`"inaccessible":0,"reappeared":0,"unresolvedCommands":0,"complete":true}` — **verification passed**, nothing unknown or
inaccessible. Maintenance calls charged on UTC day 2026-10-19: 217 (limit 1,000).

**Switch-off (step 8).** `wrangler.preview.jsonc` restored (`git checkout`), clean tree at `b25ed9d0` (app code = `eef16b5d`),
`npm run deploy:preview`: version `4e9dafa5-7bd7-42f4-849f-23cefe0cc013` (22:39:31), vars on, on, on, off, off.
`wrangler secret delete MAINTENANCE_INVENTORY_TOKEN` → `05be07d5-2b78-4f15-be11-608611cb80b3` (22:39:59);
`MAINTENANCE_CLEANUP_TOKEN` → `aba83912-7016-42bc-8305-b07a75c4f4c6` (22:40:02, **live**, same vars). `wrangler secret list`: neither
secret left. `POST /__maintenance/inventory` → 404. The scratch secrets file, the helper and the job script were shredded.

## Product observations

1. **Connected tab does not learn that Watch is back on** (minor). After `AGENT_WATCH` returns to "on", a tab that was connected
   while it was off keeps "Watch is paused by the site owner." with no button, even after opening the menu or focusing the window;
   it only re-reads `/api/agent/connections` on Connect, consent checks or while waiting. Reload + Connect fixes it. Version
   `0a4e708d`, 14:42:53–14:43:42. This matches ticket 29's "learns it on its existing explicit reads (no new requests)", but the
   owner's "back on" is invisible to an open tab.
2. **CI does not deploy preview** (no `CLOUDFLARE_API_TOKEN` secret; see above), so preview was 5 h behind `dev` before this run.
3. An interrupted client call (curl killed) left its Watch wait open on the server until its 25 s ran out; the following calls were
   answered "Another wait … is already open (one at a time)" without using the wait budget. Expected by design; noted for agents.
4. **Inventory cannot list with `--limit` below 100** (P7). The Cloudflare object-list API rejects `limit` < 100 (400, code 10077),
   but `durable-inventory.mjs` asks for `max(10, limit − processed)`, so `--limit 10` (rollout step 2) never lists and every pass
   that tops up a page below 100 stops `paused`. Fix: always list 100 (or more) and keep extras pending; update step 2.

## Known issues found during release checks

1. `durable-inventory.mjs` with `--limit` below 100 fails: Cloudflare's object-list API answers 400, code 10077 ("limit is too
   low"), and a pass that tops up a page below 100 stops `paused` (observation 4; rollout step 2 says `--limit 10`).
2. A tab connected while Watch was off keeps "Watch is paused by the site owner." after Watch is back on, until reload
   (observation 1).
3. P2's hidden-tab half is not measurable in the T3 browser (`visibilityState` is pinned to "visible").

## Deployments made (all `npm run deploy:preview` from the worktree)

| Time | Version | Switches (relay, Watch, lifecycle, legacy, modern) | Why |
| --- | --- | --- | --- |
| 13:44:49 | `6e751b85-1b8c-4387-9152-e749c52fffa0` | on, on, on, off, off | release commit `58fd637b` (preview was `7bcdbf07`) |
| 14:14:02 | `1c301438-48b6-4b23-81fd-a7affbed1381` | committed | P3 restart 1 |
| 14:15:50 | `685e1f53-3978-4e4f-a25a-8353662ad861` | committed | P3 restart 2 |
| 14:17:30 | `36ceb129-3ac6-405a-b0dc-33add3e2657d` | committed | P3 restart 3 |
| 14:18:21 | `6dcb1f47-1a00-4cce-99c4-8f7f9324fed1` | committed | P3 restart 4 (the row) |
| 14:37:06 | `519dae9d-2bec-49d5-9878-e83fd8ef4a97` | off, on, on, off, off | P6 relay off |
| 14:41:58 | `5c762253-6976-4f1c-9982-ec6dbc2e88b9` | on, off, on, off, off | P6 relay on, Watch off |
| 14:42:53 | `0a4e708d-a128-4661-af73-96f931c60d91` | on, on, off, off, off | P6 Watch on, cleanup off |
| 14:53:10 | `3005bc6a-d4a4-4535-bc93-ce7a04d85e96` | on, on, on, off, off | P6 cleanup on |
| 14:54:09 | `8b9c4d27-511d-4e96-8a2d-d7c404d00cbf` | off, off, off, off, off | P8 rollback |
| 15:00:22 | `fb3a29a8-7856-46cc-a5c9-eea8a1e7a837` | on, on, on, off, off | final, clean tree at `origin/dev` `eef16b5d` |
| 15:05:53 | `1e720519-3d21-4f17-81ce-12359d1d1339` | on, on, on, on, off | P7 phase A, legacy maintenance on (from `9ec761d8`, app code = `eef16b5d`) |
| 15:06:07 | `418fb9c6-a31d-4c21-92eb-eddcd7453929` | on, on, on, on, off | P7 secret `MAINTENANCE_INVENTORY_TOKEN` |
| 15:06:10 | `7deda2d0-f1dc-4cba-802d-6be7eb413323` | on, on, on, on, off | P7 secret `MAINTENANCE_CLEANUP_TOKEN` |
| ~17:05 | (secret changes) | on, on, on, on, off | P7 both maintenance secrets rotated after exposure |
| 22:39:31 | `4e9dafa5-7bd7-42f4-849f-23cefe0cc013` | on, on, on, off, off | P7 end, clean tree `b25ed9d0` (app code = `eef16b5d`) |
| 22:39:59 | `05be07d5-2b78-4f15-be11-608611cb80b3` | on, on, on, off, off | secret `MAINTENANCE_INVENTORY_TOKEN` deleted |
| 22:40:02 | `aba83912-7016-42bc-8305-b07a75c4f4c6` | on, on, on, off, off | secret `MAINTENANCE_CLEANUP_TOKEN` deleted (live) |

The switch changes were never committed.
