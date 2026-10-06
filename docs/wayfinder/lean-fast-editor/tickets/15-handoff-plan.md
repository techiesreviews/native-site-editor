---
title: Write the handoff plan
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [13-research-worker-per-request-overhead, 14-confirm-agent-impact-of-removals]
---

## Question

How do the decisions turn into build slices, in what order, and how is each slice checked against the budget? This is the last ticket; when it closes, the map graduates.

## Resolution (2026-10-06)

Decided with Lex.

**Builders.** Sol (codex) takes mechanical slices, Claude agents take judgment-heavy ones (marked ★). Astra reviews every branch before merge.

**Flow per slice.** Branch from `dev` → build → `check`, unit tests, the touched browser specs (plus `@smoke` and the byte budget once phase 3 lands) → Astra review → merge to `dev` → `deploy:preview` → cold-start script run (timings recorded in the slice's notes) and screenshots on the real starter. A phase goes to `main` and `deploy:techies` once it is green on preview.

**Phase 1: removals** (ticket 07 order, Add card working throughout)
1. Leftovers (ticket 11).
2. Style panel, with the image focal point, grid editor and selected-collection inspector; cascade code stays (ticket 14). Fix the 15 specs that use its grip.
3. ★ Move page re-key and link-rebase logic plus `attribute()`/section targets into the neutral module; decouple Add card; callers switch to `applyNativeOperation`.
4. Page settings › Fields.
5. Collections, generated rows, asset hooks; sidecar strips `collections` and `pages[*].fields`.
6. Docs.

**Phase 2: quick performance wins**
1. Immutable `/assets/*` cache header; reload-once on failed chunk loads.
2. ★ Defer Monaco to idle after first preview paint (ticket 03 point 3).
3. Toolchain pins (ticket 10).
4. Worker: lazy-load MCP, cache App config per isolate, `waitUntil` for blob cache, `Server-Timing` (ticket 13).

**Phase 3: tests in CI** (ticket 09)
1. One `playwright.config.ts` with projects; tags replace the hand lists.
2. `@smoke` slice and byte budget (ticket 02) on every push; nightly full suite in 4 shards.

**Phase 4: boot path**
1. ★ Monaco-free draft store (ticket 03 point 4).
2. ★ Boot requests: session without repository list, parallel installations, GraphQL file batches, DO session tweaks, repository listing in the session DO (tickets 04, 05, 13).
3. Front-end boot steps: parallel drafts load, `findDeletedUpstream` after paint, parallel `@import` levels, image/font wait capped (ticket 05).
4. On-demand onboarding, agent panel, media, command palette, history; `html-entities` fast path (ticket 06).

**Phase 5: structure**
1. ★ `@preact/signals-core` store, then `main.ts` split one module per PR, lazy features first (ticket 08). `code-editor.ts` becomes the Monaco-only code pane module.
2. Monaco contribution trim, last (ticket 06 point 5).

**Done** when the budget holds on the throttled profile (≤350 KB, ≤1.0 s cold, ≤0.4 s warm) and a remote signed-in target, set after Lex's sign-in run, holds on preview.
