---
title: "GitHub pushes reach open tabs"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [23-page-typing-together, 24-per-person-undo, 25-agents-join-merge, 26-save-several-editors]
---

## Goal

Open tabs learn of a push within seconds ([research 04](../../tickets/04-research-always-the-latest.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 09, item 5](../../tickets/09-grill-outside-changes-live.md#resolution-2026-10-24) and [ADR 0003](../../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) decision 5:

- The GitHub App's push webhook reaches the Worker, which checks its signature.
- The relay tells open tabs "branch B is now at commit X", and each tab fetches the files with its own sign-in.
- Today's check on focus stays as a safety net.
- Setup keeps the webhook secret for new self-hosters; the existing App needs Lex's checklist (README), proven on a test App first.

## Files

Expected (confirm while designing): a new `worker/github-webhook.ts`, `worker/app.ts` (route), `worker/owner-setup.ts` (webhook on at setup, keep the secret), `worker/agent-relay.ts` (broadcast), `src/github-reads.ts` (fetch on notice); tests with signed fake deliveries.

## Done when

- Tests: a signed push reaches an open tab's notice and an unsigned one is refused.
- A test App run is recorded in Done, including whether installations had to approve again.
- Lex's checklist has its exact values filled in.

## Lead notes (2026-11-09)

Fixed by the lead with Lex; build to these:

- **Webhook address:** `POST /api/github/webhook` on the editor's own origin (the preview editor: `https://preview-editor.techies.tools/api/github/webhook`). Lex already set the test App's webhook to it.
- **Secret name:** `GITHUB_WEBHOOK_SECRET` (a Worker secret, `wrangler secret put GITHUB_WEBHOOK_SECRET`). The lead stores the test App's secret on the preview editor Worker (`native-site-editor-preview`) only. Owner setup for new self-hosters keeps the secret GitHub returns with the App, and the env secret, when set, wins. Without either, the route refuses every delivery.
- **Test App run (done by Lex, 2026-11-09):** App ID 5677762, a throwaway App on `techiesreviews`, installed only on the private repository `techiesreviews/editor-push-test`. It was created with its webhook off and Contents read and write, installed, then the webhook was turned on and the Push event subscribed. **No approval banner appeared: adding the Push event did not ask installations to approve again** (Push needs only Contents, which the App already has). Record this in Done and in the checklist.
- **Lex's checklist for the real App** goes in README.md (a short section for the existing App): turn on Active under Webhook, Webhook URL `https://<editor address>/api/github/webhook`, a random secret of 40+ characters stored with `wrangler secret put GITHUB_WEBHOOK_SECRET`, subscribe to the Push event; no new permissions, no re-approval. Do not change the real App.
- Proof on the preview (the lead runs it after the merge): a commit to `editor-push-test` gives a delivery that succeeds, an unsigned delivery is refused, and an open preview editor tab learns of the push within seconds.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.

## Done (2026-11-09)

**Behaviour.**

- `POST /api/github/webhook` (`worker/github-webhook.ts`, routed in `worker/app.ts`) takes the GitHub App's deliveries. No sign-in or origin is needed, only the signature. `X-Hub-Signature-256` must be the HMAC-SHA256 of the exact body under the webhook secret, compared in constant time (`crypto.subtle.verify`).
  - The secret is the Worker secret `GITHUB_WEBHOOK_SECRET` when set, otherwise the one owner setup kept. With neither, every delivery gets 401, as does an unsigned or wrongly signed one.
  - A signed `ping`, a tag push or a deleted branch gets 204. A signed branch push gets 200 with `{ told: n }`, the number of open tab sockets told; GitHub's delivery log shows it.
  - Bodies up to GitHub's 25 MB cap are read. JSON and the form content type (`payload=`) are both accepted.
- The push goes to the live room instance of its repository id and branch (`liveRoomObjectName`). There `LiveRooms.pushed` (`worker/agent-relay.ts`, via `/live/pushed` in `worker/index.ts`) sends `{ type: "pushed", commit }` to every open editor socket. Agents and guests are not told. Nothing is stored and no file content passes through the relay.
- In the tab, `src/live-room.ts` hands the notice to `onPushed`. `src/live-text.ts` passes it on with the open file's draft scope, and `src/page-builder-host.ts` wires it to `savePublish.pushed` (`src/controllers/save-publish-controller.ts`).
  - The tab runs the existing head check at once, with its own sign-in. It skips this when it already shows the commit, its own answered save named it, or the notice is for another scope.
  - While a save of this tab runs (the Save menu's `saving` port, `src/components/publish-menu.ts` through `src/components/source-editor.ts` and `src/controllers/source-pane-controller.ts`, to `savePublish.beginSave`), a notice is held, and a newer one replaces it. When the last save settles (answered, refused or failed), the held notice is dropped if that save's answer named its commit, else checked. So the tab's own save never loads the branch a second time, however late its answer. A disposed controller drops a held notice. There is no timer.
  - The check asks about the pushed commit, so a GitHub read lagging behind it still gives it. Every load trusts the commit it shows, which says nothing newer than the push. Only a trusted head other than the one on show (this tab's own newer save) is asked about instead, as a delayed notice may name an older commit. A new head loads as Refresh does.
  - A notice taken up while the snapshot after this tab's save is still being read waits for it, so its head answer never meets the snapshot from before the save and loads the branch a second time.
  - A hidden tab checks on its next focus. The focus check stays as the safety net, and so does an editor without the webhook or a browser with live sharing off.
- The fetch on notice is the existing head check in the save controller, so `src/github-reads.ts` did not change.
- Owner setup (`worker/owner-setup.ts`): the manifest now has the webhook active at `<origin>/api/github/webhook` with `default_events: ["push"]`, for an https origin GitHub can reach. A local setup (`http://127.0.0.1:8787`, `localhost`, any http origin) keeps the webhook off with no events, as before, and its tabs check on focus. The `webhook_secret` GitHub returns with the App is kept in the stored App config (never sent to a browser). `readBoundedBytes` in `worker/http.ts` is now exported for the webhook.
- Lex's checklist for the existing App is in README.md, "Push notices for an existing App". Its values: tick Active; Webhook URL `https://editor.techies.tools/api/github/webhook`; a random secret of 40+ characters (`openssl rand -hex 32`), stored with `npx wrangler secret put GITHUB_WEBHOOK_SECRET --config wrangler.techies.jsonc`; subscribe to Push; no new permissions, no re-approval. `docs/setup.md` (manual App settings) and `dev.vars.example` name the webhook and the secret too.

**Test App run (Lex, 2026-11-09).** App ID 5677762 is a throwaway App on `techiesreviews`, installed only on the private repository `techiesreviews/editor-push-test`. It was created with its webhook off and Contents read and write, then installed. Then the webhook was turned on (pointed at `https://preview-editor.techies.tools/api/github/webhook`) and the Push event subscribed. **No approval banner appeared: adding the Push event did not ask installations to approve again**, because Push needs only Contents, which the App already had.

**Tests.**

- `tests/github-webhook.test.ts` (new):
  - signature checks (exact body, other secret, malformed headers);
  - which pushes are told (tags, deleted branches, malformed payloads are not);
  - the relay telling only open editor sockets;
  - the secret's precedence, and refusal with no secret.
- The Miniflare test in that file runs the real Worker with a signed-in tab in a real live room. A signed push reaches the tab's `onPushed` with the commit (`{ told: 1 }`). Unsigned, wrongly signed and changed-body deliveries get 401 and reach nothing. A form-encoded signed push also arrives. Another branch tells 0 tabs; a tag and a ping get 204; a GET gets 405.
- `tests/save-publish-controller.test.ts`:
  - the notice's head check (pushed commit asked, the 15-second throttle skipped, the load);
  - no read for the commit on show, the tab's own answered save, another branch or repository, a hidden tab (which checks on its next focus) or a disposed controller;
  - the save rows of the settle matrix: a notice held through a save whose answer lands late is dropped for the save's own commit (one snapshot read, no head read, no load); after a failed save the newest held notice is checked; with two saves it waits for the last, and is dropped once disposed;
  - after a load that trusts the commit on show, the notice's commit is asked about; this tab's newer trusted head is asked about over an older notice;
  - someone else's push held through a save waits for the saved snapshot, then is checked on it and loads once.
- `tests/native-save/native-push-notice.spec.ts` (new; the fake GitHub server takes signed deliveries, `tests/native-save/fake-webhook.ts`):
  - after a commit made elsewhere, a signed delivery loads it in the open tab, with the new text on the page and no focus or visibility event;
  - a save whose push is delivered and heard 3 seconds before its answer reads the branch once (the save's own refresh) and the head never. With the hold taken out, this case fails.
- `tests/live-text.test.ts`: the open file's room hands the notice on with its draft scope.
- `tests/owner-setup.test.ts`: the manifest's active webhook and Push event, the webhook off with no events for `http://127.0.0.1:8787`, `https://localhost:8787` and an http origin, and the kept webhook secret (not shown on the page).

**Checks.** `RESULT: ok unit 3544/3544 (223 files)` (`scripts/agents/kit unit --affected`); `RESULT: ok specs 15/15 passed; 182 more run in kit pr` (`scripts/agents/kit specs --affected`, `native-push-notice.spec.ts` included); `npm run check` and `npm run lint` pass.

Feature list: new entry F-repo-12 "A push on GitHub shows within seconds" in `docs/agents/features.md`.

### UX follow-ups

- UX (looks off): F-component-08 Detach works and the section stays selected, but a dark "Section hero detached" pop-up rises at the bottom after the action and sits over the code pane in every frame (S4, HS1, U5) (.scratch/ux/fleet-lead/20261109-100337-FUDSee/add-panel-F-component-08-390-light-detach-strip.webp)
- UX (looks off): F-publish-01 the Publish button in the top bar carries a count badge ("Publish 1"), which S2 forbids on buttons; the menu itself is not shown (.scratch/ux/fleet-lead/20261109-100337-FUDSee/add-panel-F-component-08-390-light-detach-strip.webp)
- UX (looks off): F-repo-09 the project menu says "Link copied" on the item itself while the menu stays open, with Stop sharing below it and no toast, but at 390 px the share rows are only 32 px tall, below the 44 px needed for touch (.scratch/ux/fleet-lead/20261109-120814-YXTb38/editor-F-repo-09-390-light-copied-strip.webp)

### Follow-ups

- Validation gaps (gap): R3-4 still open: `tests/native-save/native-push-notice.spec.ts` still has only two browser tests. One is "a signed push loads the new commit in the open tab…". The other is "the tab's own save loads the branch once…". No browser test covers someone else's push held through this tab's save and loaded once after the refreshed snapshot. The new row is covered only by the unit test at `tests/save-publish-controller.test.ts:614`.
- Validation gaps (gap): R3-3 still open: `tests/save-publish-controller.test.ts` still has no case where the snapshot read after a save is rejected while a held notice waits on it. The only held-through-refresh test (lines 612–630) resolves `f.answers[0]`. The failed-save case at lines 575–581 never calls `published`, so `refreshing` is never set there.
- Previous findings (P3): R3-2 still open: there is no new code and no declined reason. Line 164 still queues a separate `.then(() => takeUpPush(...))` for every notice that arrives while the refresh runs. So once `refreshing` settles, each queued notice starts its own forced `checkHead(true, commit)` and its own `head` read. The `headCheck` token makes only the last one count, so this tab still loads the branch only once, but the extra GitHub reads still happen. Holding just the newest notice, as `heldPush` already does in `pushed`, would close it.
- Previous findings (P3): R3-1 still open: there is no commit after round 3, and R3-1 is not in the author's declined list, so it got no answer. `src/controllers/save-publish-controller.ts:164` is unchanged: `if (refreshing) { const after = refreshing; void after.then(() => takeUpPush(scope, commit)); return; }`. The race case raised in round 3 is still in the code as it was.
- Validation gaps (gap): R3-3: add to `tests/save-publish-controller.test.ts`: `beginSave()`, `pushed(scope1, other)`, `published(proof(), scope1, result(saved), [])`, `settle()`, then `f.answers[0].reject("down")` and `flush()`. Assert that `ports.fail` was called once, and that exactly one `head` call follows, with `commit: other`. Then resolve that call with `{ commit: other }` and assert exactly one load.
- Validation gaps (gap): R3-4: add a test to `tests/native-save/native-push-notice.spec.ts`. Start a save in the page and hold the fake server's snapshot answer back. During the save, send a signed push from a different commit with `fake-webhook.ts`. Then let the save answer, then let the snapshot answer. Assert that the page loads the branch exactly once, ending on the other commit, and that no `head` request reaches the fake server before the post-save snapshot request finishes.
- Validation gaps (gap): R1-7 still open: no unit test yet for a rejected snapshot read after a save while a notice waits on it. Recorded as R3-3 at ticket lines 102 and 105.
- Validation gaps (gap): R1-6 still open: no browser test yet for a push held through a failed (500) save. This one isn't in the ticket's follow-ups.
- Validation gaps (gap): R1-5 still open: there is still no browser test for someone else's push held through this tab's save and its follow-up snapshot. Recorded as R3-4 at ticket lines 101 and 106.
- Validation gaps (gap): R1-4 still open: there is still no browser spec that forces the settle order with `page.route` hold and release. The follow-up at ticket line 101 records it.
- Previous findings (P3): R1-3 still open: `tests/native-save/native-push-notice.spec.ts:61` and `:71` still state no fixture group tag. It isn't in the declined list or the follow-ups either.
- Previous findings (P3): R1-2 still open: it got no fix and no reason. It isn't in the declined list or the ticket's Follow-ups list (lines 99–106), so it got no answer at all. The new names `beginSave`, `publishSaving`, `saving` and `pushed` still appear only in code. The ticket's only mention of them is the `savePublish.pushed` wiring at line 58.
- Previous findings (P3): R1-1 still open: there is no new commit, so `src/controllers/save-publish-controller.ts:164` hasn't changed. Every push notice that arrives during the refresh still adds its own `after.then(() => takeUpPush(...))`, so several head checks run once the refresh settles. `refreshAfterPublish` catches its own errors (lines 351–353), so the promise never rejects and no notice is lost. That keeps this a nit. Commit 82e0814d4 recorded it as a follow-up on the ticket (lines 103–104), which is a fair way to answer a P3.
- Standards (P3): 9ec08acca:tests/native-save/native-push-notice.spec.ts:61 — P3 style: this is R1-3, carried over and not new. CODING_STANDARDS.md, Browser specs: "Each test states its fixture group by tag". Neither test has a `{ tag: ... }`. Fix: add the tag for the default group to both tests, or write the reason down as a follow-up.
- Standards (P3): 9ec08acca:docs/wayfinder/agents-and-multiplayer/build/tickets/32-github-push-to-tabs.md:90 — P3 style: this is R1-2, carried over and not new. The new port and API names are missing from the ticket's write-up. Fix: list `beginSave`, `publishSaving`, `saving`, `pushed` and `onPushed`, each with a line on what it does. Or add R1-2 to the Follow-ups list so it at least gets an answer. Declined findings: all three reasons are right. Each item comes from code that was there before this branch: the preview link box, `src/page-builder/components.ts:1550` and `src/components/publish-menu.ts:86-88`. I'm not raising them again. One gap in the records: the ticket's "UX follow-ups" section (lines 94–97) lists F-component-08 and F-publish-01 but not F-repo-11. So F-repo-11 has no ticket yet and will keep being flagged. I can't see the Orbit board from here, so I couldn't check whether any of the three made it on.
- Validation gaps (gap): R3-4 / R1-5 (also covers R1-4): add a test to `tests/native-save/native-push-notice.spec.ts`. Use `page.route` to hold back the save's follow-up request to `/api/snapshot`. During the save, send a signed push for a different commit with `fake-webhook.ts`. Let the save answer first, then the snapshot. Assert three things: the branch loads exactly once, it ends on the other commit, and no `/api/head` request leaves before the snapshot request finishes.
- Validation gaps (gap): R1-6: in the same spec, send a push from elsewhere while the save is held, then answer the save with a 500. Assert that exactly one `/api/head` request follows, carrying that commit, and that the page loads it once.
- Validation gaps (gap): R3-3 / R1-7: in `tests/save-publish-controller.test.ts`, call `beginSave()`, `pushed(scope1, other)`, `published(proof(), scope1, result(saved), [])` and `settle()`. Then run `f.answers[0].reject("down")` and `flush()`. Assert that `ports.fail` was called once and exactly one `head` call follows with `commit: other`. Resolve that call and assert exactly one load.
