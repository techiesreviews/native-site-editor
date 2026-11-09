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
  - After 2 seconds (so this tab's own save's answer, which names the same commit, lands first) the tab runs the existing head check with its own sign-in. It skips this when it already shows the commit, saved it itself, or the notice is for another scope.
  - The check asks about the pushed commit, so a GitHub read lagging behind it still gives it. A new head loads as Refresh does.
  - A hidden tab checks on its next focus. The focus check stays as the safety net, and so does an editor without the webhook or a browser with live sharing off.
- The fetch on notice is the existing head check in the save controller, so `src/github-reads.ts` did not change.
- Owner setup (`worker/owner-setup.ts`): the manifest now has the webhook active at `<origin>/api/github/webhook` with `default_events: ["push"]`. The `webhook_secret` GitHub returns with the App is kept in the stored App config (never sent to a browser). `readBoundedBytes` in `worker/http.ts` is now exported for the webhook.
- Lex's checklist for the existing App is in README.md, "Push notices for an existing App". Its values: tick Active; Webhook URL `https://editor.techies.tools/api/github/webhook`; a random secret of 40+ characters (`openssl rand -hex 32`), stored with `npx wrangler secret put GITHUB_WEBHOOK_SECRET --config wrangler.techies.jsonc`; subscribe to Push; no new permissions, no re-approval. `docs/setup.md` (manual App settings) and `dev.vars.example` name the webhook and the secret too.

**Test App run (Lex, 2026-11-09).** App ID 5677762 is a throwaway App on `techiesreviews`, installed only on the private repository `techiesreviews/editor-push-test`. It was created with its webhook off and Contents read and write, then installed. Then the webhook was turned on (pointed at `https://preview-editor.techies.tools/api/github/webhook`) and the Push event subscribed. **No approval banner appeared: adding the Push event did not ask installations to approve again**, because Push needs only Contents, which the App already had.

**Tests.**

- `tests/github-webhook.test.ts` (new):
  - signature checks (exact body, other secret, malformed headers);
  - which pushes are told (tags, deleted branches, malformed payloads are not);
  - the relay telling only open editor sockets;
  - the secret's precedence, and refusal with no secret.
- The Miniflare test in that file runs the real Worker with a signed-in tab in a real live room. A signed push reaches the tab's `onPushed` with the commit (`{ told: 1 }`). Unsigned, wrongly signed and changed-body deliveries get 401 and reach nothing. A form-encoded signed push also arrives. Another branch tells 0 tabs; a tag and a ping get 204; a GET gets 405.
- `tests/save-publish-controller.test.ts`: the notice's head check (pushed commit asked, the 15-second throttle skipped, the load). No read for the commit on show, the tab's own save (also when its answer lands during the wait), another branch or repository, or a hidden tab; the hidden tab checks on its next focus.
- `tests/live-text.test.ts`: the open file's room hands the notice on with its draft scope.
- `tests/owner-setup.test.ts`: the manifest's active webhook and Push event, and the kept webhook secret (not shown on the page).

**Checks.** `RESULT: ok unit 1733/1733 (91 files)` (`scripts/agents/kit unit --affected`); `RESULT: ok specs 5/5 passed; 94 more run in kit pr` (`scripts/agents/kit specs --affected`); `npm run check` and `npm run lint` pass.

Feature list: new entry F-repo-12 "A push on GitHub shows within seconds" in `docs/agents/features.md`.
