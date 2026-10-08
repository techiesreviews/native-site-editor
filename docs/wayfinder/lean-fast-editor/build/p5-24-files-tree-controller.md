# Phase 5.24: Files tree controller (slice 18)

Base: `ccfdce34bd437989f124b3525182f43152367376` (dev). Work branch: `build/p5-files-tree-controller`.

`src/controllers/files-tree-controller.ts` owns the Files tree's open folders, SHA-keyed folder listings, last drawn draft signature, merging drafted paths into branch listings, moved-away/deleted folder detection, rendering and painting rows, change markers, folder expansion/collapse and lazy loading, selection on click, and focus restoration after rendering. `createFilesTreeController(ports)` exposes `render`, `refresh`, `row`, `signature`, `openFolder`, `listings`, `visible`, and `reset`. The cache is shared with the host's existing branch-path collision checks through `listings()`; snapshot replacement clears the controller's folders and listings together. Main loses 211 lines (6,220 to 6,009). The inventory's approximately 610 lines included adjacent host operations; this extraction removes 234 lines and adds 23 lines of wiring and adapters.

Host ownership stays explicit: the draft store, draft scope, `treeState` projection, new-draft path enumeration, snapshot/store, file creation, file action menus and operation transactions remain in main and `file-operations-controller.ts`. Native operations and `applyFileOperation` remain in the host because they own transaction atomicity and route/preview updates. Media stays in `media-controller`; Pages state and rendering stay in `pages-controller`. The Files controller delegates opening existing/new files, restoring, and creating through ports. Existing `filesTabOpen`, `openFolder`, `fileRow`, and `renderFileTree` operation ports now reach the Files controller through arrows, preserving initialization order.

Ports read snapshot, repository, generation, open file, root DOM, draft projection, scope, current draft, file actions, and tab visibility live. The UI constructors/icon painter are injected together to keep browser icon assets out of Node unit tests. No host site, draft, or store state is cached. The only retained tree state is the original render's draft projection captured for its row callbacks, the original drawn signature, and the folder UI/listing cache.

Guards preserved: no snapshot means no redraw; click refuses a stale generation or absent repository before clearing errors. Folder requests capture the current repository for that request, then re-check generation and returned children before painting; errors are shown only in the same generation, and `finally` re-enables the row. Automatic re-expansion checks generation, absence of a child list, and row connection before painting; rejected loads forget the open folder. Whole-tree deletion detection still requires the complete snapshot tree, keeps folders with new drafts or undeleted branch blobs, and hides a moved-away row only when its deletion points to a matching rename. Deleted rows announce instead of opening. New rows read scope and draft at click time. Folder toggles do not open files. Focus is restored by exact path; the signature ignores content-only edits exactly as before. DOM methods remain invoked on their receivers; the existing animation-frame wrapper remains in the operation controller's host ports.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,198 passed (1,182 baseline + 16 new); zero failures/skips.
- `tests/files-tree-controller.test.ts`: 16 tests cover live snapshots, missing snapshot, focus restoration, image refresh/signature gating, file selection and intent order, generation/repository click guards, cached folder toggles and reset, generation change during folder loading, deleted row/restore, nested new files/create, live new-draft lookup, deleted/moved/partially deleted/new-draft folder markers, and current/stale folder load errors with row re-enabled.
- Strict test TypeScript check: `npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types vite/client,node --strict --skipLibCheck tests/files-tree-controller.test.ts` passed. TypeScript 7 requires `--ignoreConfig` when specifying files.
- `npm run build:ui`: default failed with `EROFS` writing `node_modules/.vite-temp`; `npm run build:ui -- --configLoader runner` passed. Existing large-chunk advisory remains.
- `npm run test:budget -- --no-build`: passed, 352 KB gzip before first preview paint, limit 355 KB (363,520 bytes). Baseline: 359,629 bytes; extracted controller: 360,191 bytes; delta +562 bytes; remaining 3,329 bytes. Exact values measured with an otherwise identical temporary copy of the budget runner that prints the existing median byte count, three cold loads for each build. Both ordinary budget runs also passed.
- `git diff --check`: passed.

Browser runs use `/home/ubulex/Projects/native-site-editor/.scratch/p5-perf/ase-port.sh`, one worker, and verified spec paths. Logs are under `.scratch/p5-files-tree/` (ignored).

- Targeted native-save: 83 passed, zero failures/skips, 4.8 minutes, port 5236, 11 spec files.
- `npm run test:browser:smoke -- --workers=1`: 32 passed, zero failures/skips, 1.9 minutes, port 5236. Both runs used the picker directly, without an extra lock. No failures required reruns.

Commands (after exporting the specified Node path):

```bash
export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
npm run check
npm test
npm run build:ui
npm run build:ui -- --configLoader runner
npm run test:budget -- --no-build
/home/ubulex/Projects/native-site-editor/.scratch/p5-perf/ase-port.sh npx playwright test --project=native-save --workers=1 tests/native-save/native-file-ops.spec.ts tests/native-save/native-move-host.spec.ts tests/native-save/native-move-keys.spec.ts tests/native-save/native-file-move-race.spec.ts tests/native-save/native-discard.spec.ts tests/native-save/native-upload.spec.ts tests/native-save/native-images-tab.spec.ts tests/native-save/native-lazy-panels.spec.ts tests/native-save/native-selector.spec.ts tests/native-save/native-create.spec.ts tests/native-save/native-change-status.spec.ts
/home/ubulex/Projects/native-site-editor/.scratch/p5-perf/ase-port.sh npm run test:browser:smoke -- --workers=1
```

`native-create.spec.ts` adds direct Files-tab new-file/folder/discard coverage; `native-change-status.spec.ts` adds save/download coverage. No full browser suite was run. Changes remain unstaged for the lead; no commit, push, merge, or deploy.

Unresolved risks: no failures found in the exercised scope. The full browser suite was deliberately not run; the existing large-chunk advisory remains. Byte-budget headroom is 3,329 bytes. No edits were made under `docs/wayfinder/components-and-builder/`.
