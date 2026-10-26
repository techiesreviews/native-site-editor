---
title: "Cloudflare: _headers written with the site"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

Sites that publish to Cloudflare get security and caching headers ([ticket 08](../../tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26)). Size: S–M.

## Decided behaviour

- When the site's publishing choice is Cloudflare (`shared/hosting.ts`, `cloudflarePipelineFiles`), the site-output step writes `_headers`: HSTS, `nosniff`, `frame-ancestors`, Referrer-Policy, Permissions-Policy, a CSP that allows YouTube and Vimeo embeds, a long cache for media and styles with `stale-while-revalidate`, a short one for pages.
- The editor owns its block in `_headers`; other lines stay.
- `_redirects` already comes from Change URL (`editNativeRedirects`, `src/native-page-moves.ts`); unchanged.
- On GitHub Pages nothing is written and nothing is said.

## Files

Expected: `src/site-output/headers.ts`, `shared/hosting.ts` (read only), tests.

## Done when

- A Cloudflare site saves with `_headers`; a GitHub Pages site does not. The weekly sweep's live-deploy run shows the headers.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-30 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-30 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
