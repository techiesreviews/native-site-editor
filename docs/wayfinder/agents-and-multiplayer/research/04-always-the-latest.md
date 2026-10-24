# Always the latest files

Researched 2026-10-24 for [ticket 04](../tickets/04-research-always-the-latest.md). Planning only: nothing in the editor was changed. Facts from documentation carry the date they were read; facts from this repository describe branch `dev` at c15a1f93.

## Short answer

- **GitHub sites: use a push webhook, keep a slow check as a safety net.** GitHub tells the editor's Worker the moment a branch moves (anyone's push, a merged pull request, Claude Code pushing). The Worker passes one short message ("branch main is now at commit X") down a live connection to the open tabs, and each tab fetches the new files itself. Expect a few seconds from push to screen. It costs about one request per push plus a handful per open tab per hour, far inside Cloudflare's free plan, and uses none of GitHub's request budget. Polling every few seconds instead would cost about 720 requests per tab per hour and still lag.
- **Local folders: the browser can already watch a folder.** Chrome and Edge (133 and later) and Opera (118) have the folder watcher (`FileSystemObserver`); it saw another program's changes in 1 to 33 ms in our earlier test. Firefox and Safari cannot open a folder at all, so they need no fallback. Only Chromium browsers without the watcher (Android Chrome, perhaps Brave) need a check every few seconds.
- **Today the editor only looks when you come back to the tab.** On GitHub it checks for a new commit when the tab is shown or focused, at most every 15 seconds; while you sit in the tab, nothing new appears. Local folders are planned, not built.
- **Folding changes into unsaved work is possible with what drafts already store.** Every draft remembers the text it started from, so the editor can merge "their change" and "your change" when they touch different lines, and only ask when both changed the same spot. With live shared editing, an outside change becomes just another editor typing.
- **Coding tools need nothing extra in most cases.** Claude Code writing into an open local folder is seen by the watcher; Claude Code pushing to GitHub triggers the webhook; Claude Code using the editor's MCP already proposes drafts. The one gap is a coding tool editing a local copy of a GitHub site without pushing; a small Claude Code hook could report those writes, but it is optional.

## What the editor does today

- **GitHub, checking for a newer commit.** `checkHead` in [save-publish-controller.ts](../../../../src/controllers/save-publish-controller.ts) asks the Worker's `/api/head` route ([app.ts](../../../../worker/app.ts), `GitHub.head` in [github.ts](../../../../worker/github.ts)) which commit the branch points at. It runs only when the tab is shown or focused again (at most every 15 seconds) and after a refused save. A new commit reloads the site like Refresh. It reads GitHub's branch endpoint with caching switched off and without ETags (a conditional request, see below), so every check counts against the user's GitHub budget.
- **GitHub, what happens to drafts.** On reload, a file without drafts simply shows GitHub's new version. A draft whose starting version (`baseSha`) differs from GitHub's raises a conflict (`DraftStore.open` in [draft-store.ts](../../../../src/draft-store.ts)); drafts that now equal GitHub's text are dropped, and drafts of files GitHub deleted wait for Discard draft or Keep as new file ([file-changes.ts](../../../../src/file-changes.ts)). CONTEXT.md, "Outside change", records the same rule.
- **The GitHub App has webhooks switched off.** The App manifest in [owner-setup.ts](../../../../worker/owner-setup.ts) sends `hook_attributes: { active: false, url: …/auth/setup/webhook }` and no `default_events`. No route answers that URL. When GitHub converts the manifest it hands back a webhook secret, but the editor keeps only `clientId`, `clientSecret` and `slug` (`GitHubAppConfig`). Permissions already include `contents: write`, which is what the push event needs.
- **A live connection to tabs already exists, but only for agents.** The agent relay ([agent-relay.ts](../../../../worker/agent-relay.ts), `SessionStore` in [index.ts](../../../../worker/index.ts)) is a Durable Object per account, repository and branch with hibernating WebSockets and a ping auto-reply; the tab pings every 45 seconds ([agent-transport.ts](../../../../src/agent-transport.ts)). Only the receiving tab connects, and only while agents are on.
- **Tabs in one browser already share drafts.** A `BroadcastChannel` re-reads drafts another tab saved ([drafts.ts](../../../../src/drafts.ts)).
- **Local folders: planned, not built.** No `FileSystemDirectoryHandle` code exists in `src/`. The plan is in the [local folders map](../../local-folders/map.md); [ticket 07](../../local-folders/tickets/07-outside-changes.md) settled outside changes there: pick them up within about a second with the watcher, every few seconds without it; gather a burst into one update and one short note; the folder wins and an affected draft is removed without recovery; hidden tabs pause and catch up on return and before Save. Ticket 07 itself says this is not shared editing and leaves the merge question to this map.

## GitHub: webhook or polling

### How a webhook would work

1. Someone pushes to a branch. GitHub sends a `push` event to the App's one webhook address, a route on the editor's Worker. The event names the repository, the branch (`ref`), the commit before and after, and up to 2,048 commits with their changed files. A GitHub App needs at least read access to Contents to receive it. Events are skipped when more than 5,000 branches or more than three tags are pushed at once. [GitHub, webhook events: push, read 2026-10-24](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push)
2. The Worker checks the signature with the webhook secret and answers within 10 seconds, or GitHub counts the delivery as failed. Duplicates share an `X-GitHub-Delivery` id. [GitHub, best practices for webhooks, read 2026-10-24](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
3. The Worker forwards "repository R, branch B, now commit X" to a Durable Object that holds the WebSockets of tabs open on R and B, which sends it to each. Outgoing WebSocket messages are free; a hibernating object is not billed for idle time. [Cloudflare, Durable Objects pricing, read 2026-10-24](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Cloudflare, WebSocket hibernation, read 2026-10-24](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
4. Each tab compares X with what it shows and, if newer, loads the change with its own GitHub sign-in, as `checkHead` does now. No file content and no draft passes through the Durable Object, so the rule "drafts are never mirrored in Durable Objects" holds.

Design points for later tickets:

- **Who listens.** Today's relay is keyed by account, repository and branch and only open while agents are on. A push names a repository, not an account, so either every open tab joins a per-repository-and-branch "watch" object (tabs are already authorized per repository when they connect), or the Worker keeps a small list of which relay objects have tabs. The first is simpler and also suits shared editing with collaborators (ticket 03), who work on the same repository under different accounts.
- **The editor's own saves** come back as pushes too; the tab already knows the commit it just made (`seeHead`) and ignores it.
- **Missed deliveries.** GitHub does not redeliver failed deliveries automatically; an app can list and redeliver them through the REST API. [GitHub, handling failed deliveries, read 2026-10-24](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) So keep today's check on focus and on reconnect as the safety net, and the check before Save.
- **Speed.** GitHub promises "near real-time", with no number. [GitHub, about webhooks, read 2026-10-24](https://docs.github.com/en/webhooks/about-webhooks) Not measured here; a few seconds is the usual experience and should be checked in a proof.

### How polling compares

| | Push webhook | Poll every 5 s | Today (on focus, 15 s floor) |
|---|---|---|---|
| Delay while you watch | seconds | up to 5 s, plus GitHub's caching (see below) | never, until you leave and return |
| Cloudflare requests | 1 Worker + 1 Durable Object per push; 1 to connect a tab; about 4 per tab-hour for the 45-second pings (incoming messages bill at 20:1) | 720 per tab-hour | a few per hour |
| GitHub budget (5,000 per hour per user) | none | 720 per tab-hour, or near zero with ETags | a few per hour |
| Extra setup | webhook secret, one route, event subscription | none | none |

- **Cloudflare free plan:** 100,000 Worker requests a day for the whole deployment, then error 1027; Durable Objects 100,000 requests and 13,000 GB-s a day; when a free limit is hit, further operations of that kind fail. Workers Paid: Durable Object requests $0.15 per million after 1 million a month. [Cloudflare, Workers limits, read 2026-10-24](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects pricing, read 2026-10-24](https://developers.cloudflare.com/durable-objects/platform/pricing/) Polling every 5 seconds spends the whole free day in about 139 tab-hours; one person with two tabs for eight hours uses about 11,500 requests. The webhook path uses well under 100 for the same day.
- **GitHub budget:** a user's token (what the editor uses) has 5,000 requests an hour, shared with everything else acting for that user; 15,000 for apps owned by an Enterprise Cloud organization. Secondary limits: at most 100 requests at once and 900 points a minute. Continuing while limited can get the app banned. [GitHub, REST rate limits, read 2026-10-24](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- **ETags make polling cheaper on GitHub's side, not on Cloudflare's.** A conditional request (`If-None-Match` with the last answer's ETag) that returns 304 does not count against the budget when signed in. GitHub's own advice is to subscribe to webhooks instead of polling. [GitHub, REST best practices, read 2026-10-24](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) Checked 2026-10-24: the branch endpoint returns an ETag, answers 304 to it, and sends `cache-control: max-age=60`; signed out, the 304 still counted. Whether a signed-in poll can see a stale answer for up to 60 seconds was not tested.
- **GitHub's Events API is not an option:** "not built to serve real-time use cases", latency "anywhere from 30s to 6h". [GitHub, events API, read 2026-10-24](https://docs.github.com/en/rest/activity/events)

### What a self-hoster sets up

- **New installs through the Deploy button and setup page:** the manifest can do it. Set `hook_attributes.active: true` with a real route, add `default_events: ["push"]`, and store the `webhook_secret` GitHub returns from the manifest conversion beside the client secret. [GitHub, registering an App from a manifest, read 2026-10-24](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) Nothing extra for the self-hoster to do.
- **Apps that already exist** (Lex's techies App and any earlier self-host): a manifest only applies when the App is created. The owner opens the App's settings on GitHub once: turn the webhook on, enter the editor's webhook address, set a secret, tick the Push event; then saves the secret in the editor (a Worker secret for env-configured Apps, or the stored App config). The editor could show these steps in its setup page. [GitHub, using webhooks with GitHub Apps, read 2026-10-24](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps) The App already has Contents permission, so no new permission should be needed; whether adding an event asks installations to re-approve was not stated in the pages read and should be checked on a test App.
- **Local development:** GitHub cannot reach `localhost`; a forwarding service such as smee is needed, or rely on the focus check.
- **Cost:** stays inside the free plan for a small team; no new Cloudflare service, as the Durable Object class already exists.

## Local folders: watching from the browser

- **Support (MDN browser data 8.1.7, 2026-10-22):** `FileSystemObserver` in Chrome 133, Edge 133, Opera 118; not Android Chrome, Firefox or Safari; marked experimental and not on a standards track. Opening a folder (`showDirectoryPicker`): Chrome and Edge 86, Android Chrome 132; not Firefox or Safari. [MDN, FileSystemObserver, read 2026-10-24](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver) · [browser-compat-data](https://unpkg.com/@mdn/browser-compat-data/data.json)
- **Standards:** a proposal in the WHATWG file system repository by Google; Mozilla positive, WebKit no signal. It reports `appeared`, `disappeared`, `modified`, `moved`, `unknown` (some changes may have been missed, look again) and `errored` (watching has stopped). Delivery is best effort, may be batched, has no promised delay, and covers only changes while the page watches. [FileSystemObserver explainer, read 2026-10-24](https://github.com/whatwg/fs/blob/main/proposals/FileSystemObserver.md)
- **Measured earlier** (local-folders research 01, 2026-10-13, headless Chromium 153 on Linux, commit e1f8bd80): another program's changes arrived in 1 to 33 ms; the editor's own saves are reported too; the first watch in a browser session costs about 2 s, then about 25 ms for 10,000 files. Polling costs about 60 ms per 1,000 files per check; file times alone missed 7 to 34% of quick same-size rewrites, so a content fingerprint is needed before trusting "unchanged". Windows and macOS were not measured.
- **Fallback:** where a Chromium browser opens folders but lacks the watcher, check sizes and times every few seconds while visible, and fingerprints before Save, as ticket 07 decided. Firefox and Safari need a different route entirely (no folder access), which is out of this ticket.

## Folding an outside change into unsaved work

Today both sources throw one side away or stop: GitHub raises a conflict, the local-folder plan removes the draft. Options for [ticket 09](../tickets/09-grill-outside-changes-live.md):

1. **Keep today's rules, just notice sooner.** Simplest; a draft still conflicts (GitHub) or disappears (folder). With agents writing files often, this throws away work often.
2. **Merge by lines, ask only when both changed the same spot.** A draft stores its starting text (`base`) and starting version (`baseSha`) next to the edited text ([draft-store.ts](../../../../src/draft-store.ts)). With the new outside text, that is a three-way merge, the way git merges: changes in different places combine silently, the draft's starting point moves to the new version, Undo stays. Overlapping changes fall back to today's rule, or to a choice shown in place. HTML and CSS merge reasonably by line; a merge that leaves broken markup should be treated as overlapping.
3. **With live shared editing (ticket 03):** an outside change is turned into edits (a diff from the version the shared copy last loaded to the new text) and applied as one more participant. Shared-editing libraries merge it with live typing like any other edit. The shared copy must remember which file version it is based on, and must recognise its own saves coming back (by commit or by fingerprint) so it does not apply them twice. The same diff step serves agents whose MCP edit replaces a whole file.

Both 2 and 3 work the same for GitHub and folders once the new text is in hand; the only difference is how the editor learns of it (webhook or watcher).

## Coding tools writing files directly

| What the tool does | How the editor learns | Extra needed |
|---|---|---|
| Writes into a local folder the editor has open | the folder watcher | none |
| Pushes to GitHub (including Claude Code, a merged pull request) | push webhook | the webhook above |
| Uses the editor's MCP tools | already proposes drafts in the open tab | none |
| Edits a local copy of a GitHub site and does not push | nothing reaches GitHub | optional, below |

For the last row: open that local copy as a local-folder site instead, or add a Claude Code hook. `PostToolUse` hooks run after a tool succeeds, can match `Edit|Write`, and can run a command or POST the event (which includes the tool's arguments) to a URL. [Claude Code hooks, read 2026-10-24](https://code.claude.com/docs/en/hooks) A hook could send the changed file to the editor as a proposed draft through the existing agent connection. A general local helper program that watches folders and reports to the editor would also give Firefox and Safari users local folders, but it is a separate product to install; nothing in this ticket needs it.

## Open questions for the grilling tickets

- Per-repository watch object for every open tab, or extend the agent relay (ticket 08 or 09; affects the Durable Object reduction rules only in wording, since no content is stored).
- Line merge for drafts now, or wait for shared editing (ticket 09).
- Whether to change the local-folder rule "the folder wins" to a merge (reopens a closed local-folders decision; Lex's call).
- Setup page steps for owners of existing Apps.

## Sources

All read 2026-10-24 unless noted.

- GitHub: [webhook events and payloads (push)](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push) · [about webhooks](https://docs.github.com/en/webhooks/about-webhooks) · [best practices for webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) · [handling failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) · [using webhooks with GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps) · [registering an App from a manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) · [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) · [REST best practices (conditional requests)](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) · [events API](https://docs.github.com/en/rest/activity/events)
- GitHub API probe, 2026-10-24 14:52 UTC: `GET /repos/techiesreviews/native-site-editor/branches/main` signed out, then with `If-None-Match`: ETag present, 304 returned, `cache-control: public, max-age=60, s-maxage=60`.
- Browsers: [MDN FileSystemObserver](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver) · [MDN browser-compat-data 8.1.7 (2026-10-22)](https://unpkg.com/@mdn/browser-compat-data/data.json) · [FileSystemObserver explainer](https://github.com/whatwg/fs/blob/main/proposals/FileSystemObserver.md) · [Chrome origin trial post (2024)](https://developer.chrome.com/blog/file-system-observer) · [Chrome Platform Status 4622243656630272](https://chromestatus.com/feature/4622243656630272) (read 2026-10-13 in local-folders research 01) · local-folders research 01, `docs/wayfinder/local-folders/research/01-browser-support.md` at commit e1f8bd80 (measurements 2026-10-13).
- Cloudflare: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- Claude Code: [hooks](https://code.claude.com/docs/en/hooks)
- Repository (dev, c15a1f93): `worker/owner-setup.ts`, `worker/github.ts`, `worker/app.ts`, `worker/agent-relay.ts`, `worker/index.ts`, `src/controllers/save-publish-controller.ts`, `src/draft-store.ts`, `src/file-changes.ts`, `src/drafts.ts`, `src/agent-transport.ts`, `wrangler.jsonc`, `CONTEXT.md`, `docs/wayfinder/local-folders/tickets/07-outside-changes.md`.
