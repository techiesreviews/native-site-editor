---
title: "kit site-rules: the specification.website rules the editor meets"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-kit-lighthouse]
---

## Goal

A kit check for the 38 specification.website rules the editor can meet automatically ([research 01](../../tickets/01-research-spec-for-native-sites.md#resolution-2026-10-25), table "specification.website, rule by rule", bucket "Editor can, automatically"; [ticket 04](../../tickets/04-grill-target-scores.md#resolution-2026-10-26)). Size: M.

## Decided behaviour

- Reads the generated site from slice 10's `--site new|edited` (same server) and checks each of the 38 rules from the files: for example a full `canonical` and `og:url` on every page that can be found, `<html lang>`, one `h1`, `sitemap.xml` listing exactly the findable pages, a `Sitemap:` line in `robots.txt`, JSON-LD that parses with the right types, `width`/`height` on pictures, `llms.txt`, and `_headers` when the site publishes to Cloudflare.
- Each rule has an id from the spec, the slice that makes it pass, and a state. A rule whose slice has not landed prints `todo (slice NN)`; each later slice flips its rules to enforced.
- The pinned copy of the spec's `llms-full.txt` is committed next to the rules, so the monthly check (slice 51) sees changes as a diff.
- Runs inside `kit lighthouse` (same trigger, same sweep and release), as its own section and its own `RESULT:` line. No network at check time.
- The 10 rules that need words become inbox items (slice 41); the 29 that depend on the host follow [ticket 08](../../tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26) and are not counted against the site where the host can't meet them.

## Files

`scripts/agents/site-rules.mjs`, `scripts/agents/site-rules/` (the rule list and the pinned `llms-full.txt`), `scripts/agents/kit.d/lighthouse`, `tests/kit-site-rules.test.ts`.

## Done when

- All 38 rules are listed with id, slice and state; the ones today's new site meets are enforced and pass.
- A broken fixture (relative canonical, missing `lang`) fails the matching rule by name in the unit test.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-11 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-11 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
