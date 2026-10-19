# Transport validation — ticket 26

Local evidence only. No deployment was made. Budgets come from ticket 07's Answer and the handoff release gates.
Existing tests from tickets 01 and 13–25 remain the detailed fault and race evidence.

DO calls, storage keys and V8-serialized written bytes come from `tests/fakes/counted-agent.ts`.
Cap bytes use each protocol's UTF-8 serialization. Socket frames and wire bytes use the harness socket counters.
These are local call/key/byte counts. They are not Cloudflare billing measurements.
Initialization, GitHub work, messages and lifecycle work are separate categories in the test diagnostics.
The budget fixture supplies browser replies to isolate server dispatch cost. Browser commits have separate evidence.
The browser specs use the real fixture relay without relay page mocks.
The fixture carries dispatch cancel keys and intake cancellation signals and handles /relay/cancel.
It has two sign-in-scoped hooks: `/__demo/relay-reset` (orderly reset, sockets kept, like a restore after
hibernation) and `/__demo/relay-restart` (server closes every socket with 1012 and drops the relay, like a deployment).
Miniflare proves workerd upgrade and auto-response behavior. A passing fixture does not prove hibernation.

In the table, **B** means `tests/agent-runtime-budget.test.ts` and **L** means `tests/native-save/native-agent-lifecycle.spec.ts`.
Other test files are written in full. Titles after each file identify the test to run.

| Scenario | Accepted budget | Measured local count | Test name (file + title) |
| --- | --- | --- | --- |
| Remote-off startup | 0 hub calls, uploads, agent storage writes | 0 hub calls, 0 uploads, 0 written keys. Server authentication route only. | B — remote-off startup: server routes cause 0 hub calls, 0 uploads, 0 agent keys written |
| Remote-off menu | Same zero budget | Same server counts; browser menu behavior is separate below. | B — remote-off menu open: server routes cause 0 hub calls, 0 uploads, 0 agent keys written |
| Remote-off visible idle | Same zero budget | Same server counts; no browser simulation here. | B — remote-off idle visible: server routes cause 0 hub calls, 0 uploads, 0 agent keys written |
| Remote-off hidden idle | Same zero budget | Same server counts; no browser simulation here. | B — remote-off idle hidden: server routes cause 0 hub calls, 0 uploads, 0 agent keys written |
| Remote-off browser states | 0 agent HTTP calls | 0 during startup, menu, visible and hidden clock intervals, including with an existing grant. | `tests/native-save/native-agent-quiet.spec.ts` — remote agents off: startup, the agent menu and idle visible or hidden tabs make no agent-hub calls, even with a connected agent |
| Quiet connected idle | 0 polling calls, written keys or alarms | 300,000 virtual ms; 0 calls, 0 written keys/bytes, 0 alarms delivered or scheduled. Handshake excluded. | B — quiet connected idle: 300000 virtual ms, 0 polling calls, 0 keys written, 0 alarms |
| Authorized read | ≤4 control-path DO invocations | 3 authentication + 1 dispatch; 6 authentication keys read; 0 relay storage keys read/written; 0 GitHub fetches; command 255 wire bytes + result 213 wire bytes. | B — already-authorized read_file: <=4 control-path DO calls (3 authentication + 1 dispatch) |
| Authorized edit | ≤4 control-path DO invocations | Same call/key counts; command 412 wire bytes + result 252 wire bytes. Fixture replies isolate dispatch; actual application is covered below. | B — already-authorized write_file: <=4 control-path DO calls (3 authentication + 1 dispatch) |
| Initialization | Separate from steady calls | 4 authentication calls; 1 use-grant key written, 264 V8-serialized bytes in this fixture. | `tests/agent-usage.test.ts` — MCP authentication measures three calls; first use adds only use-grant |
| Runtime socket | Hibernation-compatible handshake and heartbeat | Miniflare HTTP 101, ready frame, automatic ping/pong. No local duration or hibernation measurement. | B — Miniflare SessionStore: real hibernatable upgrade / handshake / auto pong |
| Watch activation | ≤25 waits, ≤25 s each, ≤10 minutes; explicit renewal | 24 empty 25 s holds reach 600,000 virtual ms; later calls are quiet. Focused test below exhausts 25 shorter waits. | B — Watch: <=25 waits per activation, <=25000 ms each, <=600000 ms total; 0 server storage |
| Watch cap / shared admission | One outstanding wait per workspace; ≤25 per activation | One workspace wait; 25-call cap; duration clipped to Watch end and relay budget. | `tests/agent-watch.test.ts` — Watch: at most 25 waits per activation, each held at most 25 s and within the relay's budget; Stop releases a held wait |
| Watch call/duration cost | Separate from quiet idle; 0 storage polling | Each wait: 3 authentication + 1 dispatch, 0 relay storage keys. Quiet 0 ms; empty Watch 24,000 ms; wake after 5,000 ms. | `tests/agent-watch.test.ts` — usage harness: idle quiet wait vs Watch wait over the real relay — 3 auth + 1 dispatch each, 0 storage polling; expiry keeps the grant and edits |
| Duplicate edit | Recorded result; never reapplied | 1 browser draft, 1 receipt, 1 revision. Browser record layer only. | B — duplicate edit: recorded browser outcome, 1 receipt and 1 revision |
| Duplicate through browser relay | No second draft or Undo step | Repeated edit and status return the receipt; one Undo restores original; server file unchanged. | `tests/native-save/native-agent-edits.spec.ts` — socket edits apply once; duplicate requestId and status return the receipt without another draft or Undo step |
| Lost or timed-out result | 10 s total deadline; unknown; no replay | 10,000 virtual ms; 1 delivery; 0 replay; 0 payload keys/bytes written. | B — lost or timed-out edit: unknown at 10000 ms, 0 replay, 0 payload keys written |
| Transient reconnect | ≤5 attempts / 2 minutes; backoff; Retry-After | Two tabs share five attempts, then pause. Silent-loss latency is simulated. | `tests/agent-recovery.test.ts` — two tabs share five read attempts with exponential delays, then remain paused; Retry-After delays automatic and manual reads; an excessive cooldown pauses |
| Network / daily quota / authentication | Distinct recovery; sign-in preserved | Injected DO daily-duration error returns 503 quota metadata; network stays transient; signed-out stays authentication; sign-in unchanged. | B — network / daily quota / auth remain distinct; quota-shaped Worker response preserves sign-in |
| Quota pause / manual recovery | 0 automatic attempts; one controlled manual attempt; honor cooldown | Two tabs pause indefinitely; manual Retry is single-flight. | `tests/agent-recovery.test.ts` — quota pauses both tabs indefinitely; manual Retry is single-flight and clears both |
| Failed ledger writes / unreachable ledger | Fail closed before allocation | 1 injected failed write; unreachable ledger returns 503; 0 grant allocations. | B — failed ledger write and unreachable ledger: 0 grants allocated, fail closed |
| Browser storage fault | Atomic refusal; preserve drafts | Still-full storage refuses agent writes; manual recovery can resume. Unreadable receipt stays unknown. | `tests/agent-local-recovery.test.ts` — storage still full after relief stops agent edits before any write; Try again lets them through; a full storage whose receipt cannot be read reports the outcome unknown, never nothing changed |
| Workspace ledger cap | 5 connections / 65,536 aggregate bytes | 5 admitted; sixth refused; metadata plus accounted bytes = 65,536; overflow writes 0 keys. | B — workspace ledger: 5 connections and 65536 aggregate bytes; refusal writes 0 keys |
| Relay cap | 5 pending / 8,388,608 serialized bytes | 5 intake slots, 8,388,608 reserved bytes; extra refused; release leaves 0 slots/bytes. | B — relay intake: 5 pending / 8388608 bytes, refusal reserves 0 extra bytes; `tests/agent-relay.test.ts` — sixth pending command is busy before any send, timer or entry allocation; 8 MiB budget measures complete UTF-8 envelopes across all pending calls |
| OAuth pending cap | 20 records / 65,536 bytes per sign-in | 20 entries, 65,536 accounted record bytes; 21st refused with 0 written keys. | B — OAuth pending: 20 records / 65536 bytes; refused record writes 0 keys |
| OAuth client cap | 16,384 bytes per serialized client | 16,384 UTF-8 bytes stored; 16,385 refused with 0 DO calls. | B — client record: 16384 UTF-8 bytes stored; 16385 refused with 0 DO calls |
| Retained registrations | 10,000 post-change registrations | Seeded 10,000; 503 temporarily_unavailable; 0 client allocations. First limiter wake writes 1 alarm-deadlines key / 28 serialized bytes. Legacy occupancy unknown. | B — registration capacity: 10000 retained; 503 quota-shaped refusal, 0 client allocations |
| Repository cache | 262,144 stored; 262,145 not stored | Exactly 262,144 UTF-8 chunk bytes; larger replacement clears chunks; /api/session reads 0 cache-content keys. | B — repository cache: 262144 stored bytes; 262145 stores 0 content bytes; authentication reads 0 cache keys |
| MCP authentication-only cache access | 0 cache-content key reads | tools/list: 3 authentication calls; 0 cache-content reads with a multi-chunk durable cache. | `tests/repository-cache-runtime.test.ts` — MCP tools/list and editor authentication read zero listing keys with a large durable cache |
| Slow complete relay body (ticket 13 gap) | Deliver once inside 10 s; release slot/bytes; 0 storage | Second piece after 1,000 virtual ms; 1 delivery; 0 written keys/bytes. Five following calls and full-byte admission prove release. | B — relay body arrives in pieces before deadline: delivered once; 0 payload storage |
| Body exceeds Content-Length (ticket 13 gap) | Refuse; send nothing; release slot/bytes; 0 storage | HTTP 413; 0 command frames; 0 written keys/bytes. Five following calls and full-byte admission prove release. | B — relay body exceeds Content-Length: refused; 0 payload storage |
| Two tabs / takeover | Explicit takeover; higher generation; old owner fenced | Second tab offers Take over without a receiving socket; takeover raises generation; drafts/receipts unchanged. | L — two tabs: explicit takeover raises generation; old owner is taken over and drafts survive |
| Owner close | No automatic promotion | 0 second-tab receiving sockets or commands before Take over; explicit takeover opens one socket. | L — owner close: second tab never promotes itself; only Take over opens a receiving socket |
| Freeze / resume (bfcache) | Reprove ownership; no replay | Persisted pagehide/pageshow path; one requested read; drafts/receipts unchanged. Does not prove renderer discard. | L — freeze/resume via persisted pagehide/pageshow: ownership rechecked, no command replay |
| Freeze / resume (document events) | Owner keeps its socket; no replay | One handshake, one read after resume, drafts/receipts unchanged. Headless Chromium ignores CDP freeze for a visible page, so the test dispatches the document events. | L — freeze/resume (document lifecycle events): a frozen owner keeps its socket and answers after resume |
| Takeover while frozen | Old owner fenced; learns on resume | New owner has a higher generation and applies the edit; 0 commands reach the frozen tab; it says taken over after resume. | L — takeover while the owner is frozen: on resume the old owner says taken over and never commits |
| Relay reset, socket kept (hibernation restore) | Re-handshake; no replay; reconcile uncertainty | One reset frame, one new ready frame; lost call returns unknown; status reconciles to cancelled before commit. Draft/sign-in survive. | L — relay reset (hibernation restore, socket kept): re-handshake, lost edit stays unknown, no replay; browser draft and sign-in survive |
| Server restart, socket closed | Reconnect to a fresh relay; no replay | Server closes the socket (1012) and drops the relay; lost call unknown; tab reconnects and handshakes once more; status cancelled; 1 delivery of the lost edit. | L — server restart closes the socket: tab reconnects to a fresh relay, lost edit stays unknown, nothing replayed |
| Legacy cancellation | Before commit: nothing applied; status cancelled | One notifications/cancelled frame; 0 new drafts/receipts; duplicate stays cancelled. | L — MCP notifications/cancelled before commit: 0 drafts applied, status cancelled, duplicate never applies |
| Modern abort / legacy disconnect | Abort before commit cancels; applied receipt wins after commit; legacy disconnect alone does not cancel | Miniflare live HTTP ingress with enable_request_signal proves each ordering. | `tests/agent-cancellation.test.ts` — runtime JSON modern abort before commit; runtime JSON modern abort after commit; runtime legacy disconnect alone keeps the tab command alive; another grant cannot cancel it |
| Disconnect detection | Measure separately | 0 virtual ms event-to-detection for explicit close. Not a silent-network bound. | B — disconnect detection 0 ms; eligibility 300000 ms; deletion at alarm; sign-in and App config survive |
| Cleanup eligibility | Last detected editor loss + five minutes | No deletion at 299,999 ms; eligible at 300,000 ms. | B — disconnect detection 0 ms; eligibility 300000 ms; deletion at alarm; sign-in and App config survive |
| Actual deletion / preservation | Only eligible agent records; preserve sign-in, drafts, App config | Manual alarm deletes grant at 300,000 ms; sign-in and actual native-site-editor/config unchanged; 0 server draft keys. Browser-only drafts proved separately. | B — disconnect detection 0 ms; eligibility 300000 ms; deletion at alarm; sign-in and App config survive |
| Cleanup races | Generation fence; failures stay counted | Reconnect before deadline: stale/repeated alarms delete 0 keys. | `tests/agent-lifecycle.test.ts` — reconnect immediately before eligibility cancels generation; old and repeated alarms delete nothing; a workspace filled to exactly 64 KiB stays within it after the disconnect fence writes lifecycle, deadline and tombstones |
| Authentication / revocation | Immediate denial despite delayed physical cleanup | 401 before deletion finishes; other grants survive one revoke. | `tests/agent-lifecycle.test.ts` — sign-out and one revoke deny immediately while physical deletion is held or fails; other grants survive |
| Scope / stale revisions / atomicity | No cross-account/repository/branch/generation access; no stale overwrite | Wrong scope never runs; manual write during preparation causes 0 overwrites. | `tests/agent-transport.test.ts` — wrong generation, tab, workspace and malformed commands refuse without running; `tests/agent-text-commit.test.ts` — manual write between capture and commit refuses the agent with zero overwrites |
| Browser upload preservation | Bytes and drafts recover together | One record transaction; reload recovers drafts, receipt and bytes. | `tests/agent-media-commit.test.ts` — agent bytes complete before one records transaction, then publish without a second draft write; reload recovers all three |
| Private immutable cache | Bounded memory; account/revision isolation | 32 MiB clean-text cap; account changes fence pending reads; required baselines stay pinned. | `tests/clean-source-cache.test.ts` — default cap is 32 MiB of UTF-16 text, including surrogate pairs; account changes and sign-out never return another account's entry or pending load |
| Mixed old/new tabs | Refuse obsolete writers before DO work; no content mirrors | Obsolete routes: 0 DO calls. Stale tabs can still consume Worker HTTP traffic. | `tests/agent-cutover.test.ts` — every obsolete route rejects all methods before session, origin, account or DO work |
| Legacy discovery / cleanup accounting | Cursor inventory; sanitized classification; preserve unknown and active records | Not locally measured by ticket 26. Unknown legacy occupancy prevents an aggregate storage claim. | Pending ticket 27 inventory evidence; no transport test proves completeness. |
| Migration limits | 10-object canary; ≤100/batch; ≤1,000 maintenance DO calls/UTC day; accepted 5,000 Cloudflare written-row gate | Not locally measured. Separate migration run and preview accounting required; fake keys are not Cloudflare rows. | Pending ticket 27 and preview accounting. |
| Independent controls / rollback | Pause relay, Watch, registration and cleanup independently; preserve manual work and data | Obsolete writers refused locally. Release controls and rollback deployment are not locally measured. | Release-lead runbook evidence required; no rollback performed here. |

## Local checks (2026-10-19)

Recorded in the ticket's Done section with the kit RESULT lines. The budget file runs in a few seconds; the lifecycle
spec has eight cases.

## PREVIEW — release lead only

Target: https://preview-editor.techies.tools. Every row is **not yet measured**.
Sign in with an authorized test account. Use a disposable repository and branch.
Record deployment version, observation window, browser state and starting counter values.
Use matching scenarios and windows. Separate setup, steady operation, Watch and migration.
Never capture credentials or private draft content in evidence.

For every row, read Cloudflare analytics: DO requests, rows read, rows written, duration and stored bytes.
Record before/after values, measurement windows and unrelated traffic or sampling limits.
These are Cloudflare metric names. Local key counts are not those metrics.
Count Worker HTTP traffic and WebSocket frames separately. Investigate unexplained changes.

| Scenario | Signed-in steps and evidence | Preview result |
| --- | --- | --- |
| Remote-off startup / menu / visible / hidden | Keep remote agents off, including with an existing grant. Reload, open the menu, leave visible then hidden for equal five-minute windows. Record zero agent calls/uploads/writes; separate editor/GitHub traffic. | not yet measured |
| Quiet connected idle / hibernation | Enable a receiving tab and complete handshake. Leave visible then hidden with no work. Check DO duration stops accumulating between messages, no polling/storage heartbeat, and automatic ping/pong. Capture isolate wake evidence if available. A quiet network log alone does not prove hibernation. | not yet measured |
| Authorized reads / edits / duplicates | Initialize once; read a file; make one edit; repeat its requestId; query status. Count authentication, dispatch, initialization, GitHub work, frames and lifecycle separately. Verify one receipt and one Undo step. | not yet measured |
| Quiet wait / Watch | With Watch off, call wait once and stop on empty. Enable Watch explicitly. Record each duration and deadline across two tabs/grants; try 26 waits. Verify one outstanding wait, ≤25 s each, ≤25 waits, ≤10 minutes. Expiry must keep a separate edit usable. | not yet measured |
| Network / reconnect / Retry-After | Drop the network without closing the tab. Restore at controlled times. Record ≤5 coordinated attempts within two minutes, backoff, pause and single manual Retry. Do not replay an edit. Measure physical loss and observed detection separately. | not yet measured |
| Daily quota / generic failure | Use an approved test fault if available. Record exact quota signal and authoritative Retry-After/reset. Verify zero automatic reconnects/waits/uploads/retries; one controlled manual attempt; preserved sign-in/drafts. Generic 503/429 alone is not daily quota. | not yet measured |
| Storage / ledger faults | Use approved faults; do not exhaust shared resources. Fail browser commit and ledger admission; verify atomic refusal, preserved drafts and unknown status when the receipt is unreadable. Without injection, leave unmeasured. | not yet measured |
| Caps | Check fifth/sixth connection, relay slots/bytes, OAuth pending count/bytes, client size and cache boundaries in isolation. Do not create 10,000 live clients just to test retention. Use approved seeded evidence or leave that boundary unmeasured. | not yet measured |
| Two tabs / owner close / takeover | Open one workspace in two tabs. Verify Another tab and Take over. Close owner: no promotion. Explicitly take over and record higher generation. Repeat with old owner open; old owner must show taken over. | not yet measured |
| Freeze / discard / resume | Freeze then resume with DevTools. Separately discard/reload the renderer. Transfer ownership while frozen. Verify stored generation before receiving and no replay. Synthetic lifecycle events do not prove discard. | not yet measured |
| Deployment restart / lost result | With lead authorization, restart preview while an edit is in flight. Verify reconnect or fresh handshake; lost result remains unknown until receipt reconciliation; nothing automatically resent. | not yet measured |
| Modern / legacy cancellation | Abort a modern HTTP response before commit; send notifications/cancelled for legacy. Verify cancelled status and no draft. Cancel after commit: receipt remains applied. Legacy disconnect alone must not cancel. | not yet measured |
| Disconnect detection | Close the last editor; separately simulate silent loss. Record physical-loss time and server close/error detection time. Keep a second background editor open as a control: no cleanup deadline. | not yet measured |
| Five-minute eligibility | Record deadline = observed last loss + five minutes. Verify grant remains just before deadline. Reconnect just before it and verify generation fences old cleanup. | not yet measured |
| Actual deletion / preservation | Record first physical deletion and actual alarm delivery after eligibility. Inspect grant, hub entry, ledger and stored-byte changes. Verify sign-in, browser drafts/uploads and native-site-editor/config survive. Deletion may be later than five minutes. | not yet measured |
| Authentication / scope / cache reads | Expire/revoke a test grant. Switch account/repository/branch. Verify refusal and no private cache leakage. With a large stored cache, authenticate without opening listings; inspect cache-key reads separately where tooling permits. | not yet measured |
| Mixed tabs / rollout controls | Keep an old tab across cutover. Verify obsolete writers rejected before DO work; count residual Worker traffic and refresh. Exercise separate relay/Watch/registration controls; pause cleanup and remote work while preserving manual editing/drafts. | not yet measured |
| Legacy inventory / migration | Ticket 27: page namespace cursors, classify sanitized records, preserve unknown/active entries. Ten-object canary, then ≤100/batch. Record scanned/classified/deleted/deferred/unknown and re-enumerate. Enforce 1,000 maintenance calls/UTC day and bound the next deletion against the accepted 5,000 Cloudflare written-row gate. Pause on quota; remove protected checkpoints only after verification. | not yet measured |
| Rollback | Rehearse only with lead authorization. Pause affected remote features and cleanup; preserve sign-in/drafts/schema/generations. Never restore polling, mirrors or unresolved replay. Resume only after failed checks pass. | not yet measured |

Local limits: no deployed hibernation/duration measurement, real deployment restart, silent-loss latency,
renderer discard proof, complete legacy inventory, migration accounting, legacy-inclusive registration bound,
or release-control/rollback deployment proof. The fixture hooks call the real relay's reset or close its sockets.
They do not restart Node/workerd. The fixture does not run Cloudflare cleanup alarms.
Browser draft preservation and real SessionStore cleanup are separate evidence.
OAuth pending caps count ledger-accounted records. Pre-ledger one-time authorizations keep their original fixed expiry.
