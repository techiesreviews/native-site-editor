---
title: "Fewer waits on the server before the first screen"
status: ready-for-agent
assignee:
blocked_by: []
---

## Goal

The first screen comes sooner on a first visit, most of all on a slow connection, by not waiting for one server answer before asking the next. Lex chose this (option b, 2026-11-09). See [the spec](../spec.md) for how it is measured and the numbers before.

## What the measurement shows (slow, first visit, ms from navigation start)

```
2805–3212  /api/session
2806–3225  /api/repositories
3289–3724  /api/snapshot?repo=…&branch=main        (starts after session answered)
3289–3698  /api/branches?repo=…
3727–4170  /api/file?…                             (starts after the snapshot answered)
3734–4182  /api/files?…
3738–4354  /assets/native-preview-runtime-….js     (asked only after the snapshot)
first screen 4414
```

Three server waits run one after another (session, then snapshot, then the page's files), and the preview runtime (36 KB) is only asked for after the snapshot. Nothing is asked for while `index.js` (209 KB) downloads, until 2.8 s. A repeat visit already asks session, snapshot and files side by side (`src/boot-memory.ts`, `src/workspace-boot.ts`).

## Decided behaviour

- Same screens and same safety: nothing a person sees changes except that it comes sooner. Every check that holds today still holds (a signed-out session, another account, a repository that went away, a branch that moved: the same outcome as today, only sooner or after a retry).
- Ask what can be asked at once:
  - the session (and the repository list) from the page itself, before the app's script has loaded (for example a `fetch` or `<link rel="preload" as="fetch" crossorigin="use-credentials">` in `index.html`, which the boot then takes instead of asking again);
  - the snapshot of the repository and branch named in the address (`#repo=…&branch=…`) together with the session, on a first visit too, not after it; a session that turns out signed out or for another account throws that answer away, as a stale answer is thrown away today;
  - the preview runtime as soon as a site will be shown (for example a `modulepreload` the boot adds when the address names a repository), not after the snapshot.
- If the page's files can come with fewer round trips without a server change, take that; a server change (the snapshot carrying the first page's texts) is out of scope here and goes in Done as a suggestion with its measured gain.

## Files

Expected (confirm while designing): `index.html`, `src/controllers/boot-controller.ts`, `src/workspace-boot.ts`, `src/boot-memory.ts`, `src/main.ts` (wiring only; `tests/main-ts-ceiling.test.ts`), the preview runtime's loading (`src/components/native-preview.ts`); tests.

## Done when

- Unit tests for the ordering: the session and the address's snapshot are asked at once; a signed-out or other-account session discards the early snapshot; the early session answer is used once and not asked again.
- `tests/perf/cold-start.ts` before and after (both `ASE_COLD_NET` profiles, first and repeat visit) in Done, as the spec's table. Expected: the slow first visit's first screen at least 0.8 s sooner; no repeat-visit number worse.
- `kit size` passes (boot within 355 KB), `kit unit --affected`, `kit specs --affected`, `npm run check`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../agents/runner.md)). `kit go slice-fo01 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`. Measure with `kit bg` for the test server (`ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=<port> npx tsx tests/native-save/server.ts`) and `ASE_COLD_BASE=… ASE_COLD_NET=… npx tsx tests/perf/cold-start.ts 3`.
