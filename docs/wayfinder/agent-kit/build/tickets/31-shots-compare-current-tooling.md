---
title: "kit shots --compare uses today's tooling against the old app"
type: task (AFK)
status: closed
assignee: ak-31
blocked_by: [08-kit-shots-compare, 30-shots-print-findings]
builder: sol
---

## What

`kit shots --compare <ref>` runs the base worktree's own `kit shots`, so it fails for any
ref older than ticket 06 ("Ref 0a69178a predates kit shots") and silently uses outdated
scenarios, layout checks and outputs for refs between tickets 06 and now. The lead had to
overlay today's tooling by hand for the proof shots (ticket 25).

- Run the base capture with the **current** checkout's tooling (`scripts/agents/kit*`,
  `scripts/agents/shots/`, `tests/support/scenarios.ts`, port helpers) while serving the
  **base** app code: either point the shots config's server at the base worktree's app
  root, or overlay the current tooling files into the base worktree (untracked) before
  capturing. Pick whichever keeps the base worktree reusable and the cache correct.
- The cache key includes the tooling version (hash of those files), so a tooling change
  re-shoots the base.
- Clear error only when the base app cannot serve at all.

## Files

- `scripts/agents/shots/compare.mjs`
- `scripts/agents/shots/config.ts` (server root override, if that route is chosen)
- `tests/kit-shots-compare.test.ts`

## Done when

- `kit shots media-gallery --width 390 --compare 0a69178a` produces before/after pairs.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behavior.** `kit shots --compare <ref>` runs the current checkout's `kit.d/shots`,
  scenarios and layout checks for both sides; the before capture only sets
  `ASE_KIT_SHOTS_APP_ROOT=<base worktree>`, which `scripts/agents/shots/config.ts` uses as
  the web server's cwd (validated: absolute, existing directory). Nothing is copied into
  the base worktree. The base cache key includes `toolingHash` (sha256 over the kit
  wrapper, kit libs, `kit.d/shots`, every file under `scripts/agents/shots/`,
  `tests/support/scenarios.ts`, `tests/native-save/open-picker.ts`, port helpers and
  `playwright.config.ts`). Errors: base without `tests/native-save/server.ts` ("cannot
  serve"), and one line naming the base and its server log folder when a before group
  yields no ok shot. The "predates kit shots" error is gone.
- **Commits.** Sol build (resumed with `agent.sh --resume` after an app restart), review fix.
- **Tests.** `tests/kit-shots-compare.test.ts`: tooling hash (listed, recursive, unlisted,
  missing), config override, fake compare (before sees the app root, after does not;
  tooling change re-shoots; unchanged rerun hits cache; no-server base; no-ok-shot
  diagnostics). `npm run check`, `npm run lint`, kit-shots unit files 59/59.
- **Demo.** `kit shots media-gallery --width 390 --compare 0a69178a` → base 0 cached,
  2 shot; rerun → base 2 cached, 0 shot; before/after pairs in
  `/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-31/contact.webp`.
- **Review.** Sol (`.scratch/reviews/ak-31/20261016T143118Z`): fixed 1 (hash missed
  `open-picker.ts`, imported by scenarios). Rejected 1: a browser-level unit test with
  two fake apps; the real demo covers it and would slow the unit suite.
