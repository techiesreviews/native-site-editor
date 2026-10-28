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

- `vite-mockups.ts` (new Vite plugin, on only with `MOCKUPS=1`): copies every file in `docs/wayfinder/*/prototypes/` to `mockups/<map>/<file>` (the reference images sit beside the mock-ups, so they come along) and writes `mockups/index.html`, one section per map, one link per HTML mock-up named by its `<title>` without the "PROTOTYPE (throwaway)" prefix. URLs keep the file names, so `/mockups/site-structure/08-site-map.html` (Cloudflare redirects it once to the address without `.html`).
- The editor's policy in `public/_headers` blocks inline scripts, and every mock-up is one file with inline scripts (08 Typing together also imports Yjs from esm.sh). The plugin appends a `/mockups/*` rule to the built `_headers` that removes that policy (`! Content-Security-Policy`) and sets one allowing inline scripts and esm.sh, for `/mockups/` only, with `sandbox allow-scripts allow-forms allow-popups`: the mock-ups run in an opaque origin, so they get no session cookie and no editor storage (their storage calls fall back to memory, so 08 Catalogue board forgets its marks on reload). Mock-up pages also get `X-Robots-Tag: noindex`. The rule is added once, even across watch rebuilds, and index links are URL-encoded. The editor's own policy is unchanged.
- `package.json`: `build:preview` (`MOCKUPS=1 vite build`); `wrangler.preview.jsonc` builds with it. Production (`wrangler.techies.jsonc`, `wrangler.jsonc`) still runs `npm run build:ui` (the repo has no `npm run build`); `docs/agents/local-testing.md` says so in one line.
- Test: `tests/vite-mockups.test.ts`: file discovery and order, index grouping, title escaping and fallback, a real Vite build writing `mockups/`; the built output served through Wrangler's asset handler, where `/` keeps the editor's policy and a mock-up gets exactly one policy, sandboxed without `allow-same-origin` (fails if the `!` line is dropped); `vite.config.ts` loading `ase-mockups` only with `MOCKUPS=1`; only `wrangler.preview.jsonc` building with `build:preview`; and a headless browser opening the index and all 28 real mock-ups through that handler with no Content Security Policy violation, esm.sh answered by a local two-module stand-in (so no network), and 08 Typing together showing an opaque origin, no cookie or storage, its esm.sh imports loaded and a sibling image loading. The browser check fails with esm.sh or `'unsafe-inline'` taken out of the policy.
- Preview build checked locally: `wrangler dev --config wrangler.preview.jsonc` parsed 3 header rules; `/mockups/` 200 with 28 mock-ups in 5 maps (agents-and-multiplayer, atomic-catalogue, site-quality, site-structure, styling) plus 2 reference images; `/` kept the editor's policy. The live address after `kit preview` is `https://preview-editor.techies.tools/mockups/`; `kit preview` was not run here (lead's step).
- Production build (`vite build`, no `MOCKUPS`): `_headers`, `assets/`, `index.html`, `native-static-starter/`, no `mockups/`. Every file outside `mockups/` is byte-identical between the two builds.
- `RESULT: ok unit 9/9 (1 files)`; `RESULT: ok specs none affected`; `npm run check` and `npm run lint` exit 0; `RESULT: ok size boot 358 KB (±0 KB) vs dev@3e2e618, budget 362 KB`.
- Feature list: no change (planning pages on the preview site, not an editor feature).
