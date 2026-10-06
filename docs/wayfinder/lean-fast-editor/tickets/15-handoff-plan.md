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
6. Remove `data-if` (Lex, 2026-10-06; editor implementation completed in P1.6). The Visibility conditions dialog already leaves with the component canvas bar slice (the purple component banner moves into the canvas bar). The runtime already hides unfilled slots and empty wrappers on its own, and no starter component uses `data-if`. In the editor: the `data-if` branches in `public/native-preview-runtime.js`, `card-grid.ts` (optional slots left out of a new card), the `component-model.ts` notes and the `worker/site-conventions.ts` sentence. After step 5, because collections also read `data-if`. The starter (`~/Projects/native-site-editor-starter`: `components/components.js`, `AGENTS.md`) changes in the same pass as a separate commit there.
7. Docs.
8. Fix the 14 browser specs that already failed on `dev` before phase 1 (full run after P1.1 + P1.2, 2026-10-06: 707 passed, 15 failed, 110 skipped; 14 reproduce on the pre-phase-1 base, 1 was a flake that passes 3/3 alone). They cover asset-reference refusal wording (1), the Page settings entry in create/history specs (4), the saved-section catalogue in Add specs (4), file/page URL menus (3), routing (1) and component CSS load count (1). Several touch Page Fields and collections, so this lands after steps 4–5, before phase 3 puts browser tests in CI.

**Phase 2: quick performance wins**
1. Immutable `/assets/*` cache header; reload-once on failed chunk loads.
2. ★ Image blobs (ticket 16): `/api/blob` raw bytes cached by SHA, preview uses plain URLs and draws once, no image fetch before paint.
3. ★ Defer Monaco to idle after first preview paint (ticket 03 point 3).
4. Toolchain pins (ticket 10).
5. Worker: lazy-load MCP, cache App config per isolate, `waitUntil` for blob cache, `Server-Timing` (ticket 13).

**Phase 3: tests in CI** (ticket 09)
0. Phase 1 closed 2026-10-06 with the full native save suite at 642 passed, 85 skipped, 1 failed: `native-palette.spec.ts:97` ("actions and the selected section's controls run from the palette…"), a flake that expects one element and sometimes sees two under a full run, and passes alone 3/3. Make it deterministic before it can gate CI.
1. One `playwright.config.ts` with projects; tags replace the hand lists.
2. `@smoke` slice and byte budget (ticket 02) on every push; nightly full suite in 4 shards.

**Phase 4: boot path**
Split into small tasks on 2026-10-06 so more run at once (Lex). Started alongside phase 2–3: 4a `html-entities` fast path; 4b parallel installation listing; 4c `/api/files` through GraphQL `prefetchTexts`; 4d the Monaco-free draft store as a standalone module with tests (wired in later); 4e on-demand loading for the command palette, history, media, onboarding and agent panel. Waiting on the image and Monaco slices: wiring the draft store, the front-end boot steps, the session without the repository list and the repository listing in the session DO. New tasks run targeted specs only; the full suite runs once per merge.
4d landed standalone (`src/draft-store.ts`, after Astra's three fixes). Open point for wiring: once a code pane closes, its typing undoes as one step, where today the kept Monaco model still undoes stop by stop; decide when wiring whether to keep closed panes' models alive.
1. ★ Monaco-free draft store (ticket 03 point 4).
2. ★ Boot requests: session without repository list, parallel installations, GraphQL file batches, DO session tweaks, repository listing in the session DO (tickets 04, 05, 13).
3. Front-end boot steps: parallel drafts load, `findDeletedUpstream` after paint, parallel `@import` levels, image/font wait capped (ticket 05).
4. On-demand onboarding, agent panel, media, command palette, history; `html-entities` fast path (ticket 06).

**Phase 5: structure**
1. ★ `@preact/signals-core` store, then `main.ts` split one module per PR, lazy features first (ticket 08). `code-editor.ts` becomes the Monaco-only code pane module.
2. Monaco contribution trim, last (ticket 06 point 5).

**Done** when the budget holds on the throttled profile (≤350 KB, ≤1.0 s cold, ≤0.4 s warm) and the remote target holds on preview with Lex's site (usable ≤ paint + 0.5 s, no image bytes before paint, cold paint ≤ 2.5 s, warm ≤ 1.5 s).
