# Release checklist — Durable Object reduction (ticket 30)

This is the list we follow to put the new agent connection on the live editor, to check it, and to undo it if
something goes wrong. Work top to bottom. Each gate must be ticked before the next one starts.

In short, for Lex:

- Nothing reaches the live editor (editor.techies.tools) until **you say so in writing** (gate 3).
- Before you are asked, the change has passed every local check and every step on the preview editor.
- If something goes wrong after release, we **switch features off**. We never go back to the old version that
  checked for work every few seconds, kept copies of drafts on the server, or re-sent edits.
- We cannot say what the original quota problem was. Nobody has seen the original error, and we cannot see the
  Cloudflare plan. We will only report numbers we measured, for days we can fairly compare.

Sources: [traffic budgets and rollback (ticket 07 answer)](../tickets/07-set-request-budgets-and-rollout.md),
[quota baseline](../research/quota-baseline.md), [handoff: required evidence](../handoff.md#required-evidence-before-release),
[local evidence and preview checklist](validation.md), switches from [ticket 29](tickets/29-rollout-controls.md).

## Gate 1 — local evidence (agents)

- [x] Every row in [validation.md](validation.md) has a passing test on the release commit of `dev`.
- [x] `npm run check`, `scripts/agents/unit.sh`, `npm run lint` and `scripts/agents/kit specs --affected` pass on that commit.
      Record the commit and the kit `RESULT:` lines here.
- [x] `scripts/agents/unit.sh tests/agent-controls.test.ts tests/durable-report.test.ts` passes (switches and this report).

Release commit: `58fd637bc355d4ae972d58e03bf4b68580a87a88` (2026-10-19, lead, 14:45 UTC). Results: `RESULT: ok check` ·
`RESULT: ok lint` · `RESULT: ok unit 4807/4807 (346 files)` · `RESULT: ok unit 16/16` (agent-controls, durable-report) ·
`RESULT: ok specs 186/186 passed` (`kit specs --affected --base origin/main`, includes native-agent-quiet/live/edits/lifecycle).
Every test file named in validation.md exists and ran. `dev` later moved to `eef16b5d` (#103 ticket 13, #104 docs): kit
scripts, kit/review tests and docs only, no app code (#103's `kit pr` ran the full tier and CI was green).

## Gate 2 — preview evidence (release lead)

Target: https://preview-editor.techies.tools (`wrangler.preview.jsonc`, Worker `native-site-editor-preview`).
Use a test account, a disposable repository and branch. Never record passwords, tokens or draft text.
Run every row of the [PREVIEW checklist in validation.md](validation.md#preview--release-lead-only); the rows below
are the ones release depends on. For each, write the deployment version, the time window (UTC) and what you saw.

| # | Check | What to record | Result |
| --- | --- | --- | --- |
| P1 | Signed-in steps | Sign in, open a page, edit, save. Remote agents off: zero agent requests. Remote on: connect an agent, read a file, make one edit, repeat it (one receipt, one Undo step). | **Pass** (`6e751b85`, 13:47–14:02 UTC). Remote off: 0 agent requests, 0 sockets for 11 min visible (menu, edit, save) and after a reload with an existing grant. Manual edit + Publish saved 14:00:20. Remote on: connect, 36 tools, read, `edit_file` applied, same requestId again → same receipt, status applied; one Undo restored the file. DO object: 13 req, 2.1 s active, 3 rows written. [evidence](preview-evidence-2026-10-19.md) |
| P2 | Hibernation | Connected and idle for ten minutes, visible then hidden. DO active duration stops growing between messages; no polling; pings answered automatically. A quiet network log alone is not proof. | **Pass, visible half only** (`6e751b85`, 14:03–14:13). Connected idle 10 min: 0 HTTP requests, 13 ping/pong every 45 s; the relay object had **no** analytics rows (0 req, 0 active time) all 10 min. Next call: `reset` + fresh handshake (isolate had been evicted). Hidden: not measured (T3 browser pins `visibilityState` to visible). [evidence](preview-evidence-2026-10-19.md) |
| P3 | Deployment restart | Deploy preview again while an edit is waiting. The tab reconnects; the lost edit shows as unknown until checked; nothing is re-sent. | **Pass** (row run on `6dcb1f47`, live 14:18:21.8). Edit's command reached the tab 14:18:18.8 with its result held; agent got `unknown` (do not replay); new version took over the same socket with `reset` + handshake; status → applied, change present once; no command re-sent. Socket survived all four deploys; the old instance finished the in-flight call at its 10 s deadline. Loss simulated by holding the result. [evidence](preview-evidence-2026-10-19.md) |
| P4 | Detection vs deletion timing | Close the last editor tab. Record: time closed, time the server noticed, cleanup deadline (noticed + 5 min), time the record was actually deleted. These are four separate times. Sign-in, drafts and App config survive. | **Pass** (`6dcb1f47`). Closed 14:29:51–52.4; noticed by 14:29:53.4; deadline ≈14:34:53; deleted between 14:34:49.3 and 14:34:59.1 (probe 401 "expired or was revoked"; 6 rows written in 14:34). Sign-in, App config and the unsaved draft survived (new tab 14:35). [evidence](preview-evidence-2026-10-19.md) |
| P5 | Watch | Turn Watch on; it stops by itself within ten minutes; at most 25 waits; a separate edit still works after it stops. | **Pass** (`6dcb1f47`). Watch off: wait answered in 0.5 s. Watch on 14:19:05; 23 held waits (≈25 s each, waitsLeft 25→3), stopped by itself 14:29:05 (10 min); later waits immediate with "Watch ended". Edit at 14:29:30 applied. DO ≈57 s active per minute while waiting. [evidence](preview-evidence-2026-10-19.md) |
| P6 | Switches off and on | Deploy preview with one switch `"off"` at a time, then back `"on"`. Each time manual editing and drafts must keep working. **`AGENT_RELAY`**: off shows "Remote agents are paused by the site owner." with Retry and Disconnect MCP; back on, **Retry** reconnects (ticket 29 left this for here). **`AGENT_WATCH`**: off, a wait answers at once with the paused hint; back on, a new Watch activation holds waits again. **`AGENT_LIFECYCLE_CLEANUP`**: off, close the last tab and check the record is still there after its five-minute deadline (postponed 6 h); back on, check it is deleted at the next wake. There is no message for this switch. | **Pass.** Relay off `519dae9d`: agent tools 403/`agents-paused`, menu shows the message with Retry and Disconnect MCP, 0 requests 14:37:49–14:41:09, edits and drafts kept; back on `5c762253`: **Retry** reconnected (1 request, socket). Watch off `5c762253`: wait answered at once with the paused hint; back on `0a4e708d`: new activation held a wait (needed reload + Connect, see observation). Cleanup off `0a4e708d`: record kept 2 min 49 s past its 14:49:06 deadline (1 row written, postponed); back on `3005bc6a` 14:53: still there. Deleted at the next wake: **yes, 20:49 UTC** (object `1303eed4` woke at its 20:49:06 alarm: 1 request, 6 rows written as in P4; the grant's record wrote 3 rows the same minute; the 22:38 rescan found no agent grant left). [evidence](preview-evidence-2026-10-19.md) |
| P7 | Canary cleanup with row counts | See "Canary cleanup" below. Record scanned / classified / deleted / deferred / unknown, DO requests and rows written for the canary window. | **Cleanup complete; no row bounds (needs accounting), no batches run or needed.** Phase A 15:05–15:09 (maintenance on, `7deda2d0`): inventory scanned 129, classified 105, empty 24, deferred/unknown/inaccessible 0 (needs `--limit 100`); plan 2 eligible, both `keys` with a retained wake, **0 `deleteAll`**. Canaries: 15:08:50 `1bd18a14…` `keys`, 1 of 3 keys deleted, **2 rows** written in hour 15, quiet hour 17: 0; its 21:41 wake never ran (it was P6's grant record, deleted at 20:49 by P6's wake: hour 20 5 rows, hour 21 0). 16:02:04 `70d8822f…` kept (changed at 15:13 by other traffic), **0 rows** in hour 16. 17:06: nothing eligible left. Phase B 22:38–22:40: rescan scanned 132, classified 108, empty 24, deferred/unknown/inaccessible 0; `--verify` **complete: true**. Maintenance off and both secrets deleted: live `aba83912` (on, on, on, off, off). [evidence](preview-evidence-2026-10-19.md) |
| P8 | Rollback rehearsal | With all three switches off at once: no reconnect loop, no polling, sign-in and drafts kept, old tabs answered 410 (reload message). Then all back on. | **Pass** (`8b9c4d27`, 14:54–15:00). Old-tab routes 410 `editor-updated`; agent paused; Connect → pause message, then 0 requests and 0 sockets for 5 min; relay object 0 DO requests; after reload still signed in, drafts kept, manual edit works. All back on: `fb3a29a8` 15:00:22 from clean `origin/dev` `eef16b5d` (on, on, on, off, off); agent and `/connections` answer again. [evidence](preview-evidence-2026-10-19.md) |

Gate 2 status (2026-10-19, preview final `aba83912`): P1, P3, P4, P5, P6, P8 pass. Not fully satisfied: **P2** hidden-tab
half not measured (the T3 browser cannot hide a tab); **P7** cleanup is complete and verified, but no row bounds could be set
(no `deleteAll` object, canary 1's own wake never ran), so step 5 stays "needs accounting" and no batches may run.

### Canary cleanup (preview, then production only if authorized)

Only with the lead's go-ahead. The cleanup secrets are set with `wrangler secret put`, never written in a file.

1. Set `AGENT_LEGACY_MAINTENANCE` to `"on"` in the deployment's wrangler file and deploy; set `MAINTENANCE_INVENTORY_TOKEN`
   and `MAINTENANCE_CLEANUP_TOKEN` (each at least 32 characters) as secrets.
2. Inventory: `node scripts/agents/durable-inventory.mjs --account ID --namespace ID --deployment preview --maintenance-url https://preview-editor.techies.tools --limit 10`.
3. Plan (no network): `node scripts/agents/durable-cleanup.mjs … --deployment preview` and read the plan.
4. Canaries, **one at a time**: `node scripts/agents/durable-cleanup.mjs … --delete --limit 1`, each in its own UTC hour with
   nothing else using preview, until it stops with `canary-complete` (ten in total).
5. Row bounds, per canary. From the cleanup checkpoint (main checkout `.scratch/durable-inventory/preview-<namespace>.cleanup.json`)
   record its method (`deleteAll` or `keys`), its key count and any retained wake day. From `durable-report.mjs` (below,
   with that hour as `--after`; it prints raw numbers even when it says not comparable) record rows written in that hour
   minus a quiet hour's rows, and the same for the wake's hour on its later day.
   - The canaries must include at least one `deleteAll` object, one per-key (`keys`) object and one with a retained wake.
   - Pick whole numbers `rowsPerObject` and `rowsPerKey` so that, for **every** canary, its rows are at most
     `rowsPerObject + keys × rowsPerKey`, and its wake's rows at most `rowsPerObject + (keys + 1) × rowsPerKey`
     (this is what the script reserves). Round up and add margin.
   - If any canary could not be measured on its own (other traffic in its hour, no data, a missing method or wake),
     there is no bound: do **not** run batches. Record "needs accounting".
6. Batches only with those bounds (at most 100 per run; the scripts enforce 1,000 maintenance calls and 5,000 written rows
   per UTC day and never raise them): `--delete --canary-verified --rows-per-key N --rows-per-object N`.
7. `node scripts/agents/durable-inventory.mjs … --rescan`, then `node scripts/agents/durable-cleanup.mjs … --verify`. Record its redacted totals. Unknown or
   inaccessible objects mean cleanup is **not** complete.
8. Set `AGENT_LEGACY_MAINTENANCE` back to `"off"` and deploy; delete both secrets.

## Gate 3 — Lex's production authorization

Production deployment needs a separate, explicit instruction from Lex. Ticking gates 1 and 2 is not permission.
Ask Lex in plain words, with the gate 1 and 2 results attached:

> "The new agent connection passed all local checks and the preview steps. Shall we put it on the live editor
> (editor.techies.tools) with the switches below? If anything looks wrong we switch it off; we never go back to polling."

- [x] Lex's answer, date and the commit he approved: "ship it" (after the plain-words summary of gates 1 and 2 and their gaps), 2026-10-21, `b0bf769`. Deployed as production version `3e562baf-da65-4f07-9884-eb69ad472216`. Release step 1 (baseline report) was skipped: no `CLOUDFLARE_API_TOKEN` in the release shell; step 3 (first-hour sign-in, edit, agent) is Lex's.

## Switches to deploy with

Five Worker settings in each wrangler file ([ticket 29](tickets/29-rollout-controls.md)). `"on"`/`"off"`; a missing
value keeps the default; anything else counts as off. The production release uses exactly the values already in
`wrangler.techies.jsonc`:

| Switch | `wrangler.techies.jsonc` (production) | `wrangler.preview.jsonc` | `wrangler.jsonc` (self-host template) | What off does |
| --- | --- | --- | --- | --- |
| `AGENT_RELAY` | on | on | on | Pauses remote agents (403 `agents-paused`, no DO work); existing grants kept; Disconnect still works |
| `AGENT_WATCH` | on | on | on | Waits answer at once with a hint; agents still get requests when they ask |
| `AGENT_LIFECYCLE_CLEANUP` | on | on | on | Postpones agent cleanup by 6 h per object; sign-in expiry still runs |
| `AGENT_LEGACY_MAINTENANCE` | off | off | off | Hides both `/__maintenance/*` routes even with secrets set |
| `AGENT_MODERN_REGISTRATION` | off | off | off | Not built yet; stays off |

## Release steps (release lead, after gate 3)

1. Before deploying, run the baseline report (next section) for the last complete UTC day, so there is a "before".
2. Deploy production with `npm run deploy:techies` from the approved commit. Record the version id.
3. In the first hour: sign in on editor.techies.tools, edit and save a page, connect an agent, read and edit once.
4. Keep watching DO errors and any quota message for one full UTC day. Copy any quota error **word for word**
   with its time (UTC), the path and the dashboard label. Do not call a plain 503 or 429 a quota error.

## Rollback — switch off, never go back

When something looks wrong, turn off the smallest switch that covers it, in the production wrangler file, then
`npm run deploy:techies`. A dashboard edit is undone by the next deploy, so change the file.

| What you see | Switch to turn `"off"` |
| --- | --- |
| Agent connections misbehave, errors or DO traffic jump while agents are used | `AGENT_RELAY` |
| Watch waits run long or cost too much | `AGENT_WATCH` |
| Records deleted too early, or cleanup errors | `AGENT_LIFECYCLE_CLEANUP` |
| Legacy cleanup misbehaves | `AGENT_LEGACY_MAINTENANCE` (and delete its secrets) |
| Not sure | all three of the first rows |

Rules:

- **Never** redeploy an older release that polls for work, sends context heartbeats, keeps drafts on the server or
  replays unknown edits. Turning switches off is the only rollback.
- Switching off keeps sign-in, browser drafts, manual editing and the stored generations. Already open agent
  sockets stay open until the tab reloads; their tool calls are refused by the Worker.
- Old tabs keep calling the removed routes until reloaded. They get a 410 "reload" answer with no DO work, but they
  still count as Worker requests. The report below counts them separately.
- Turn a switch back on only after the check that failed passes on preview again. Then compare windows again.

## Comparing windows after release

`scripts/agents/durable-report.mjs` reads Cloudflare analytics (read only) for one DO namespace and two finished time
windows, and prints DO requests, DO errors, rows read, rows written, active duration and the largest stored-bytes
value. The token comes only from the `CLOUDFLARE_API_TOKEN` environment variable (Account Analytics read; Zone
Analytics read for `--zone`). It prints ids only as short hashes.

```sh
CLOUDFLARE_API_TOKEN=… node scripts/agents/durable-report.mjs \
  --account ACCOUNT_ID --namespace SESSIONS_NAMESPACE_ID \
  --before 2026-10-15T00:00:00Z/2026-10-16T00:00:00Z \
  --after  2026-10-29T00:00:00Z/2026-10-30T00:00:00Z \
  --zone TECHIES_TOOLS_ZONE_ID --host editor.techies.tools
```

- `SESSIONS_NAMESPACE_ID` is the `SessionStore` namespace of the Worker (`native-site-editor-sessions` for production,
  `native-site-editor-preview` for preview), shown in the Cloudflare dashboard under Durable Objects.
- Pick windows of the same length that start on the same UTC weekday and time, the before window wholly before the
  release, the after window wholly after it. Whole UTC days are best (the free daily limits reset at 00:00 UTC).
- A window counts as finished three hours after it ends (`--settle-hours` changes this). Otherwise the report says
  **not comparable** and why, and prints no change. It never prints a saving for unfinished or unlike windows.
- With `--zone` and `--host` it also splits each window: migration (accepted `/__maintenance/*` calls, at least one DO
  call each), stale old tabs (410 answers on removed routes: Worker requests, no DO work), and steady operation (DO
  requests minus migration). Watch cannot be separated: its waits share `/mcp` with every other agent call. Compare a
  window without Watch use to see it. If the zone figures cannot be read for either window, the report says not comparable. The production Worker has `workers_dev` off, so all its traffic goes through
  the zone. Requests from other sites on the zone are excluded by `--host`.
- A dataset that returns nothing for a window shows **no data**, not zero, and gets no change.
- DO errors are listed by invocation status. A status is not proof of a quota error.
- These are analytics aggregates, possibly sampled; they are not billing counts. "Max stored bytes" is the metric's
  largest value, not the total data stored. Before claiming the numbers mean anything, check that the switch values
  and the kind of use (agents, Watch, cleanup runs) in both windows are recorded.
- Record the report's table and `RESULT:` line here with the windows used.

Baseline (before release): `________`  After release: `________`

## What stays unknown

- **The original exhausted quota is still unverified.** On 2026-10-15 the account had 95,517 DO requests, near the free
  plan's 100,000 a day, but that does not show which limit ran out or when. The original error and dashboard label were
  never captured, and the account's plan could not be read (billing access refused).
- So this release can show only changes between measured, comparable windows. It cannot claim the old problem is fixed,
  or give a saving percentage beyond those windows.
- Total stored bytes across all objects, and complete legacy cleanup, stay unknown until the inventory rescan reports
  nothing unknown or inaccessible.
