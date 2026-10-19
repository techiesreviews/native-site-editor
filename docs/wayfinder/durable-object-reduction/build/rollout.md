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

- [ ] Every row in [validation.md](validation.md) has a passing test on the release commit of `dev`.
- [ ] `npm run check`, `scripts/agents/unit.sh`, `npm run lint` and `scripts/agents/kit specs --affected` pass on that commit.
      Record the commit and the kit `RESULT:` lines here.
- [ ] `scripts/agents/unit.sh tests/agent-controls.test.ts tests/durable-report.test.ts` passes (switches and this report).

Release commit: `________`  Results: `________`

## Gate 2 — preview evidence (release lead)

Target: https://preview-editor.techies.tools (`wrangler.preview.jsonc`, Worker `native-site-editor-preview`).
Use a test account, a disposable repository and branch. Never record passwords, tokens or draft text.
Run every row of the [PREVIEW checklist in validation.md](validation.md#preview--release-lead-only); the rows below
are the ones release depends on. For each, write the deployment version, the time window (UTC) and what you saw.

| # | Check | What to record | Result |
| --- | --- | --- | --- |
| P1 | Signed-in steps | Sign in, open a page, edit, save. Remote agents off: zero agent requests. Remote on: connect an agent, read a file, make one edit, repeat it (one receipt, one Undo step). | not yet measured |
| P2 | Hibernation | Connected and idle for ten minutes, visible then hidden. DO active duration stops growing between messages; no polling; pings answered automatically. A quiet network log alone is not proof. | not yet measured |
| P3 | Deployment restart | Deploy preview again while an edit is waiting. The tab reconnects; the lost edit shows as unknown until checked; nothing is re-sent. | not yet measured |
| P4 | Detection vs deletion timing | Close the last editor tab. Record: time closed, time the server noticed, cleanup deadline (noticed + 5 min), time the record was actually deleted. These are four separate times. Sign-in, drafts and App config survive. | not yet measured |
| P5 | Watch | Turn Watch on; it stops by itself within ten minutes; at most 25 waits; a separate edit still works after it stops. | not yet measured |
| P6 | Switches off and on | For each of `AGENT_RELAY`, `AGENT_WATCH`, `AGENT_LIFECYCLE_CLEANUP`: deploy preview with it `"off"`, check the paused message and that manual editing and drafts still work, then back `"on"` and check **Retry** reconnects (ticket 29 left this on-again Retry for here). | not yet measured |
| P7 | Canary cleanup with row counts | See "Canary cleanup" below. Record scanned / classified / deleted / deferred / unknown, DO requests and rows written for the canary window. | not yet measured |
| P8 | Rollback rehearsal | With all three switches off at once: no reconnect loop, no polling, sign-in and drafts kept, old tabs answered 410 (reload message). Then all back on. | not yet measured |

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

- [ ] Lex's answer, date and the commit he approved: `________`

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
  window without Watch use to see it. The production Worker has `workers_dev` off, so all its traffic goes through
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
