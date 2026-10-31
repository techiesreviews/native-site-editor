---
title: "Mock-ups on the preview site"
type: task (AFK)
status: closed
assignee: am-37
builder: claude
blocked_by: []
---

## Goal

The planning mock-ups move from the throwaway Worker to the preview site, so slice 36 can delete that Worker.

## Decided behaviour

Lex, 2026-10-27 (Tuesday pack, Q4): mock-ups live on the existing preview site under `/mockups/` once the test site goes.

- The preview build copies every `docs/wayfinder/*/prototypes/*.html` (and the images they use) to `/mockups/`, with a generated `index.html` listing them by map. It does this only behind a preview-only build flag (for example `MOCKUPS=1` in `wrangler.preview.jsonc`'s build), in the same way catalogue ticket 05 plans `catalogue.html` with `CATALOGUE=1`. Production builds contain no `/mockups/`.
- The files are static and served without sign-in, like the preview's other plain files (the Worker runs first only for `/api`, `/auth`, `/mcp` and `/.well-known`, `wrangler.preview.jsonc`).
- It adds 0 bytes to the editor's boot.
- No dependency on other slices: it can run any time a slot is free, and must land before 36.

## Files

Expected (confirm while designing): `vite.config.ts` or a small copy script under `scripts/`, `wrangler.preview.jsonc` (build flag), `package.json` (preview build script), `docs/agents/local-testing.md` (one line), and a unit test for the copy and index.

## Done when

- `kit preview` serves `/mockups/` with every prototype on `dev`, and the index lists them by map.
- A production build (`npm run build`) has no `mockups/` folder.
- `kit size` shows the editor's boot at ±0 KB.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-37 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-37 --timeout 2h`.

- `kit unit --affected`, `npm run check` and `kit size` green, with `RESULT:` lines quoted in Done.
- The `kit preview` address of `/mockups/` and the production build's file list in Done.

## Done (2026-10-28)

- `vite-mockups.ts` (new Vite plugin, on only with `MOCKUPS=1`): copies every HTML mock-up and image in `docs/wayfinder/*/prototypes/` to `mockups/<map>/<file>` (the reference images sit beside the mock-ups; other files there, such as notes, are left out) and writes `mockups/index.html`, one section per map, one link per HTML mock-up named by its `<title>` without the "PROTOTYPE (throwaway)" prefix. URLs keep the file names, so `/mockups/site-structure/08-site-map.html` (Cloudflare redirects it once to the address without `.html`).
- The editor's policy in `public/_headers` blocks inline scripts, and every mock-up is one file with inline scripts (08 Typing together also imports Yjs from esm.sh). The plugin appends a `/mockups/*` rule to the built `_headers` that removes that policy (`! Content-Security-Policy`) and sets one allowing inline scripts and esm.sh, for `/mockups/` only, with `sandbox allow-scripts allow-forms allow-popups`: the mock-ups run in an opaque origin, so they get no session cookie and no editor storage (their storage calls fall back to memory, so 08 Catalogue board forgets its marks on reload). Mock-up pages also get `X-Robots-Tag: noindex`. The rule is added once, even across watch rebuilds, and index links are URL-encoded. The editor's own policy is unchanged.
- `package.json`: `build:preview` (`MOCKUPS=1 vite build`); `wrangler.preview.jsonc` builds with it. Production (`wrangler.techies.jsonc`, `wrangler.jsonc`) still runs `npm run build:ui` (the repo has no `npm run build`); `docs/agents/local-testing.md` says so in one line.
- Test: `tests/vite-mockups.test.ts`: file discovery and order, index grouping, title escaping and fallback, a real Vite build writing `mockups/`; the built output served through Wrangler's asset handler, where `/` keeps the editor's policy and a mock-up gets exactly one policy, sandboxed without `allow-same-origin` (fails if the `!` line is dropped), and the index at `/mockups/` gets the same policy and `X-Robots-Tag: noindex`; `vite.config.ts` loading `ase-mockups` only with `MOCKUPS=1`; only `wrangler.preview.jsonc` building with `build:preview`; and a headless browser opening the index and all 28 real mock-ups through that handler with no Content Security Policy violation and no page error (a mock-up using storage unguarded fails it), esm.sh answered by a local two-module stand-in (so no network), and 08 Typing together showing an opaque origin, no cookie or storage, its esm.sh imports loaded and a sibling image loading. The browser check fails with esm.sh or `'unsafe-inline'` taken out of the policy.
- Preview build checked locally: `wrangler dev --config wrangler.preview.jsonc` parsed 3 header rules; `/mockups/` 200 with 28 mock-ups in 5 maps (agents-and-multiplayer, atomic-catalogue, site-quality, site-structure, styling) plus 2 reference images; `/` kept the editor's policy. The live address after `kit preview` is `https://preview-editor.techies.tools/mockups/`; `kit preview` was not run here (lead's step).
- Production build (`vite build`, no `MOCKUPS`): `_headers`, `assets/`, `index.html`, `native-static-starter/`, no `mockups/`. Every file outside `mockups/` except `_headers` (which gains the `/mockups/*` rule) is byte-identical between the two builds.
- `RESULT: ok unit 9/9 (1 files)`; `RESULT: ok specs none affected`; `npm run check` and `npm run lint` exit 0; `RESULT: ok size boot 358 KB (±0 KB) vs dev@3e2e618, budget 362 KB`.
- Feature list: no change (planning pages on the preview site, not an editor feature).
- Review round 1 fixed: the mock-up policy gained `sandbox` (no `allow-same-origin`) so inline scripts and esm.sh never run on the editor's origin; headers checked through Wrangler's real asset handler instead of a helper that replaced rather than merged them; a test that `vite.config.ts` adds the plugin only with `MOCKUPS=1`; `escape` renamed `escapeHtml`; the module comment moved off `Mockup`. Declined: narrowing esm.sh to the Yjs path, since Yjs loads lib0 from other esm.sh paths.
- Review round 2 fixed: a headless browser check over every real mock-up; a test that only the preview Worker builds with `build:preview`; the `_headers` rule added once across rebuilds; URL-encoded index links; `X-Robots-Tag: noindex` on mock-up pages.
- Review round 3 fixed: the browser check also fails on page errors (a mock-up using storage unguarded), and checks the index's policy; only HTML and image files are published, so notes in `prototypes/` stay out. Left as notes: POSIX `MOCKUPS=1` syntax (preview Worker only) and no rebuild on mock-up edits in watch mode (nobody runs it).
- Commits: "Mock-ups on the preview site", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3"

### Follow-ups

- Spec (P2): c506d41cb:docs/wayfinder/agents-and-multiplayer/build/tickets/37-mockups-on-preview.md:40 — P2 ticket: runner.md:67 says the Done section must list the behaviour, commits, tests, review decisions and evidence, and must have a `Commits:` line naming commits by subject, which `kit pr` later rewrites. This Done section has no `Commits:` line. It also says nothing about the three review rounds (198c37f54, 54dcfb113, c506d41cb): what was fixed, and what was rejected and why. Fix: add `Commits: Mock-ups on the preview site; Review fixes round 1; Review fixes round 2; Review fixes round 3`, plus one line per round on fixed and rejected findings. Fixed in ticket 38.
- Spec (P3): c506d41cb:docs/wayfinder/agents-and-multiplayer/build/tickets/37-mockups-on-preview.md:47 — P3 ticket: the evidence says "Every file outside `mockups/` is byte-identical between the two builds." That can't be true. `_headers` sits outside `mockups/`, and `writeBundle` adds `MOCKUPS_HEADERS` to it (vite-mockups.ts:357-361). The test file asserts exactly that difference (`editorHeaders + MOCKUPS_HEADERS`, tests/vite-mockups.test.ts:70). Fix: change the line to "every file outside `mockups/` except `_headers` (which gains the `/mockups/*` rule) is byte-identical". Fixed in ticket 38.
- Spec (P3): 702c419e7:vite-mockups.ts:277 — P3 ticket: the ticket says to copy the HTML mock-ups "and the images they use". The `published` pattern copies every image in the folder, used or not. No mock-up references either of the two images it picks up: `styling/prototypes/03-unblockwp-panel-reference.png` (a screenshot of a third-party product, referenced only from styling ticket 03) and `agents-and-multiplayer/prototypes/12-caret-circle-reference.png` (referenced only from tickets). Both end up public at `preview-editor.techies.tools/mockups/…`. Fix: copy only images that some mock-up references (scan `src=`/`url(` in the copied HTML). Or keep the current behaviour and add a line to the Done section saying unreferenced reference images, including the third-party screenshot, are published on purpose. Fixed in ticket 38.
- Standards (P3): 702c419e7:vite-mockups.ts:304 — P3 fault: `published` (line 277) matches `.html` case-insensitively, so a file such as `09-x.HTML` gets copied. But `mockupIndex` keeps only `mockup.file.endsWith(".html")`, which is case-sensitive, so that page is copied but never listed. The browser test has the same filter (tests/vite-mockups.test.ts:171), so it would never open the page either. No CODING_STANDARDS.md section covers build plugins; this is a plain consistency fault. Fix: use one predicate for both, e.g. `/\.html$/i.test(file)`, exported and reused in the test.
- Validation gaps (gap): tests/vite-mockups.test.ts: nothing checks that a build with the plugin and a build without it differ only in `mockups/` and `_headers`. The Done section claims this, but it is evidenced only by a manual run. Add a test: build the same temp repo twice (with `plugins: [mockups(root)]` and with `plugins: []`), list both `dist` trees, and assert that the extra paths are exactly the `mockups/` set and that every shared file except `_headers` is byte-equal.
- Validation gaps (gap): tests/vite-mockups.test.ts: no case covers a mixed-case extension (`write("docs/wayfinder/agents/prototypes/07-caps.HTML", "<title>Caps</title>")`). Assert that `mockupIndex` lists it, or that `mockupFiles` leaves it out, so whichever rule you pick is pinned down.

