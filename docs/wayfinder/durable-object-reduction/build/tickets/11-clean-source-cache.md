---
title: "Bound disposable browser source caching"
type: task (AFK)
status: closed
assignee: dor-11
blocked_by: [07-atomic-structural-edits]
builder: sol
phase: 2
---

## What

Introduce 32 MiB/tab LRU accounting keyed by account/repository/immutable revision/path. Route clean source caches through it; retain draft baselines/uploads separately. Clear private entries on account change/sign-out; reauthorize misses.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/clean-source-cache.ts`
- `src/repository-loading.ts`
- `src/main.ts`
- `tests/clean-source-cache.test.ts`

## Done when

- Unit tests verify byte eviction, in-flight accounting and account isolation; existing browser spec `native-draft-storage.spec.ts` still preserves large drafts.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Count `nativeBaseSources`, `fileContents` and other clean copies consistently; never evict required draft baselines.

## Done (2026-10-18)

Behaviour: `src/clean-source-cache.ts` is one per-tab, in-memory LRU of clean GitHub text, capped at 32 MiB by
bytes (`text.length * 2`), keyed by account + repository + immutable revision (blob SHA, or the native text index
scope with its commit) + path. Blob reads (`readFile`/`readFiles`, the boot-guess prefetch) and the media text
mirror (`mediaText`, formerly an unbounded map) go through it; the 400-entry `fileContents` map and the
`rememberFile`/in-flight maps in `src/repository-loading.ts` are gone. In-flight loads are shared per key, cost bytes
only when they settle, leave nothing when rejected, and cannot populate the cache after `clear()` or an account
change (epoch + owner fence). Entries of another account are never returned: the key carries the account and the
cache clears itself when the signed-in account differs; sign-out (`disconnect`) and the login screen clear it. A
miss reads again through `api(...)` with the current session. `nativeBaseSources` is the cache's `base` map: its
bytes count in the same budget, equal strings count once (value reference counts), and it is never evicted, so
clean blob/media entries go first. Drafts, uploads and `mediaOpaqueText` stay outside. No persistent mirror.

Boot headroom (lead request, dev at 355/355 KB after ticket 09): the agent onboarding copy loads with the spotlight
that shows it, and the preview_media body moved into the lazy `src/agent-media.ts` (`previewWorkspaceMedia`).
Extra file outside Files: `src/agent-media.ts` (headroom, approved by the lead). index.js gzip 226079 B vs dev 226131 B.

Commits: 69b0f35a (cache, Sol), 14ef99b3 (review 1: media text through the LRU, put replaces bytes; Claude),
b47b730d (boot headroom, compacted cache; Claude).

Tests: tests/clean-source-cache.test.ts (12): byte LRU and recency, 32 MiB default, pinned base bytes counted once
and never evicted, in-flight dedupe/settle/rejection, clear fences late loads, account isolation for get/peek and
pending loads, repository/revision/path isolation, put/peek recency and replacement, `forEachAwait` late settlement
after clear or account change. tests/repository-loading.test.ts adapted. `npm run check` ok, `npm run lint` ok,
`scripts/agents/unit.sh` pass 4296 fail 0 (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; two rounds): fixed 1 — media text bypassed the shared cache and was not
cleared (P2, round 1). Rejected 1 (both rounds, P1): native base sources are pinned rather than evictable. They are
the open site's synchronous working set (preview rendering, the site-wide text index, draft baselines) read
through ~30 synchronous `nativeBaseSources` call sites; making them evictable means refetch-on-miss in each of
those paths and more boot code at a full budget. Counted and bounded by the 2,000-file index; left for a lead
decision / follow-up.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 354 KB (-1 KB) vs dev@5825912, budget 355 KB
- RESULT: ok specs 34/34 passed (affected, after review 1)
- RESULT: ok specs 55/55 passed (affected, after headroom)
- RESULT: ok specs 2/2 passed (native-draft-storage.spec.ts, native-setup-checklist.spec.ts)
- RESULT: ok review git diff cb308bc197f6144cddc8b29797e83f21cdba1eb4...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-11/20261018T024300Z
- RESULT: ok review git diff 5825912b2063353498d71eb7f1e2819f8e7794ca...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-11/20261018T034409Z
