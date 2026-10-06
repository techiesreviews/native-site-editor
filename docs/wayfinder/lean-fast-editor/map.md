---
label: wayfinder:map
title: A lean, fast-starting editor
charted: 2026-10-06
graduated: 2026-10-06
tracker: local markdown (GitHub token lacks Issues: write, so tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided plan, ready to hand off, for making the editor start fast (against a measured budget, on both the front end and the Worker) and easier to maintain, with the style panel, collections and Page settings › Fields removed and Add card kept. No code changes come from this map. It is done when nothing is left to decide before building starts.

## Notes

- **Planning only.** Tickets produce decisions, not code. Building is handed off once the map is clear.
- **Settled while charting (2026-10-06):**
  - Remove the style panel.
  - Remove collections, keeping Add card working on its own.
  - Remove Page settings › Fields along with collections.
  - No compatibility for old `.editor/page-builder.json` `collections` entries or generated `data-each` cards.
  - Preview comes first: Monaco loads after first paint or when a code pane opens.
  - Cold start is judged against a measured budget with a repeatable script.
  - The Worker is in scope.
  - All four maintainability fronts are in: splitting `main.ts`, browser tests in CI, leftovers, toolchain pins.
- **Language:** use the terms in `CONTEXT.md`.
- **Grilling tickets** run as a live conversation with Lex (AskUserQuestion). The agent never answers for Lex.
- **Research tickets** are resolved by subagents. Findings go on a `research/<ticket>` branch, and a pointer is added to the ticket.
- **To find takeable tickets:** look in `tickets/` for `status: open`, an empty `assignee:`, and every `blocked_by` ticket closed. Claim a ticket by filling in `assignee:` before doing any work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

- [Measure today's cold start](tickets/01-measure-cold-start-baseline.md): `tests/perf/cold-start.ts`; local throttled cold paint 1.7 s with 1.4 MB fetched first, 70% of it Monaco + code-editor; warm still 1.2 s from revalidation; signed-in remote numbers pending Lex's sign-in
- [Decide what "usable" means before Monaco loads](tickets/03-what-usable-means-before-monaco.md): select, edit bar, inline text and pages tree must work; drafts/undo/Save work too via a Monaco-free draft store; Monaco loads on idle after first paint
- [Decide what remains after the removals](tickets/07-what-is-left-after-removals.md): sidecar strips `collections` and `pages[*].fields` after the full removal sequence, keeping `reusableSections`, page `sections`, page `pageParts` and other supported data (ticket 14 correction); helpers to a neutral renamed module; generated rows and asset hooks go; style panel first, then helpers, Fields, collections, docs
- [Decide which leftovers are deleted](tickets/11-which-leftovers-go.md): all of them go
- [Decide whether the code panes keep JS IntelliSense](tickets/12-keep-js-intellisense.md): keep it; ts.worker stays
- [Set the cold-start budget](tickets/02-set-cold-start-budget.md): throttled local ≤350 KB before paint, cold paint ≤1.0 s, warm ≤0.4 s; bytes gated in CI, timings by hand per slice; remote target after sign-in run
- [Choose the shape of the boot requests](tickets/05-shape-of-boot-requests.md): no /api/boot, parallel separate calls; drafts load in parallel, findDeletedUpstream after paint, parallel @import levels, image/font wait capped ~300 ms
- [Decide which browser tests run in CI](tickets/09-browser-tests-in-ci.md): @smoke + byte budget per push, full suite nightly in 4 shards; one config with projects; tags replace hand lists
- [Decide how main.ts is split](tickets/08-how-main-ts-is-split.md): feature controllers along the section banners, shared state in @preact/signals-core, boot controller lazy-loads the rest; after removals, one module per PR, lazy features first
- [Research Worker per-request overhead](tickets/13-research-worker-per-request-overhead.md): cache App config per isolate, repo listing in the session DO (now planned), lazy-load MCP (halves cold start), waitUntil for blob cache, Server-Timing first
- [Confirm the agent/MCP impact of the removals](tickets/14-confirm-agent-impact-of-removals.md): cascade stays; focal point + grid editor go with the panel (Lex); no MCP changes; re-key logic must leave applyNativeCollectionOperation first; sidecar strips only collections and fields
- [Write the handoff plan](tickets/15-handoff-plan.md): five phases: removals, quick perf wins, tests in CI, boot path, main.ts split; Sol/Claude build, Astra reviews, dev → preview → main
- [Research remote usable and raw blobs](tickets/16-research-remote-usable-and-raw-blobs.md): 17 s usable = a full preview redraw per image (171); /api/blob with immutable caching in phase 2; remote budget usable ≤ paint+0.5 s, cold ≤ 2.5 s, warm ≤ 1.5 s
- Preview runtime (open item, decided with Lex): `native-preview-runtime.js` and the iframe start count inside the boot budget, no separate target
- [Research faster session and GitHub reads in the Worker](tickets/04-research-session-and-github-reads.md): parallel installation listing, repository list out of /api/session, GraphQL file batches, keep the DO session minus blockConcurrencyWhile, no webhooks; cross-isolate cache only if still slow
- [Research the toolchain pins](tickets/10-research-toolchain-pins.md): Node 24 everywhere, keep Miniflare alpha pinned in lockstep with Wrangler, keep tweetnacl+blakejs, align esbuild with Wrangler, drop the undici override, keep dompurify
- [Research bundle splitting and asset caching](tickets/06-research-bundle-split-and-asset-caching.md): defer the Monaco prefetch until after first preview, immutable cache on /assets/*, load secondary panels on demand after the removals, trim Monaco contributions last, reload once on a failed chunk load

## Build status

[P1.4: Page settings › Fields](build/p1-4-page-fields.md) removes Fields first.
Collections remain until P1.5; P1.4 strips only legacy `pages[*].fields` on the next
sidecar write and preserves the other supported data, including collections.

## Not yet specified

Nothing. The map is clear; building follows [the handoff plan](tickets/15-handoff-plan.md).

## Out of scope

<!-- closed tickets ruled beyond the destination, with a one-line reason -->
