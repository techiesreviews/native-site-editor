# Phase 5.17: Remember last boot

Base: `a47abed` (dev).

## What changed

- `src/boot-memory.ts` (new, pure): one localStorage record per repository, `ase:boot-memory:v1:<repoId>`, at most five (the oldest by write time goes). Value: `{ login, repoId, fullName, branch, commit, files: [{ path, sha }] }`, with at most 20 files and 4 KB serialized. `readBootMemory` validates every field (SHA shape included) and removes a bad or oversized record; `writeBootMemory`, `forgetBootMemory`; `memoryMatches` (account case-insensitive, id, full name, branch) and `provenFiles` (remembered path still has the remembered SHA). Storage errors are swallowed.
- `src/main.ts`:
  - `startBootGuess()` runs synchronously just before `boot.start()`: from the hash's repo id and branch it reads the memory and, when the branch matches, fires `/api/snapshot` (remembered full name and branch) and one `/api/files` with the remembered SHAs. Both go out in the same wave as `/api/session` and `/api/repositories`. Results are held privately in `bootGuess`; failures are swallowed.
  - `takeBootGuess(repo, branch)` in `chooseRepository`, once only: it returns undefined (normal path) unless the boot controller adopted a signed-in session with a tag, the editor source is unchanged, the hash still names this repo and branch, and `memoryMatches` holds against the adopted login and the verified listing's `full_name`. Then the guessed snapshot is used only if its receipt carries the same `X-Editor-Session` tag and its branch is the one opened; otherwise a fresh snapshot is read. `loadSnapshot` applies its own generation check to the result as it does for a fresh one.
  - From the adopted snapshot, `provenFiles` picks the remembered files whose SHA is unchanged at the same path; only those enter the file cache (`rememberFile` under `fileKey(repo, sha)`, skipped if already cached). Each cached promise checks the batch receipt's tag and the content's presence, and on any failure falls back to a plain `/api/file` read, so a failed guess never fails the page. Drafts still win (`nativeEffectiveSource`; drafted paths are never read).
  - With an adopted guess, `chooseRepository` waits for the guessed snapshot (it lands with the listing). If it is in, the remembered branch opens at once (the snapshot proves it exists) and `/api/branches` fills the selector when it arrives (or leaves the one branch when it fails). If it failed (a deleted branch answers 404), the normal path runs unchanged: a fresh snapshot read, the branch list, and "The linked branch is no longer available. Choose a branch from Pages & files." with a filled picker. Without a guess, `chooseRepository` is unchanged.
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
- Review fixes (spec, 7 now): a deleted remembered branch shows the normal message and another branch can be picked; a failed `/api/branches` on the remembered path still paints, on the remembered branch.
- Rerun on 5236: native-boot-memory, boot-parallel, boot-requests, preview-preload, startup-hash, draft-storage, routing, address-identity, lazy-panels: 35 passed. Smoke on 5226: 32 passed.

## Measurements

`tests/perf/cold-start.ts`, dist, `ASE_COLD_NET=100/20`, median of 5, same sitting, served bundle checked.

| | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- |
| before (`a47abed`, `index-CmvKRYhI.js`) | 904 | 905 | 511 | 516 |
| after (`index-Jgkajuht.js`) | 924 | 934 | 338 | 338 |
| after review fixes (`index-DZZuvko9.js`) | 926 | 936 | 347 | 347 |

Warm waterfall after: snapshot 130–243, files 131–245, session 131–243, repositories 131–243 (one wave), runtime from cache 278–282, paint 338. Before: session/repositories 190–300, snapshot/branches 389–510, page files 517–645, paint 511–516 range. Cold is unchanged in shape (one more boot-tag digest per snapshot/files on the worker); 904 → 924 is within the run-to-run spread seen before (920–936 in p5-15).

## Known limits

- Only a hash with repo and branch uses the memory; a boot from the remembered workspace without a hash does not.
- A branch list that arrives without the remembered branch (deleted after its snapshot was read) fills the picker and keeps the painted branch.
- Paths in subfolders are proven only from a snapshot with the full `tree`.
- A stale guess costs one wasted snapshot and one batch read.
- The memory holds repository names, branch, paths and SHAs (no contents, no credentials) readable by scripts on the editor origin.
- Byte budget: 348 KB of 350.
