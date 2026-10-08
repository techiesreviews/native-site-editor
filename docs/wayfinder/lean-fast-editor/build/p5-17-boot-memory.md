# Phase 5.17: Remember last boot

Base: `a47abed` (dev).

## What changed

- `src/boot-memory.ts` (new, pure): one localStorage record per repository, `ase:boot-memory:v1:<repoId>`, at most five (the oldest by write time goes). Value: `{ login, repoId, fullName, branch, commit, files: [{ path, sha }] }`, with at most 20 files and 4 KB serialized. `readBootMemory` validates every field (SHA shape included) and removes a bad or oversized record; `writeBootMemory`, `forgetBootMemory`; `memoryMatches` (account case-insensitive, id, full name, branch) and `provenFiles` (remembered path still has the remembered SHA). Storage errors are swallowed.
- `src/main.ts`:
  - `startBootGuess()` runs synchronously just before `boot.start()`: from the hash's repo id and branch it reads the memory and, when the branch matches, fires `/api/snapshot` (remembered full name and branch) and one `/api/files` with the remembered SHAs. Both go out in the same wave as `/api/session` and `/api/repositories`. Results are held privately in `bootGuess`; failures are swallowed.
  - `takeBootGuess(repo, branch)` in `chooseRepository`, once only: it returns undefined (normal path) unless the boot controller adopted a signed-in session with a tag, the editor source is unchanged, the hash still names this repo and branch, and `memoryMatches` holds against the adopted login and the verified listing's `full_name`. Then the guessed snapshot is used only if its receipt carries the same `X-Editor-Session` tag and its branch is the one opened; otherwise a fresh snapshot is read. `loadSnapshot` applies its own generation check to the result as it does for a fresh one.
  - From the adopted snapshot, `provenFiles` picks the remembered files whose SHA is unchanged at the same path; only those enter the file cache (`rememberFile` under `fileKey(repo, sha)`, skipped if already cached). Each cached promise checks the batch receipt's tag and the content's presence, and on any failure falls back to a plain `/api/file` read, so a failed guess never fails the page. Drafts still win (`nativeEffectiveSource`; drafted paths are never read).
  - With an adopted guess, `chooseRepository` waits for the guessed snapshot or the branch list, whichever comes first (the snapshot usually lands with the listing, a round trip before the branch list). A branch list that fails does not decide: the guess is awaited for at most `GUESS_AFTER_FAILED_LIST_MS` (5 s), after which the branch failure shows as before and a late guess is never used; within that (a proven guess paints with the one-branch picker enabled; a failed one takes the normal path). If the branch list comes first, the normal path runs with the guess as its snapshot read, so the picker is filled and enabled even while the guess is slow. If it is in, the remembered branch opens at once (the snapshot proves it exists) and `/api/branches` fills the selector when it arrives (or leaves the one branch when it fails). If it failed (a deleted branch answers 404; a rejected guess has already tried one fresh read, which is not repeated), the normal path runs: the branch list, and "The linked branch is no longer available. Choose a branch from Pages & files." with a filled picker. Without a guess, `chooseRepository` is unchanged.
  - A guess not taken when the boot's first `loadRepositories` settles (success or failure) is dropped, so a later Reload never adopts it.
  - After a real first paint (`afterNativePaint`, but not its 10 s fallback; once per load), when generation, repository, branch, snapshot and account are still current, the memory is written from `nativePaintedPaths` (the base sources read when the preview first painted) and their SHAs in the index. A repository that opens as not native has its memory removed. Sign-out (`disconnect`) clears all records; a hash change and `renderLogin` drop a pending guess.
- `src/controllers/boot-controller.ts`: `sessionTag()` returns the adopted signed-in session's tag (cleared by `reset`).
- `src/repository-loading.ts`: `fileKey` exported.
- `worker/app.ts`: GET `/api/snapshot` and `/api/files` carry `X-Editor-Session` like session and repositories, so a guessed read proves which session answered it.

## Adoption proofs

Login equal (case-insensitive) to the memory; listing maps the same id to the same full name; branch is the one opened; snapshot and files receipts carry the adopted session's non-empty tag; hash and source unchanged (a hash change drops the guess; `loadSnapshot` checks generation after the await). A file is used only when the fresh snapshot has the remembered SHA at the remembered path. Anything else (mismatch, 401, error) runs the normal reads; no guess failure reaches the login or error state.

## Tests

- `tests/boot-memory.test.ts` (6): round trip and key; malformed/foreign/oversized records removed; count and byte caps; throwing storage; five-record eviction and forget; `memoryMatches`; `provenFiles`.
- `tests/boot-session-route.test.ts`: `/api/files` carries the session's tag; signed out is 401.
- `tests/native-save/native-boot-memory.spec.ts` (5): with the session held, the guessed snapshot and files start first, and the page paints the guessed (marked) content, with no second snapshot and no reread of the page; a moved SHA is not shown and the memory is rewritten; another account's memory is ignored and overwritten; a renamed repository (same id) falls back and the memory takes the new name; a draft of the page wins over the remembered base.
- Fifth review fix (no new spec): a taken guess carries an `abandoned` flag, set when the 5 s timer fires, when a hash change or `renderLogin` (which runs `boot.reset`) discards it, or when `chooseRepository` takes another guess or none; its files enter the cache only while it is not abandoned, whichever arm of the race won. The timer is created at most once (not after the race is decided) and cleared when the race settles; a wait superseded by navigation still ends at the guess or the timer, which is then cleared.
- Fourth review fix: a failed branch list with a guess that never lands shows "Branches unavailable" within the 5 s bound, and the guess released afterwards neither opens nor paints; a failed list with a failed guess takes the normal error path. The third fix's spec now waits for the loading picker instead of a sleep.
- Third review fix: with the guessed snapshot held, `/api/branches` fails first, then the snapshot is released: the guess paints and the picker is enabled on main (fails before the fix).
- Second review fix: with the guessed snapshot never answered, the picker is enabled and filled once the branch list is in (fails before the fix). The deleted-branch spec asserts the picker is enabled.
- Review fixes (spec, 11 now): a deleted remembered branch shows the normal message and another branch can be picked; a failed `/api/branches` on the remembered path still paints, on the remembered branch.
- Rerun on 5236: native-boot-memory, boot-parallel, boot-requests, preview-preload, startup-hash, draft-storage, routing, address-identity, lazy-panels: 35 passed. Smoke on 5226: 32 passed.

## Measurements

`tests/perf/cold-start.ts`, dist, `ASE_COLD_NET=100/20`, median of 5, same sitting, served bundle checked.

| | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- |
| before (`a47abed`, `index-CmvKRYhI.js`) | 904 | 905 | 511 | 516 |
| after (`index-Jgkajuht.js`) | 924 | 934 | 338 | 338 |
| after review fixes (`index-DZZuvko9.js`) | 926 | 936 | 347 | 347 |
| after second review fix (`index-DpXr6EZN.js`) | 937 | 956 | 340 | 340 |

Warm waterfall after: snapshot 130–243, files 131–245, session 131–243, repositories 131–243 (one wave), runtime from cache 278–282, paint 338. Before: session/repositories 190–300, snapshot/branches 389–510, page files 517–645, paint 511–516 range. Cold is unchanged in shape (one more boot-tag digest per snapshot/files on the worker); 904 → 924 is within the run-to-run spread seen before (920–936 in p5-15).

## Known limits

- Only a hash with repo and branch uses the memory; a boot from the remembered workspace without a hash does not.
- A guessed snapshot that stalls after the branch list is in holds the page (not the picker) as a stalled fresh snapshot read does today; there is no read timeout (the only bound is the 5 s wait after a failed branch list).
- A branch list that arrives without the remembered branch (deleted after its snapshot was read) fills the picker and keeps the painted branch.
- Paths in subfolders are proven only from a snapshot with the full `tree`.
- A stale guess costs one wasted snapshot and one batch read.
- The memory holds repository names, branch, paths and SHAs (no contents, no credentials) readable by scripts on the editor origin.
- A guess taken before the repository selection is cleared, or before access to the repository is removed, is not marked abandoned (only a timeout, hashchange, sign-in screen or another repository choice marks it); if its snapshot then lands it still seeds the file cache. Entries are keyed by repository and SHA, so their content is right; the cost is evicting other entries (Sol review of `1e8c4e0`, P3, accepted).
- Sign-out clearing the memory and `sessionTag()` have no browser or unit test of their own.
- Byte budget: 351 KB of 355 (the ceiling was raised from 350 on 2026-10-08).

## Cold A/B after rebase onto `30a51e0`

One sitting under the five timing locks, alternating dev, branch, dev, branch (5 runs each, `ASE_COLD_NET=100/20`). Dev served `index-DWAQskzQ.js`, branch `index-BsKjrEHH.js` (both checked against their dist).

| | cold paint (run medians) | cold paint (10 pooled) | warm paint (run medians) | warm paint (10 pooled) |
| --- | --- | --- | --- | --- |
| dev `30a51e0` | 942, 912 | 941 | 523, 524 | 523.5 |
| branch | 939, 928 | 932.5 | 342, 341 | 341 |

Cold does not regress: the branch is within the run-to-run spread and slightly faster pooled. The earlier 904 → 924–937 came from comparing different sittings. Byte budget after rebase: 351 KB of 355.
