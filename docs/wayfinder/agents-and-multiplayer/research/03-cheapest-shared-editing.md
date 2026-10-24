# Cheapest way to edit the same page live together

Researched 2026-10-24 for [ticket 03](../tickets/03-research-cheapest-shared-editing.md). Planning only: no product code changed, nothing deployed, no plan changed. Prices and limits are as published on the dates given in [Sources](#sources). Package sizes were measured on 2026-10-24 (method in [Browser size](#browser-size)).

## Short answer

The cheapest sound option is **Yjs in each browser plus a "pass-through" relay inside the Durable Object we already run for agents**. The relay forwards locked (encrypted) edits between the people in a session and keeps nothing. Drafts stay in each browser, as today.

- **What it costs:** on Cloudflare's free plan, nothing extra while total daily use stays under the free limits. On Workers Paid, Lex's internal use fits inside the $5 a month base fee. An hour of two people and three agents on one page uses about 3,000 Durable Object requests and at most 450 GB-s of compute time, about 3% of a free day.
- **Browser size:** about 30 KB gzipped (Yjs plus its sync helpers). The two alternatives, Automerge and Loro, are each about 1.1 to 1.2 MB gzipped.
- **The drafts rule:** "drafts are never mirrored in Durable Objects" holds. The relay holds nothing and cannot read what passes through. One sentence in CONTEXT.md needs a clarification (see [The rule](#our-current-rules)).
- **Self-hosters:** nothing new to set up. It rides the Durable Object class the Deploy button already creates. The free plan is enough for a small team.

The runner-up keeps a copy of the page in a Durable Object (Cloudflare's own `y-partyserver`). It is easier for late joiners but breaks the drafts rule and rules out the locked link. Last comes peer-to-peer (WebRTC). It is just as cheap but harder to build and less reliable, and its main library has not been updated since 2023.

## Recommendation ranking

| | 1. Pass-through relay (recommended) | 2. Server holds the page | 3. Browser to browser |
|---|---|---|---|
| How edits travel | Browser → our Durable Object → other browsers; the object only forwards | Browser → Durable Object that keeps and merges the page → other browsers | Directly between browsers (WebRTC); the server only introduces them |
| Library | Yjs + our small relay | Yjs + `y-partyserver` (Cloudflare, 2.2.0) | Yjs + `y-webrtc` (10.3.0, last published 2023-12-28) |
| Extra monthly cost, Lex internal (about 40 heavy hours a month) | Free plan: $0 if the account's other use leaves room. Paid: $0 above the $5 base | Same, plus a few hundred stored rows an hour (free) | Practically $0; TURN traffic is about 8 MB an hour, against 1,000 GB free a month |
| Self-hoster | Free plan for light use; $5 Paid for daily team use | Same | Same, plus a TURN key if guests are behind strict firewalls |
| Browser size added | ~30 KB gz | ~30 KB gz + small provider | ~30 KB gz + WebRTC helper (simple-peer) |
| Build effort | Medium-large (list below) | Medium (no seeding from the host; adds storage, cleanup and draft conflicts) | Large (signalling, TURN, connection failures, stale libraries) |
| Self-hoster sets up | Nothing new | Nothing new (one more storage use) | Cloudflare Realtime TURN key and two secrets, or accept that some networks fail |
| Keeps "never mirror drafts in DOs" | Yes (needs a one-line clarification) | **No**: needs Lex's decision and an ADR | Yes |
| Locked (end-to-end encrypted) link | Yes, key in the link after `#` | No: the server must read the page to merge it | Yes (WebRTC is encrypted; `y-webrtc` `password` locks the introductions) |
| Works when the host's browser is closed | No: someone with the page must be online | Yes, for as long as the server copy is kept | No |

The last row is the real trade-off. Today's product already needs Lex's tab open: agents wait without a receiving tab (CONTEXT.md, Agent connection). Option 1 keeps that model.

## What an hour costs: two people and three agents on one page

### Assumptions (deliberately heavy)

- **Two people typing nonstop for the full hour:** 2 edit messages and 1 cursor message a second each, about 10,800 incoming messages per person. Yjs' presence signal also repeats every 15 s (`y-protocols` awareness, `outdatedTimeout` 30 s, renewed at half that).
- **Three agents:** they do not join the shared document themselves. Their edits arrive through Lex's receiving tab (today's relay), which passes them on as shared edits. Each agent makes 1 edit and 1 presence update every 10 s, about 720 messages an hour, so 2,160 for all three.
- **Existing agent traffic, counted so the total is honest:** each agent's watchdog holds a `wait_for_requests` for up to 25 s (`worker/agent-relay.ts`, `WAIT_LIMIT_MS`), about 144 waits an hour, plus one tool call every 10 s, 360 an hour. Each is one HTTP request to the Durable Object, about 1,500 for three agents, plus about 1,500 small replies from the tab.

### Cloudflare's counting rules (pricing page, updated 2026-10-18)

- Incoming WebSocket messages are billed at 20 messages to 1 request. Outgoing messages (the relay's broadcast to others) are free, and so are protocol pings.
- Compute time ("duration") is billed for wall-clock time while the object is active and not eligible for hibernation, always counted as 128 MB of memory. Idle objects that can hibernate are not billed, even before they actually hibernate. Timers such as `setTimeout` keep an object from hibernating.
- **Free plan:** 100,000 requests and 13,000 GB-s a day, 5 million rows read and 100,000 rows written a day, 5 GB stored. Daily limits reset at 00:00 UTC.
- **Workers Paid:** $5 a month minimum. Included each month: 1 million Durable Object requests, 400,000 GB-s and 50 million rows written. Above that: $0.15 per million requests and $12.50 per million GB-s, "rounded up to the next billable unit". In Cloudflare's own example that rounding turns 152,960 GB-s of overage into a full $12.50, so going just over the included compute costs $12.50 that month.
- A WebSocket upgrade through a Worker is 1 Worker request. Messages after that are not Worker requests (Workers pricing, 2026-10-02).

### Arithmetic (option 1; options 2 and 3 in the notes after the table)

| Item | Count per hour | Billed as |
|---|---|---|
| Incoming edit and cursor messages (2 people) | 21,600 | 1,080 requests |
| Shared edits and presence from 3 agents (via Lex's tab) | 2,160 | 108 requests |
| Agent tool calls and waits (existing relay) | ~1,500 HTTP | 1,500 requests |
| Tab replies to those calls | ~1,500 | 75 requests |
| WebSocket connections (people, reconnects) | ~10 | 10 requests |
| **Total Durable Object requests** | | **~2,800 (round to 3,000)** |
| Compute, worst case: awake the whole hour | 3,600 s × 0.125 GB | **450 GB-s** |
| Compute, relay alone, if nothing else keeps it awake | ~27,000 events × ~5 ms ≈ 135 s | ~17 GB-s |
| Storage | none (pass-through) | 0 rows |

The worst case is the realistic one. While a watchdog waits, the agent relay holds a timer (`Pending.timer` in `worker/agent-relay.ts`), so the workspace's object is already awake for the whole hour when agents are watching. If shared editing uses **the same object**, its extra compute is close to zero: the object is awake anyway.

**Free plan:** one such hour uses about 3,000 of 100,000 daily requests (3%) and 450 of 13,000 GB-s (3.5%). Compute is the limit that bites first, at about **28 fully awake page-hours a day**, or about 33 hours on requests alone. The catch is that the limits are per account and shared with everything else. On 2026-10-15 the editor's account recorded 95,517 Durable Object requests in one day, before the Durable Object reduction ([quota baseline](../../durable-object-reduction/tickets/02-establish-quota-baseline.md)). Current use after the reduction has not been measured.

**When a free limit is hit:** "further operations of that type will fail with an error" until 00:00 UTC (pricing page, 2026-10-18). Live sessions and agent connections stop together. Worker requests over the daily limit return error 1027, or bypass the Worker, depending on the route's fail mode (Workers limits, 2026-10-12). Drafts are not lost, because they live in the browser, but nobody sees anyone else's edits until the reset.

**Workers Paid:** 1 million requests covers about 330 such hours a month, and 400,000 GB-s covers about 880 awake hours. Lex's internal use (tens of hours a month) therefore costs **$5 a month flat**. Past the included amounts, an hour costs about $0.0005 in requests and $0.0056 in compute, but the rounding rule means the first step over the compute allowance costs $12.50.

**Example monthly bills:**

| Who | Use | Free plan | Workers Paid |
|---|---|---|---|
| Lex, internal | 40 heavy hours a month, at most a few a day | $0 if daily totals stay under the limits | $5 (base only) |
| Small self-hosting team | 2 pages × 4 h a day × 22 days = 176 h | Fits (8 awake hours a day, under 28) | $5 |
| Busy self-hosting team | 5 pages × 8 h × 22 days = 880 h | Over the daily compute limit | $5, or $17.50 just past 400,000 GB-s |

**Option 2 (server holds the page):** same requests. Compute is always the worst case, because `y-partyserver` saves on a timer (2 s wait, at most 10 s), which keeps the object awake while people type. On top of that come up to about 360 rows written per busy hour (one save every 10 s while typing continues), against 100,000 a day free. Unlike option 1, the doc copy and its clean-up need retention rules.

**Option 3 (browser to browser):** signalling is a few dozen messages per join, close to $0. Shared edits travel peer to peer. When a TURN relay is needed, 25,000 messages of about 150 bytes is about 4 MB per direction per hour. Cloudflare Realtime TURN costs $0.05 per GB after the first 1,000 GB a month free (shared with its SFU, page updated 2026-09-22), so this is $0. The agent relay still runs as today.

## Browser size

Measured 2026-10-24: packages fetched from npm, bundled with esbuild (`--bundle --minify --format=esm`), gzip -9. These are upper bounds, because whole-library imports defeat tree-shaking.

| Library (version) | What ships | Raw | Gzipped |
|---|---|---|---|
| Yjs 13.6.33 | `import * as Y from "yjs"` | 93.5 KB | **28.7 KB** |
| Yjs + y-protocols 1.0.7 (sync, awareness) + lib0 0.2.119 | what option 1 needs | 101.4 KB | **31.0 KB** |
| Automerge 3.5.0 | WebAssembly core (`automerge.wasm`) | 3.64 MB | **1.14 MB** (plus JS) |
| Loro 1.17.1 | WebAssembly core (`loro_wasm_bg.wasm`) | 3.60 MB | **1.19 MB** (plus JS) |

Yjs 14 exists only as a beta on npm (`beta` 14.0.0-16 on 2026-10-24). The stable line is 13.6.x. Automerge and Loro add good features: Loro has a movable tree and text that avoids jumbled interleaving, and Automerge keeps full history. But their 1+ MB download buys nothing this editor needs, because we merge plain source text (next section).

## How text merging fits our files, drafts and preview

### Merge the source text, not an element tree

Our drafts are plain strings: one per file path, holding the draft text and the saved base (`src/draft-store.ts`). Every change is a list of `TextChange { start, end, text, expected? }`. A shared-text type (Yjs `Y.Text`) is the same shape: a string with insert and delete at positions. So:

- **Layout:** one shared document per session (workspace and branch), with one `Y.Text` per open file: the page, its stylesheets and the components it uses.
- **Local edits out:** a local draft-store `edit` becomes `Y.Text` delete plus insert in one transaction, tagged with the editor's own origin.
- **Remote edits in:** a remote `Y.Text` change becomes a draft-store write with a new "remote" origin. The persisted draft, the code pane and the preview then follow, through the same `changed()` path that external writes use today (`src/native-site-runtime.ts`).
- **Per-person Undo comes almost free:** Yjs' `UndoManager` undoes only changes from the origins it tracks ("all local changes that don't specify a transaction origin", docs.yjs.dev). This answers part of the map's "Undo and history with several editors" question, but the draft store's own journal must route through it or step aside for shared files.

Element-tree types (Yjs `XmlFragment`, Loro's tree) would mean parsing HTML into a tree and printing it back. That loses the exact source text (spacing, attribute order, comments) that the editor promises to keep for sites that are their own repository. Text merging keeps every byte the user did not touch.

**Known weak spot.** A text merge does not know about tags. Suppose one person deletes a whole element while another types inside it: the typed letters survive, stranded where the element was. Ordinary typing in different places, or in the same paragraph, merges cleanly. Only structure changes (remove, move, replace an element) need a guard, described in the next two sections.

**Starting text must come from one browser.** If two browsers each load the same file into a fresh `Y.Text`, the merge keeps both copies and the page doubles. The first browser in a session (the host) seeds the text. Everyone else takes its state through Yjs' sync exchange before editing. With a pass-through relay (option 1) or browser to browser (option 3), a joiner therefore needs someone already in the session to be online. Option 2's server copy removes that need, which is its main advantage.

### Typing in the preview

Today, inline typing in the preview is sent once, when the person clicks away. `commitEditing` in `src/components/native-preview-runtime.js` sends `text-edit` with the element's index path and its before and after text. The host turns that into a source range edit (`src/components/native-preview.ts`, `onTextEdit`). For shared typing in the same paragraph:

1. **Send while typing.** Send small edits as the person types, not only on click-away. The runtime already converts selections to text offsets inside an element (`textOffset` and the code next to it), and the host already maps an element to its source range for `text-edit`.
2. **Patch remote typing in place.** Show remote typing in the element without re-rendering the frame. Re-rendering mid-keystroke would throw away the local caret. A host-to-frame message for exactly this kind of in-place text update already exists (`patch-text` in `src/components/preview-protocol.ts`). Remote carets can be anchored with Yjs relative positions so they survive other people's edits.
3. **Hold structure changes.** While someone has the caret inside an element, hold remote structure changes to that element (not plain typing) until they click away. This is the same rule slice 52 already sets for agents.

The code pane can use `y-monaco` (0.1.6, last published 2024-07-31) for remote cursors. Its typing already flows character by character into the draft store (`beginTyping` and `session.input`).

### An agent's whole-element replacement during live typing

Agents change files with `edit_file` (exact `oldText` → `newText`, guarded by the file's hash) or `write_file` (the whole file) in `worker/mcp.ts`. The receiving tab applies them. In a shared session:

- **Hash check becomes a "still there" check:** the tab finds `oldText` exactly once in the current shared text. The file's hash will often have moved on because someone typed elsewhere, so it can no longer guard the edit.
- **Apply only what really changed:** the tab narrows the replacement to the span that differs (the store already has `diffRange(a, b)`) and applies that as one shared edit tagged with the agent's identity. Typing anywhere outside that span survives untouched.
- **Typing inside the span waits:** if a person's caret is inside the element being replaced, the agent's change waits until they click away. This is slice 52's rule, already decided. Without the wait, the merge would keep the agent's new element and the person's stray letters, which breaks markup.
- **`write_file` on a file someone is editing:** it is converted to the smallest differing range in the same way. If that range covers someone's caret, it waits like any other structure change.

## Our current rules

- **CONTEXT.md, Agent connection:** "Drafts, context, commands and conversations are never mirrored in Durable Objects." The Durable Object reduction map keeps browser-owned content and bounded relay data.
- **Option 1 keeps the rule.** The relay forwards messages and stores nothing, exactly as today's agent relay passes commands through memory. With the link's key, it cannot read them either. Suggested clarification for Lex: "Shared edits pass through the relay locked and are never stored."
- **Option 3 keeps the rule.**
- **Option 2 breaks it.** The page and its drafts live, readable, in the object, and usually in its storage too. This needs Lex's decision, retention limits in line with the reduction map's data budgets, and an ADR.
- **Daily traffic budget:** the reduction map set zero agent-hub traffic while agents are off. Option 1 adds traffic only while a session is open, and every option needs a "quota pause" behaviour when the free limit is hit.

## Joining without an account: what a synced-session link needs

### Reference products

- **Excalidraw:** the link is `…#room=<roomId>,<roomKey>`. The key is generated in the browser and sits after `#`, which "doesn't get sent to the server". Content is AES-GCM encrypted (source `excalidraw-app/data/index.ts`, 2026-01-04; blog post 2020-03-21). Its room server only relays.
- **tldraw:** one Durable Object per room "stores the authoritative copy" in its SQLite storage. Sign-in and permissions are left to the developer. The docs (2024-07-11) do not mention end-to-end encryption. The hosted demo is public to anyone with the room id and is wiped after about a day.
- **Figma (FigJam):** "open sessions" let visitors without accounts join and edit for 24 hours, with an optional password, on paid plans only. Ordinary Figma design files need an account to edit.

### What each option needs

**Common to all options:**

- **A link the server can check without storing anything:** the Worker signs a token for session id, workspace, role and expiry. The host can end the session early by bumping a counter in the relay object, which is one row of session information, not drafts.
- **Site files for the guest:** guests have no GitHub access, so the host's browser sends the page files (saved and drafts) to them through the session.
- **Images and media from private repositories:** these also need the host to send them, or a Worker endpoint that serves them with the session token. Decide in ticket 07.
- **Saving:** only the host saves to GitHub.

**Option 1:** link like `…/s/<sessionId>#<key>`. All shared edits and files are encrypted in the browser (Web Crypto AES-GCM) with the key from the fragment. The relay checks the token and forwards ciphertext. The host must stay online.

**Option 2:** the token is enough, and the server serves the page to the guest even when the host is away. It cannot be end-to-end encrypted, because the server must read the page to merge it.

**Option 3:** the link carries room and password. `y-webrtc`'s `password` encrypts the introductions, and WebRTC itself is encrypted between browsers. The host must stay online, and some company networks need TURN.

## Build effort (option 1, for the stage-two plan)

1. Yjs binding to the draft store: local edits out, remote edits in, a "remote" origin, and Undo routing.
2. Relay messages in the per-workspace object, next to `worker/agent-relay.ts`, which already uses hibernating WebSockets with socket attachments. The object stays one per site, not per page, so switching pages does not reconnect.
3. Seeding and late joiners: the host seeds, joiners sync first.
4. Preview: send typing live, patch remote typing in place, hold structure changes while someone is typing inside.
5. Agent edits: the "still there" check and narrowed replacement.
6. Presence and cursors, through Yjs awareness, shared with slice 33's agent presence.
7. Synced-session link: signed token, fragment key, encryption, and sending files to guests.

Options 2 and 3 change items 2, 3 and 7. Everything else is the same.

## Open points for the grilling tickets

- **Shared limit:** whether Lex's account is on Free or Paid. The quota baseline could not read the plan, and both shared editing and agents draw on the same daily limit.
- **Host online:** whether a session must end when the host's last tab closes (options 1 and 3), or should survive it, which needs option 2 and a rule change.
- **Guest media:** private-repository images and media for guests: sent by the host, or served by a Worker endpoint.
- **Draft journal:** how the draft store's per-page Undo and Yjs' per-person Undo share one history.

## Sources

Fetched 2026-10-24 unless noted. Dates in brackets are the page's own last-updated or publish date.

- Cloudflare, [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) [2026-10-18]: free and paid allowances, 20:1 WebSocket ratio, hibernation billing, rounding, examples, failure on free limits.
- Cloudflare, [Durable Objects WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) [2026-09-30]: hibernation conditions, timers block hibernation, automatic pong, 16 KB attachments.
- Cloudflare, [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) [2026-06-01]: 32 MiB WebSocket message, 2 MB row, free-plan storage.
- Cloudflare, [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) [2026-10-02]: $5 minimum, 100,000 requests a day free, WebSocket messages not Worker requests.
- Cloudflare, [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) [2026-10-12]: error 1027, fail open or closed, reset at midnight UTC.
- Cloudflare, [Realtime pricing](https://developers.cloudflare.com/realtime/pricing/) [2026-09-22] and [Realtime TURN](https://developers.cloudflare.com/realtime/turn/) [2026-09-25]: $0.05 per GB, 1,000 GB a month free.
- Cloudflare PartyKit, [`y-partyserver` 2.2.0 README and source](https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver) (npm, published 2026-04-24): persistence `onLoad` and `onSave`, debounce of 2 s with a 10 s maximum, doc kept in memory. [`partyserver` 0.5.10 README](https://github.com/cloudflare/partykit/tree/main/packages/partyserver): hibernation support.
- Yjs, [UndoManager docs](https://docs.yjs.dev/api/undo-manager) (no date shown): tracked origins. [`yjs` on npm](https://www.npmjs.com/package/yjs) (13.6.33, modified 2026-09-23; beta 14.0.0-16). `y-protocols` 1.0.7 `awareness.js`: 30 s timeout, 15 s renewal.
- [`y-webrtc` 10.3.0 README](https://github.com/yjs/y-webrtc) (npm modified 2023-12-28): signalling servers, `password` encryption. [`y-monaco`](https://github.com/yjs/y-monaco) 0.1.6 (2024-07-31).
- [Automerge 3.5.0](https://www.npmjs.com/package/@automerge/automerge) (npm modified 2026-09-16) and [Loro 1.17.1](https://www.npmjs.com/package/loro-crdt) (npm modified 2026-10-22): WebAssembly sizes measured from the published packages.
- Excalidraw, [collaboration link source `excalidraw-app/data/index.ts`](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/index.ts) [last commit 2026-01-04] and [End-to-end encryption post](https://plus.excalidraw.com/blog/end-to-end-encryption) [2020-03-21].
- tldraw, [Sync docs](https://tldraw.dev/docs/sync) [2024-07-11] and [`useSyncDemo` reference](https://tldraw.dev/reference/sync/useSyncDemo): demo data deleted after about a day.
- Figma Help, [Invite visitors to an open session](https://help.figma.com/hc/en-us/articles/4410786053911-Invite-visitors-to-an-open-session): 24 h, no account, optional password, paid plans.
- Repo (this branch, 2026-10-24): `src/draft-store.ts`, `src/native-site-runtime.ts`, `src/components/native-preview-runtime.js`, `src/components/native-preview.ts`, `src/components/preview-protocol.ts`, `worker/agent-relay.ts`, `worker/mcp.ts`, `wrangler.jsonc`, CONTEXT.md (Agent connection), [Durable Object reduction map](../../durable-object-reduction/map.md) and its [quota baseline](../../durable-object-reduction/tickets/02-establish-quota-baseline.md).
