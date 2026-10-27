---
title: "Mock-ups on the preview site"
type: task (AFK)
status: open
assignee:
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
