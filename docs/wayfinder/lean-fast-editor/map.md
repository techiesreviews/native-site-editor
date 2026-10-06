---
label: wayfinder:map
title: A lean, fast-starting editor
charted: 2026-10-06
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
- [Decide what remains after the removals](tickets/07-what-is-left-after-removals.md): sidecar keeps `pages.sections` only and strips the rest; helpers to a neutral renamed module; generated rows and asset hooks go; style panel first, then helpers, Fields, collections, docs
- [Decide which leftovers are deleted](tickets/11-which-leftovers-go.md): all of them go
- [Decide whether the code panes keep JS IntelliSense](tickets/12-keep-js-intellisense.md): keep it; ts.worker stays
- [Research faster session and GitHub reads in the Worker](tickets/04-research-session-and-github-reads.md): parallel installation listing, repository list out of /api/session, GraphQL file batches, keep the DO session minus blockConcurrencyWhile, no webhooks; cross-isolate cache only if still slow
- [Research the toolchain pins](tickets/10-research-toolchain-pins.md): Node 24 everywhere, keep Miniflare alpha pinned in lockstep with Wrangler, keep tweetnacl+blakejs, align esbuild with Wrangler, drop the undici override, keep dompurify
- [Research bundle splitting and asset caching](tickets/06-research-bundle-split-and-asset-caching.md): defer the Monaco prefetch until after first preview, immutable cache on /assets/*, load secondary panels on demand after the removals, trim Monaco contributions last, reload once on a failed chunk load

## Not yet specified

- **Handoff plan:** how the decisions turn into build slices, in what order, and how each slice is checked against the budget. This is the last ticket, and it graduates once the others are mostly closed.
- **The preview runtime** (`native-preview-runtime.js`, 140 KB) and the preview iframe's own start: whether they belong in the boot budget.
- **Worker per-request overhead** beyond the session read, once the boot request shape is settled.
- **What `code-editor.ts` becomes** after drafts and undo leave it (draft store decided in ticket 03; the module boundary is part of the main.ts split).
- **Agent/MCP impact:** the scouts found no MCP tools tied to the style panel or collections. Confirm this once the removal boundaries are fixed.

## Out of scope

<!-- closed tickets ruled beyond the destination, with a one-line reason -->
