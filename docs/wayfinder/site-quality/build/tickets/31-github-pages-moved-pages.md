---
title: "GitHub Pages: moved pages still answer"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

On GitHub Pages, an old address still leads to the moved page ([ticket 08](../../tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26): "Change URL keeps its redirect pages"). Size: S–M.

## Decided behaviour

- **Finding while planning:** Change URL writes only `_redirects` today (`src/native-page-moves.ts`), which GitHub Pages ignores, so old addresses give a 404 there. This slice makes the ticket-08 decision true; Lex confirmed the forwarding pages on 2026-10-26 ("yes").
- When the site publishes to GitHub Pages, Change URL and move also write a small page at the old address: `meta refresh` 0 to the new address, a `canonical` to it, `noindex`, and a plain link.
- Moving again, or moving back, updates or removes these pages, with no chains, following the `_redirects` rules.
- The editor reads these pages as redirect pages: they do not show in Pages as pages.

## Files

Expected: `src/native-page-moves.ts`, `src/native-pages.ts` (hide redirect pages), tests.

## Done when

- On a GitHub Pages fixture, moving `/about/` to `/studio/` saves an `about/index.html` redirect page; moving back removes it.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-31 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-31 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
