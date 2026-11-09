---
title: "Hot preview link"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [30-synced-session]
---

## Goal

Show a site to a customer as it is being edited.

## Decided behaviour

[Ticket 11](../../tickets/11-grill-preview-link.md#resolution-2026-10-24):

- The real site at a subdomain of a separate preview domain updates live while Lex's editor is open, through the live room, with nothing stored.
- It shows a plain "not running" page while his editor is closed.
- Anyone with the link can open it; search engines are told to stay out; it lasts until turned off or 30 days.
- Site scripts run on the preview domain, never the editor's.
- Self-hosters use their own `workers.dev` address or domain.
- **No custom domain (Lex, 2026-10-25):** a separate preview Worker on its own `workers.dev` address, with a path per site (README, lead decisions).
- Mock-up approved by Lex (2026-10-27): [15-outside-changes-and-preview-link.html](../../prototypes/15-outside-changes-and-preview-link.html)

## Files

Expected (confirm while designing): a new `worker/preview-host.ts` (serves the preview domain), `worker/app.ts`, `wrangler.jsonc` (route for the preview domain), `src/components/repository-menu.ts` (Share preview, turn off), a new `src/preview-share.ts`; tests and a spec.

## Done when

- A spec: Lex shares a preview; a visitor context sees his edits arrive live; closing his editor shows not running; turning it off refuses the link.
- Responses carry `X-Robots-Tag: noindex`.
- The preview domain never receives editor cookies (test).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-35 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-35 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).

## Done (2026-11-09)

- Share preview in the project menu (`src/components/preview-menu.ts` `previewItems`, mock-up 15): shown only while a site is open on an editor whose Worker has `PREVIEW_ORIGIN` set (the session's `previewLinks`). It asks the Worker for a link, makes the room key in the tab and copies `<preview origin>/s/<site>-<token>/#k=<key>`; the menu then shows the link in a read-only field with Copy (which says "Copied" on itself for 2.5 s; a refused copy selects the field), "Works while your editor is open · ends <date>" and Turn preview off, the menu staying open. Refusals say "Sign in to share" or "Couldn't share preview" (and "Couldn't turn off") on the item for a moment; no toast.
- The link (`shared/preview-link.ts`, `worker/app.ts` `previewRoute`): the token is 128 random bits, its end (30 days) and a tag over both made with the GitHub App's secret, so a made-up, forged, stretched or ended link is refused (400, 410) before any Durable Object wakes; the sharing tab gets its own proof bound to its login and repository, never in the link. Each link has its own relay instance (`worker/agent-relay.ts` `livePreviewObjectName`). Lex's tab serves it through `/api/live/preview` (editor sign-in, repository access, the proof); visitors join through `/api/live/visit` with the token alone, only while his tab serves it; a plain request says running (204), not running (409) or turned off or ended (410). Turn preview off (`/api/live/preview/off`, with the proof) closes every socket in the instance (4410, `LiveRooms.endAll`) and stores one mark until the link would have ended, cleared by the instance's alarm (`worker/index.ts`); nothing else is stored.
- The preview Worker (`worker/preview-host.ts`, `wrangler.preview-host.jsonc`, a separate Worker on its own `workers.dev` address, with `--env techies` and `--env preview` for the reference deployments): it serves the link's page (`preview-visit.html`, `src/preview-visit.ts`), `/robots.txt` (disallow all) and the service worker; every answer carries `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and no `Set-Cookie`. The room's socket goes to the editor's Worker through the EDITOR service binding as a fresh request, so no cookie, origin or address of the visitor's crosses. Only those paths run the Worker; the build's hashed `/assets/` are served as static files (no Worker request), and the editor's own pages are not reachable there. `wrangler.jsonc` gains `PREVIEW_ORIGIN` (empty: preview links off).
- The real site: the visitor's page opens the room and shows the site in a frame at `<link>/site/<page>`, starting on the page Lex has on show; a service worker (`previewServiceWorker`, scope the whole preview origin) answers every request of that site, root-relative addresses included (`/styles/site.css` from a page of the link, and links out of it moved under the link), by asking the link's page, which asks Lex's tab through the room. Lex's tab (`src/preview-serve.ts` `servePreview`) answers as a static host would (`resolvePreviewPath`: folder `index.html`, the file, a move to the folder's slash, `<path>.html`, the site's `404.html`; hidden files such as `.editor/` and `.github/` never), from the editor's copy with unsaved changes. While a visitor is in it looks at the files it answered every 600 ms, comparing by git blob id (so the branch's copy and the same text held unsaved are one); when one changed it tells visitors, whose page draws the site again where they were, behind the old frame until it has loaded. The site's scripts run on the preview origin only.
- Not running and back: Lex's tab closing ends the room for visitors, whose page says "Not running / This preview shows edits while the editor is open." and looks again (5 s, then up to every 60 s, only while shown, at once when shown again). The link and its key are kept in this browser per sign-in, repository and branch (`src/preview-control.ts` `createPreviewControl`), so opening the editor on that site again serves it by itself. Turned off, the page says "This preview link is turned off."; past its end, "This preview link has ended.".
- Boot: Share preview's boot part is the menu's port (`src/preview-share.ts`); its state, serving and menu items load 3 s after the first paint in one chunk (`src/preview-later.ts`). The visitor's page imports nothing of the editor's boot code: the room's message wire moved from `src/live-session.ts` to `src/live-wire.ts` (live-session re-exports it). With a third page the module-preload polyfill would have become a chunk of its own on the editor's way to first paint; it is off (`vite.config.ts`), as every supported browser preloads modules itself.
- Files beyond the expected list: `src/main.ts` (wiring on existing lines; still 540), `src/workspace-mount.ts` (the menu port, told after each paint), `shared/types.ts` (`previewLinks`), `vite.config.ts`, `src/live-session.ts` and `src/live-wire.ts`, `scripts/check-exports.mjs` and its allow list (the two new entry files), the test server (`tests/native-save/server.ts`, `fake-websocket.ts`: the preview Worker on `localhost` beside the editor on 127.0.0.1).
- Not built here: visitors do not follow Lex's page (they start on it and browse on their own); a link is served only by the browser that made it (the key never reaches a server); the reference deployments still need the preview Worker deployed and `PREVIEW_ORIGIN` set in `wrangler.techies.jsonc` and `wrangler.preview.jsonc`, which the lead does.
- Not built here either: sites are not kept apart from each other. Every link is a path on one preview address (Lex, 2026-10-25: no custom domain), so previewed sites share one origin: their cookies, local storage, IndexedDB and the one service worker, other users' sites on the hosted editor included. A site link with `target="_top"` to a root-relative address leaves the link's page, whose files then say "Open the preview link again." The weekly update redeploys only the editor; a self-hoster's preview Worker is redeployed by hand (`wrangler.preview-host.jsonc` says so).
- Tests: `tests/native-save/native-preview-link.spec.ts` (Lex shares a preview; a visitor in another browser sees the real site, its root-relative stylesheet and script served on the preview's address, and his typing arrive live; Lex's own browser opening the link sends no cookie to the preview's address; closing his editor shows "Not running", opening it again brings the site back by itself; turning it off shows "turned off" on the visitor's page, refuses a fresh open and answers 410); `tests/preview-host.test.ts` (path, slug, end and media types; static-host answers and hidden files; noindex and no cookie on every preview Worker answer; the room's request carries none of the visitor's headers; the service worker's routing, moves and refusals on a fake scope); `tests/preview-routes.test.ts` (Miniflare: no preview Worker, no links; minting, made-up, forged, stretched, doubled and ended tokens, not running, the proof, origins, turning off and the instance's mark; `endAll` closing every socket); `tests/preview-share.test.ts` (serving files from the editor's copy, only visitors' asks, a new version on change and none for the same text held; the control's kept link, serving per workspace, forgetting a link refused with 410, turning off, refusals).
- Validation: `RESULT: ok unit 4090/4090 (268 files)`; `RESULT: ok specs 2/2 passed` (native-preview-link, native-share-live) and `RESULT: ok specs 5/5 passed` (native-branch-menu, native-collaborators-join, native-page-together, native-live-text, native-org-repositories); `RESULT: ok size boot 355 KB (±0 KB) vs dev@8719999, budget 355 KB` (363,448 of 363,520 bytes measured); `npm run check` and `npm run lint` clean; `RESULT: ok doctor 11/11 checks passed` (5 kit setup pieces reported missing, outside this slice).
- Feature list: F-repo-11 Share preview (steps `scripts/agents/shots/features/F-repo-11.json`). Code map: a Preview links row. CONTEXT.md: Preview link.

### Review fixes (2026-11-09)

- An encoded slash (`/docs%2F.env`) is refused (400), so a hidden file cannot be reached as one part of two folders (`resolvePreviewPath`).
- A link left open on a closed editor costs little: the preview Worker answers a link's "not running" (409) or "over" (410) look from memory for 20 s (and from the Cache API where it works), and the visitor's page looks again ever more rarely, up to every 5 minutes, only while shown.
- Answers go to whoever asked: a visitor takes the site from one of Lex's serving tabs (from its hello; another when that tab leaves), names it and itself in each ask, and Lex's tab answers once for every visitor waiting on the same file, addressed to them (`to`); the others drop it. The relay still forwards each frame to the whole room.
- The project menu draws, and loads, nothing of Share preview unless it is available (a preview Worker and a site shown).
- The build's `/assets/` carry `X-Robots-Tag: noindex` (`public/_headers`), on the preview address too.
- The service worker answers a `Range` request with 206 and that part of the file (416 out of range), so video and audio play in Safari.
- Share preview's three passing labels (Copied, a refused share, a refused turn-off) each have their own timer.
- A link is also held in memory, so Turn preview off reaches the server when the browser refused to keep it.
- `src/main.ts` wires both shares through `src/workspace-shares.ts` (`createWorkspaceShares`): one import and one statement.
- Tests: `tests/preview-host.test.ts` (encoded slashes, ranges, the 20 s memo), `tests/preview-menu.test.ts` (a browser page: nothing drawn or loaded without a preview Worker; refusals and their moments; Copied going back after a refused turn-off), `tests/preview-share.test.ts` (answers addressed and shared by two visitors, two tabs serving one link answering once, turn-off with storage refused), `tests/asset-headers.test.ts` (noindex on assets).
- Validation: `RESULT: ok unit 4099/4099 (270 files)`; `RESULT: ok specs 2/2 passed` (native-preview-link, native-share-live); `RESULT: ok size boot 355 KB (±0 KB) vs dev@8719999, budget 355 KB` (363,486 of 363,520 bytes); `npm run check` and `npm run lint` clean; `RESULT: ok doctor 11/11 checks passed`.
- UX fix: on touch, Share preview, the link's field, Copy and Turn preview off are at least 44 px tall (`--size-tap`, `src/components/preview-menu.css`); `tests/native-save/native-preview-link.spec.ts` measures them on a 390 px phone.

### UX follow-ups

- UX (looks off): F-repo-05 at 390 px the Branches flyout opens on top of the repository list and hides the repository row behind it (only "native-demo-user · private" shows), in light and dark; at 1280 it covers part of the page heading behind the menu (.scratch/ux/fleet-lead/20261109-010159-XAaPDd/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-phone-03 at 390 px the top bar takes two rows (the project name on the first, then Undo, Redo, History and Publish on the second), where the mock-up's top bar is one row; Publish stays in view once the page has loaded (.scratch/ux/fleet-lead/20261109-010159-XAaPDd/editor-F-repo-01-390-light-open-strip.webp)
- UX (looks off): F-repo-01 the site does land on its home page, but first a full explorer sheet that nobody opened ("Loading pages…" / "Loading files…") covers the screen for several frames, so it does not open straight into the preview (HS9) (.scratch/ux/fleet-lead/20261109-025238-W0mBrz/editor-F-repo-01-1280-light-open-strip.webp)
- UX (looks off): F-repo-06 the refresh lands back on the same Home page in light and dark, but the Refresh from GitHub icon is about 24 px at 390, under the 44 px touch size (HS18), and the explorer loading sheet covers the screen again before the page comes back (.scratch/ux/fleet-lead/20261109-025238-W0mBrz/editor-F-repo-06-390-light-refresh-strip.webp)
- UX (looks off): F-setup-09 "Sign out of native-demo-user" shows at the foot of the project menu in light and dark, but at 390 px the row is only 32 px tall, under the 44 px touch size (HS18) (.scratch/ux/fleet-lead/20261109-041343-57Tm4D/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-02 Find a repository sits at the top of the repository list and reads well in both themes, but at 390 px the field is 32 px tall and the Repositories refresh button beside it is 24 px, both under 44 px for touch (HS18); the narrowed list is not shown (.scratch/ux/fleet-lead/20261109-041343-57Tm4D/editor-F-repo-05-390-dark-branches-strip.webp)
- UX (looks off): F-repo-03 "+ Add repositories" with its outside-link arrow shows under the list, but at 390 px the row is 32 px tall, under 44 px (HS18); coming back from GitHub is not shown (.scratch/ux/fleet-lead/20261109-041343-57Tm4D/editor-F-repo-05-390-light-branches-strip.webp)
- UX (looks off): F-repo-09 Share to edit shows with its icon in the open menu, as it should while a site is open, but at 390 px its button is 32 px tall, under 44 px (HS18); the Link copied state and the guest page are not in the bundle images (.scratch/ux/fleet-lead/20261109-041343-57Tm4D/editor-F-repo-05-390-dark-branches-strip.webp)
- UX (looks off): F-repo-11 Share preview shows with the eye icon, as in the mock-up's menu, but at 390 px its button is 32 px tall, under 44 px (HS18); the link, Copy, "Works while your editor is open · ends …", Turn preview off and the visitor's page are not in the bundle images (.scratch/ux/fleet-lead/20261109-041343-57Tm4D/editor-F-repo-05-390-light-branches-strip.webp)

### Second review fixes (2026-11-09)

- A site in a folder of its address (`.editor/config.json` `site.url`, e.g. `https://user.github.io/my-site/`) previews: Lex's tab takes the folder off an asked address before choosing the file, puts it back on a move, and still answers the same address without it (`src/preview-serve.ts`).
- Turning a link off while the preview Worker remembers "not running" shows "turned off" at once: a visitor's page whose socket closed, or that was just opened, asks afresh (`?fresh=1`), the editor's 410 replaces the remembered 409, and a running answer clears the memory.
- A live reload scrolls the new frame back after it is shown, and again once its pictures still loading have finished, unless the visitor moved first (`src/preview-visit.ts`).
- Share preview shows and copies the link once Lex's tab serves it (`servePreview` waits for the room, at most 10 s), so a link opened at once is running.
- The preview Worker's entry is its own module, `worker/preview-entry.ts` (wrangler `main`): the Workers runtime takes every export of the entry for a handler and refused `worker/preview-host.ts`'s constants. `npx wrangler deploy --dry-run --config wrangler.preview-host.jsonc` binds EDITOR and ASSETS.
- Tests: `tests/native-save/native-preview-link.spec.ts` shares `fixtures/native-subfolder` (its `/my-site/` stylesheet and picture, the script without the folder, a move kept in the folder, the note link); `tests/preview-host.test.ts` (a fresh look after turning off gets 410 and replaces the remembered 409; running clears it); `tests/preview-share.test.ts` (folder taken off, kept on moves, hidden files and look-alike folders refused); `tests/preview-routes.test.ts` (Miniflare with both Workers: a visitor's socket on `/s/<site>-<token>/live` spliced through the EDITOR binding into Lex's room, one frame each way).
- Validation: `RESULT: ok unit 4102/4102 (270 files)`; `RESULT: ok specs 2/2 passed` (native-preview-link, native-share-live); `npm run check` and `npm run lint` clean; `RESULT: ok doctor 11/11 checks passed`.
- UX round 3: Share preview passed (F-repo-11). The export check's allow list loses its stale `shared/media-kinds.ts` `mimeType` entry, now that preview links take their media types from it.

### Follow-ups

- Validation gaps (gap): R9-35 still open: there is no spec where two tabs serve one link and the visitor's source tab is closed.
- Validation gaps (gap): R9-34 still open: there are no 416 asserts for `bytes=0-` on a 0-byte file or `bytes=-0` on a 100-byte file.
- Validation gaps (gap): R9-33 still open: there is no hand-resolved `serve` seam test covering the "starting" state, a workspace switch, and a refusal not being overwritten.
- Validation gaps (gap): R9-32 still open: there is no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R9-31 still open: there is no spec that checks the visitor's `scrollY` after an edit and after a slow picture loads.
- Validation gaps (gap): R9-30 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R9-29 still open: summary line; all of the carried-over gaps it lists are still open.
- Validation gaps (gap): R9-28 still open: no commit since round 9; nothing tests the visitor moving between two serving tabs (R5-8).
- Validation gaps (gap): R9-27 still open: no commit since round 9; no 416 asserts for an empty range or for `bytes=-0` (R5-7).
- Validation gaps (gap): R9-26 still open: no commit since round 9; nothing tests Share preview waiting for `startServing` (R5-4).
- Validation gaps (gap): R9-25 still open: no commit since round 9; nothing tests the 10 s limit in `servePreview` (R5-3).
- Validation gaps (gap): R9-24 still open: no commit since round 9; nothing tests `settleScroll` or the scroll restores (R5-2).
- Validation gaps (gap): R9-23 still open: no commit since round 9; R2-4 and R2-5 (R5-1, R5-12) still have no tests.
- Validation gaps (gap): R9-22 still open: no commit since round 9; summary line, and all of its gaps are still open.
- Validation gaps (gap): R9-21 still open: no commit since round 9; none of the R5-13 group of tests was added.
- Validation gaps (gap): R9-20 still open: no commit since round 9; R2-4 and R2-5 still have no tests.
- Previous findings (P3): R9-19 still open: `src/preview-visit.ts` and `src/preview-serve.ts` are unchanged, so a handover between tabs still makes visitors reload once for each visitor that moved. No answer and not declined.
- Previous findings (P3): R9-18 still open: `src/preview-serve.ts` is unchanged. If the editor and the preview Worker run different builds, every file still fails with no reason given. No answer and not declined.
- Previous findings (P3): R9-17 still open: `tests/preview-menu.test.ts` is unchanged. Its three undocumented `globalThis as never as { menu: … }` casts are still there (CODING_STANDARDS "Test fixtures"). No answer and not declined.
- Validation gaps (gap): R9-16 still open: there is still no spec with two serving editor tabs where the visitor's source tab is closed.
- Validation gaps (gap): R9-15 still open: `tests/preview-host.test.ts` is unchanged and has no 416 asserts for `bytes=0-` on a 0-byte file or `bytes=-0` on a 100-byte file.
- Previous findings (P3): R9-14 still open: `src/preview-control.ts` is unchanged, so a 400, 403 or 410 refusal that arrives while `start()` waits is still overwritten by the later "on" state. No answer and not declined.
- Previous findings (P3): R9-13 still open: `src/preview-serve.ts` is unchanged, so `/my-site` still answers 200 where a static host answers 301. The builder has given no answer, and it is not in the declined list.
- Validation gaps (gap): R9-12 still open: `tests/preview-share.test.ts` is unchanged and has no case that resolves the `serve` seam by hand.
- Validation gaps (gap): R9-11 still open: there is still no fake-timer test where the room's `ready()` never settles.
- Validation gaps (gap): R9-10 still open: `tests/native-save/native-preview-link.spec.ts` is unchanged and still never checks the visitor's `scrollY`.
- Validation gaps (gap): R9-9 still open: no commit since round 9; R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R9-8 still open: no commit since round 9; summary line, and none of its gaps is closed.
- Validation gaps (gap): R9-7 still open: no commit since round 9; R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R9-6 still open: no commit since round 9; nothing tests `settleScroll` or the scroll restores (R5-2).
- Validation gaps (gap): R9-5 still open: no commit since round 9; nothing tests the 10 s limit in `servePreview` (R5-3).
- Validation gaps (gap): R9-4 still open: no commit since round 9; nothing tests Share preview waiting for `startServing` (R5-4).
- Validation gaps (gap): R9-3 still open: no commit since round 9; there is no 416 test for an empty range or for `bytes=-0` (R5-7).
- Validation gaps (gap): R9-2 still open: no commit since round 9; nothing tests the visitor moving between two serving tabs (R5-8).
- Validation gaps (gap): R9-1 still open: no commit since round 9, so none of the carried-over gaps has a test yet.
- Validation gaps (gap): No new gaps. The carried-over gaps are R9-1 to R9-12, R9-15, R9-16 and R9-20 to R9-35. Each still needs the concrete test named in its original finding:
- Validation gaps (gap): R5-1 and R5-12: tests for R2-4 and R2-5.
- Validation gaps (gap): R5-2: a spec in `tests/native-save/native-preview-link.spec.ts` that checks the visitor's `scrollY` after an edit and after a slow picture loads.
- Validation gaps (gap): R5-3: a fake-timer test where `ready()` never settles. It should check that `servePreview` resolves after 10 s and that `close` still ends the room.
- Validation gaps (gap): R5-4: a test in `tests/preview-share.test.ts` that resolves the `serve` seam by hand. It should check that the state stays "starting" until then, that a workspace switch is respected, and that a refusal is not overwritten.
- Validation gaps (gap): R5-7: asserts in `tests/preview-host.test.ts` that `bytes=0-` on a 0-byte file and `bytes=-0` on a 100-byte file both answer 416 with `Content-Range: bytes */<size>`.
- Validation gaps (gap): R5-8: a spec where two editor tabs serve one link and the tab the visitor took the site from is closed.
- UX round 6: Share preview measures at least 44 px tall in a 390 px window with a mouse too, as the screenshots take it (`tests/native-save/native-preview-link.spec.ts`).
- Validation gaps (gap): R13-54 still open: R2-4, R2-5 and the R5-13 group still have no tests.
- Validation gaps (gap): R13-53 still open: nothing checks the visitor's `scrollY` after an edit or after a slow picture loads.
- Validation gaps (gap): R13-52 still open: there is still no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R13-51 still open: no test resolves the `serve` seam by hand.
- Validation gaps (gap): R13-50 still open: there are still no 416 asserts for `bytes=0-` on a 0-byte file or for `bytes=-0` on a 100-byte file.
- Validation gaps (gap): R13-49 still open: there is still no spec with two editor tabs serving one link where the visitor's source tab is then closed.
- Validation gaps (gap): R13-48 still open: the other order of the `lost` path is still untested (R12-2).
- Validation gaps (gap): R13-47 still open: there is still no unit test with a fake `openLiveRoom` (R12-1).
- Validation gaps (gap): R13-46 still open: this is a summary line. Nothing changed since the last round, so every carried-over gap stands.
- Validation gaps (gap): R13-45 still open: there is still no unit test with a fake `openLiveRoom` checking that the visitor sends no `hi`, then exactly one `hi`, then no second `hi`.
- Validation gaps (gap): R13-44 still open: the `lost` path is still tested in only one order, and no case holds the old server-side socket open.
- Validation gaps (gap): R13-43 still open: the spec still has one tab reconnecting, not two serving tabs where the visitor's source tab is closed.
- Validation gaps (gap): R13-42 still open: there are still no 416 asserts for `bytes=0-` on a 0-byte file or for `bytes=-0` on a 100-byte file.
- Validation gaps (gap): R13-41 still open: no test resolves the `serve` seam by hand.
- Validation gaps (gap): R13-40 still open: there is still no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R13-39 still open: no spec checks the visitor's `scrollY`.
- Validation gaps (gap): R13-38 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R13-37 still open: this is a summary line, and every R8 gap it lists is still open.
- Validation gaps (gap): R13-36 still open: the handover between two serving tabs is still untested.
- Validation gaps (gap): R13-35 still open: there are still no 416 asserts for an empty range or for `bytes=-0`.
- Validation gaps (gap): R13-34 still open: nothing tests Share preview waiting for `startServing`.
- Validation gaps (gap): R13-33 still open: nothing tests the 10 s limit in `servePreview`.
- Validation gaps (gap): R13-32 still open: nothing tests `settleScroll` or the scroll restores.
- Validation gaps (gap): R13-31 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R13-30 still open: this is a summary line, and its gaps are still open.
- Validation gaps (gap): R13-29 still open: none of the R5-13 group of tests was added.
- Validation gaps (gap): R13-28 still open: R2-4 and R2-5 still have no tests.
- Previous findings (P3): R13-27 still open: `src/preview-serve.ts` still sends `hello` to the whole room for every `hi`, so visitors still reload once for each visitor that moved.
- Previous findings (P3): R13-26 still open: `src/preview-serve.ts` is unchanged. If the editor and the preview Worker run different builds, files still fail with no reason given.
- Previous findings (P3): R13-25 still open: `tests/preview-menu.test.ts` is unchanged, and the three `globalThis as never as` casts still have no comment.
- Validation gaps (gap): R13-24 still open: there is still no spec with two serving tabs where the visitor's source tab is closed.
- Validation gaps (gap): R13-23 still open: `tests/preview-host.test.ts` is unchanged.
- Previous findings (P3): R13-22 still open: `src/preview-control.ts` is unchanged, so a refusal that arrives while `start()` waits is still overwritten.
- Previous findings (P3): R13-21 still open: `src/preview-serve.ts` is unchanged, so `/my-site` still answers 200 where a static host answers 301. The author has not declined this one.
- Validation gaps (gap): R13-20 still open: `tests/preview-share.test.ts` is unchanged.
- Validation gaps (gap): R13-19 still open: there is still no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R13-18 still open: the spec still never checks `scrollY`.
- Validation gaps (gap): R13-17 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R13-16 still open: this is a summary line, and none of its gaps is closed.
- Validation gaps (gap): R13-15 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R13-14 still open: nothing tests `settleScroll` or the scroll restores.
- Validation gaps (gap): R13-13 still open: nothing tests the 10 s limit in `servePreview`.
- Validation gaps (gap): R13-12 still open: nothing tests Share preview waiting for `startServing`.
- Validation gaps (gap): R13-11 still open: there is still no 416 test.
- Validation gaps (gap): R13-10 still open: the visitor moving between two serving tabs is still untested.
- Validation gaps (gap): R13-9 still open: this is a summary line, and none of its R7 gaps has a test.
- Validation gaps (gap): R13-8 still open: this is a summary line, and every R9 gap it lists is still open.
- Validation gaps (gap): R13-7 still open: R2-4 and R2-5 still have no tests.
- Validation gaps (gap): R13-6 still open: no spec checks the visitor's `scrollY`.
- Validation gaps (gap): R13-5 still open: there is still no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R13-4 still open: no test resolves the `serve` seam by hand.
- Validation gaps (gap): R13-3 still open: `tests/preview-host.test.ts` is unchanged, so there are still no 416 asserts.
- Validation gaps (gap): R13-2 still open: there is still no spec where two editor tabs serve one link and the visitor's source tab is closed.
- Validation gaps (gap): R13-1 still open: HEAD is still 97e76acd4, so there is no new code. The carried-over R11 gaps have no tests yet.
- Validation gaps (gap): No new gaps. HEAD (97e76acd4) is the same commit as in the last round. Each carried-over gap above still needs the concrete test named in its original finding:
- Validation gaps (gap): R12-1: a unit test with a fake `openLiveRoom`.
- Validation gaps (gap): R12-2: the other order of the `lost` path, made certain by holding the old server-side socket open.
- Validation gaps (gap): R5-8: two editor tabs serving one link, then closing the tab the visitor took the site from.
- Validation gaps (gap): R5-7: 416 asserts in `tests/preview-host.test.ts`.
- Validation gaps (gap): R5-4: resolving the `serve` seam by hand in `tests/preview-share.test.ts`.
- Validation gaps (gap): R5-3: a fake-timer test where `ready()` never settles.
- Validation gaps (gap): R5-2: a check on the visitor's `scrollY` in `tests/native-save/native-preview-link.spec.ts`.
- Validation gaps (gap): R5-1 and R5-12: tests for R2-4 and R2-5, plus the R5-13 group.
- Spec (P2, second look): 8b4d9eb68:src/preview-serve.ts:74 — P2 fault: a site that lives in a folder (`.editor/config.json` `site.url` such as `https://user.github.io/my-site/`) answers `/my-site` with the home page and status 200. A static host sends that address on to `/my-site/`. The visitor's address stays without the slash, so a relative link on that page (`about.html`, `styles/site.css`) points outside the folder. `tests/preview-share.test.ts:162` locks this in. Fix: when the asked path is the folder itself and has no slash, answer 301 to `/my-site/`, the same way `/my-site/notes/first-note` already moves to its slash, and change that assert.
- Spec (P2, second look): 8b4d9eb68:src/components/preview-menu.css:59 — P2 ticket: the link field is 16px only under `(pointer: coarse)`. Everywhere else it stays `--type-small` (12px), including a phone or iPad that reports a fine pointer or `(hover: none)`. Focusing a field under 16px makes iOS zoom the page. The tap-target rule already uses `(hover: none), (pointer: coarse), (width <= 768px)` in `src/theme.css`. Use that same condition for the 16px size (UX rulebook U4, phone).
- Spec (P2, second look): 8b4d9eb68:src/preview-serve.ts:137 — P2 fault: if reading the site throws, the catch drops the waiters and sends nothing. The visitor's page then sits for 15 seconds and shows a timeout. Fix: on that failure, send those visitors a 502 for the path, the same as a failed file read already does inside `look`.
- Spec (P3, second look): 8b4d9eb68:src/preview-visit.ts:95 — P3 race: every hello from the tab the visitor is using draws the site again, even when the version did not change. A reconnect sends hello twice (`onMembers` at line 258, then `onKey` at line 253). When several visitors move to the remaining tab, that tab says hello once each, and every visitor reloads once per hello. Fix: draw again only when the version or the start page changed, and send one hello for a move.
- Standards (P2, second look): 8b4d9eb68:src/preview-control.ts:159 — P2 race: `start()` sets the link to on after `await startServing`, with no check that the room is still open. `startServing` already calls `stopServing`, which moves `run`, and a 400, 403 or 410 from the room drops the saved link and turns the menu off. The line then turns it back on and the menu copies that address. The room is already closed, so the customer opens a dead link. Coding standards, Async writers: re-check the same proof after every await and before every write. Coding standards, Racing and speculative reads: `servePreview` treats a refused `ready()` as a success (`ready().catch`), so the refusal writes the on state. Fix: have `startServing` report whether it is still serving; if the room refused or never opened, leave the menu off and reject so the item says "Couldn't share preview".
- Standards (P3, second look): 8b4d9eb68:tests/preview-menu.test.ts:49 — P3 style: `(globalThis as never as { menu: … })` is a double assertion with no comment, and the same cast is repeated at lines 59 and 62. Coding standards, Test fixtures: type fakes with `satisfies` or a declared type, and document a deliberate double assertion. `Scope` is already declared in this file; use it for `menu`.
- Validation gaps (gap, second look): A spec in `tests/native-save/native-preview-link.spec.ts` with two editor tabs serving one link: the visitor loads the site, the tab they took it from is closed, and the page stays up from the other tab (one reload, and it does not say "Not running").
- Validation gaps (gap, second look): In `tests/preview-host.test.ts`, assert that `bytes=0-` on a 0-byte file and `bytes=-0` on a 100-byte file both answer 416 with `Content-Range: bytes */<size>`.
- Validation gaps (gap, second look): In `tests/preview-share.test.ts`, resolve the `serve` seam by hand: the menu stays "Making a link…" until it resolves; a workspace switch during the wait is kept; and if `serve` calls `closed(410)` before it resolves, the menu stays off and `start()` does not return the link.
- Validation gaps (gap, second look): A fake-timer test where the room's `ready()` never settles: `servePreview` resolves after 10 seconds, and `close` still ends the room.
- Validation gaps (gap, second look): In `tests/native-save/native-preview-link.spec.ts`, check the visitor's `scrollY` after an edit, and again after a slow picture loads, and check that a scroll the visitor made themselves is left alone.
- Validation gaps (gap): R17-83 still open: summary line. All ten distinct carried tests are still missing.
- Validation gaps (gap): R17-82 still open: there is still no spec where the visitor reconnects with a file still awaited.
- Previous findings (P2): R17-81 still open: the builder neither declined it nor fixed it. `src/preview-visit.ts:93` still returns before calling `forget()` when a hello brings no new version or start page. That `forget()` call was the only place that asked again for files that were still awaited.
- Validation gaps (gap): R17-80 still open: same as R5-1, R5-12 and the R5-13 group. No test.
- Validation gaps (gap): R17-79 still open: same as R5-2. No test.
- Validation gaps (gap): R17-78 still open: same as R5-3. No test.
- Validation gaps (gap): R17-77 still open: same as R5-4. No test.
- Validation gaps (gap): R17-76 still open: same as R5-7. No test.
- Validation gaps (gap): R17-75 still open: same as R5-8. No test.
- Validation gaps (gap): R17-74 still open: same as R12-2. No test.
- Validation gaps (gap): R17-73 still open: same as R12-1. No test.
- Validation gaps (gap): R17-72 still open: summary line. Every gap it carries still stands.
- Validation gaps (gap): R17-71 still open: same as R5-1, R5-12 and the R5-13 group. No test.
- Validation gaps (gap): R17-70 still open: same as R5-2. No test.
- Validation gaps (gap): R17-69 still open: same as R5-3. No test.
- Validation gaps (gap): R17-68 still open: same as R5-4. No test.
- Validation gaps (gap): R17-67 still open: same as R5-7. No test.
- Validation gaps (gap): R17-66 still open: same as R5-8. No test.
- Validation gaps (gap): R17-65 still open: same as R12-2. No test.
- Validation gaps (gap): R17-64 still open: same as R12-1. No test.
- Validation gaps (gap): R17-63 still open: summary line. Its gaps are unchanged.
- Validation gaps (gap): R17-62 still open: same as R12-1. No test.
- Validation gaps (gap): R17-61 still open: same as R12-2. No test.
- Validation gaps (gap): R17-60 still open: same as R5-8. No test.
- Validation gaps (gap): R17-59 still open: same as R5-7. No test.
- Validation gaps (gap): R17-58 still open: same as R5-4. No test.
- Validation gaps (gap): R17-57 still open: same as R5-3. No test.
- Validation gaps (gap): R17-56 still open: same as R5-2. No test.
- Validation gaps (gap): R17-55 still open: same as R5-1 and R5-12. No test.
- Validation gaps (gap): R17-54 still open: summary line. The R8 gaps are unchanged.
- Validation gaps (gap): R17-53 still open: same as R5-8. No test.
- Validation gaps (gap): R17-52 still open: same as R5-7. No test.
- Validation gaps (gap): R17-51 still open: same as R5-4. No test.
- Validation gaps (gap): R17-50 still open: same as R5-3. No test.
- Validation gaps (gap): R17-49 still open: same as R5-2. No test.
- Validation gaps (gap): R17-48 still open: same as R5-1 and R5-12. No test.
- Validation gaps (gap): R17-47 still open: summary line. Its gaps are unchanged.
- Validation gaps (gap): R17-46 still open: the R5-13 group still has no tests.
- Validation gaps (gap): R17-45 still open: same as R5-1 and R5-12. No test.
- Previous findings (P3): R17-44 still open: when the editor and the preview Worker run different builds, files still fail without saying why.
- Previous findings (P3): R17-43 still open: `tests/preview-menu.test.ts` is unchanged. The three `globalThis as never as` casts still have no comment.
- Validation gaps (gap): R17-42 still open: same as R5-8. No test.
- Validation gaps (gap): R17-41 still open: same as R5-7. No test.
- Previous findings (P3): R17-40 still open: `src/preview-control.ts` is unchanged. A refusal that arrives while `startServing` is still pending is overwritten.
- Previous findings (P3): R17-39 still open: `src/preview-serve.ts` is unchanged, so `/my-site` still answers 200 instead of a 301 to `/my-site/`.
- Validation gaps (gap): R17-38 still open: same as R5-4. No test.
- Validation gaps (gap): R17-37 still open: same as R5-3. No test.
- Validation gaps (gap): R17-36 still open: same as R5-2. No test.
- Validation gaps (gap): R17-35 still open: same as R5-1 and R5-12. No test.
- Validation gaps (gap): R17-34 still open: summary line. None of its gaps is closed.
- Validation gaps (gap): R17-33 still open: same as R5-1 and R5-12. No test.
- Validation gaps (gap): R17-32 still open: same as R5-2. No test.
- Validation gaps (gap): R17-31 still open: same as R5-3. No test.
- Validation gaps (gap): R17-30 still open: same as R5-4. No test.
- Validation gaps (gap): R17-29 still open: same as R5-7. No test.
- Validation gaps (gap): R17-28 still open: same as R5-8. No test.
- Validation gaps (gap): R17-27 still open: summary line. The R7 gaps are unchanged.
- Validation gaps (gap): R17-26 still open: summary line. The R9 gaps are unchanged.
- Validation gaps (gap): R17-25 still open: same as R5-1 and R5-12. No test.
- Validation gaps (gap): R17-24 still open: same as R5-2. No test.
- Validation gaps (gap): R17-23 still open: same as R5-3. No test.
- Validation gaps (gap): R17-22 still open: same as R5-4. No test.
- Validation gaps (gap): R17-21 still open: same as R5-7. No test.
- Validation gaps (gap): R17-20 still open: same as R5-8. No test.
- Validation gaps (gap): R17-19 still open: summary line. The R11 gaps (which come down to the same ten tests) are unchanged.
- Validation gaps (gap): R17-18 still open: summary line. Its gaps are unchanged.
- Validation gaps (gap): R17-17 still open: same as R12-1. No test.
- Validation gaps (gap): R17-16 still open: same as R12-2. No test.
- Validation gaps (gap): R17-15 still open: same as R5-8. No test.
- Validation gaps (gap): R17-14 still open: same as R5-7. No test.
- Validation gaps (gap): R17-13 still open: same as R5-4. No test.
- Validation gaps (gap): R17-12 still open: same as R5-3. No test.
- Validation gaps (gap): R17-11 still open: same as R5-2. No test.
- Validation gaps (gap): R17-10 still open: same as R5-1, R5-12 and R5-13. No test.
- Validation gaps (gap): R17-9 still open: summary line. HEAD is still b48a8cfea and adds no test for any gap it carries.
- Validation gaps (gap): R17-8 still open: no commit. R5-1, R5-12 and the R5-13 group still have no tests.
- Validation gaps (gap): R17-7 still open: no commit. R5-2: the spec still never checks the visitor's `scrollY`.
- Validation gaps (gap): R17-6 still open: no commit. R5-3: no fake-timer test where `ready()` never settles.
- Validation gaps (gap): R17-5 still open: no commit. R5-4: no test resolves the `serve` seam by hand.
- Validation gaps (gap): R17-4 still open: no commit. R5-7: `tests/preview-host.test.ts` still has no 416 asserts.
- Validation gaps (gap): R17-3 still open: no commit. R5-8, two editor tabs with the source tab closed, still has no test.
- Validation gaps (gap): R17-2 still open: no commit. R12-1, the unit test with a fake `openLiveRoom`, still doesn't exist.
- Validation gaps (gap): R17-1 still open: no commit since the last round. R12-2, the other order of the `lost` path, still has no test.
- Standards (P2): b48a8cfea:src/preview-visit.ts:93 — P2 race (CODING_STANDARDS: no new regression on a path that already worked): carried over as R17-81, and checked again against the code. Say the visitor's connection drops and a file request (`get`, line 121) arrives during the gap. The request goes into `waiting`, but `ask` has no live room to send it through, so it is lost. When the visitor rejoins, Lex's tab sends a hello with the same `version` and `start`. Line 93 then returns before `forget()` (line 116), and `forget()` is the only place that asks again for paths still in `waiting`. Before this commit, every hello called `forget()`, so those files were asked for again. Now they wait for `ANSWER_MS` and then answer 504, so the visitor sees a broken picture or page. Fix: keep the early return for the redraw only, and still ask again for what is awaited. For example, before the `return` on line 93, add `for (const path of waiting.keys()) ask(path);`. Or move the check so that only `forget()`'s `cache.clear()` and the redraw are skipped.
- Standards (P3): 49ed963b3:src/preview-control.ts:156 — P3 race: carried over as R17-40, with no change. A refusal (400, 403 or 410) that arrives while `startServing` is still pending is overwritten when `ready()` resolves, so the menu shows a dead link. Fix: after the await, check that the state is still "starting" for the same workspace before setting it to on.
- Standards (P3): 49ed963b3:src/preview-serve.ts:153 — P3 fault: carried over as R17-39. `/my-site` answers 200 with `index.html`, where GitHub Pages answers a 301 to `/my-site/`. Fix: redirect a folder's address that lacks its trailing slash.
- Standards (P3): c36dd58:src/preview-serve.ts:94 — P3 fault: carried over as R17-44. If the editor and the preview Worker run different builds, the message formats don't match and every file fails without saying why. Fix: put a build version in the hello, and show a plain "this preview needs an update" note when the two don't match.
- Standards (P3): c36dd58:tests/preview-menu.test.ts:49 — P3 style (CODING_STANDARDS "Test fixtures": document deliberate double assertions): carried over as R17-43. Fix: add `menu` to the existing `Scope` type and cast with `globalThis as Scope`.
- Validation gaps (gap): The 80 carried gap ids come down to these eleven tests:
- Validation gaps (gap): R17-82, which also covers R17-81: in `tests/native-save/native-preview-link.spec.ts`, the visitor loads the link. Hold back the visitor's live socket with `page.routeWebSocket`, then open a second page whose picture has to be fetched. Let the socket reconnect while Lex's tab sends the same version. Assert that the picture loads, not a 504.
- Validation gaps (gap): R12-1: a unit test with a fake `openLiveRoom`. A members update with no editor sends no `hi`. A members update with a new editor sends exactly one `hi`. A further members update sends no second `hi`.
- Validation gaps (gap): R12-2: the other order of the `lost` path. Hold the old server-side socket open until the new socket has joined, then assert that the visitor follows an edit.
- Validation gaps (gap): R5-8: two editor tabs serve one link, then the tab the visitor took the site from is closed. Assert that the visitor's heading still follows edits.
- Validation gaps (gap): R5-7: in `tests/preview-host.test.ts`, assert that `bytes=0-` on a 0-byte file and `bytes=-0` on a 100-byte file both answer 416 with `Content-Range: bytes */<size>`.
- Validation gaps (gap): R5-4: in `tests/preview-share.test.ts`, resolve the `serve` seam by hand. Assert that the state stays "starting" until then, that a workspace switch is respected, and that a refusal is not overwritten.
- Validation gaps (gap): R5-3: a fake `openRoom` whose `ready()` never settles, run with fake timers. Assert that `servePreview` resolves after 10 s and that `close` still ends the room.
- Validation gaps (gap): R5-2: in `tests/native-save/native-preview-link.spec.ts`, check the visitor's `scrollY` after an edit and after a slow picture loads.
- Validation gaps (gap): R5-1: the test for R2-4, as named in its original finding.
- Validation gaps (gap): R5-12: the test for R2-5, as named in its original finding.
- Validation gaps (gap): The R5-13 group, as named in its original findings.
