---
title: "Files rename after chunk recovery works under load too (flaky since 53)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

`tests/native-save/native-lazy-panels.spec.ts` › "Files works again after a failed chunk load and recovery" failed twice in slice 53's full `kit pr` run and passed alone. Slice 55 met it 4/30 under a 4-shard `kit specs` load: after the reload, renaming `robots.txt` to `robots-renamed.txt` was refused with "The repository changed meanwhile. Try again." under the name field, so the renamed row never showed (`toBeVisible` timed out after 15 s). With logs added to the rename's stale checks (`src/controllers/file-operation-checks.ts` lazy proof, `src/controllers/file-operations-controller.ts` `moveFileTarget`) it then passed in all 185 later runs: alone, under load, with the browser CPU slowed 4×, and beside the same load as the failing batch. Which check moved is not pinned: the edits stamp (route, generation, scope), the file list, the target's drafts, or `ensureNativeTextIndex`'s scope key (`src/site-text-index.ts`). The spec's own `reloadEditor` comment already notes that "a rename's stamp holds the route the preview settles on".

## Decided behaviour

- Diagnose first: get the failure back at a debuggable rate (more shards, slower fake server responses through `page.route`, or a probe that records which stale check fired without changing timing), then name whether the app or the test is at fault.
- If the app: a rename made once the editor shows "Up to date" and the preview has painted is not refused by work the boot finishes after that. If the test: it waits on what the user would see, not on time.

## Files

- `tests/native-save/native-lazy-panels.spec.ts`; the rename's stale checks named above if the app is at fault, with a unit test

## Done when

- The cause named in the Done; 30/30 alone and 30/30 under a 4-shard `kit specs` load.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted) pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit specs`, `kit review`, `kit pr`; report the cause and the run counts.
