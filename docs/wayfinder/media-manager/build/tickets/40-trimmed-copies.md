---
title: Trimmed copies
type: task (AFK)
status: closed
assignee: claude (mm-40 runner)
blocked_by: [24-media-folders-and-names, 25-image-recipe, 05-media-records]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Trimmed copies" and "Replacing and re-cropping".

- In the worker: free trim, zoom, turn, straighten and flip make a **Trimmed copy** for one place, prepared with the site's image recipe and given its own responsive copies.
- Named from the original with `-crop` (`studio-lights-crop.webp`), numbered on conflict. **Every re-crop writes a fresh name** and removes the old one; never overwrite an address (build check).
- `.editor/media.json` records the source and the trim, so re-cropping starts from the full original with the earlier trim restored; details show "Made from <original>".
- On Done, the old trimmed copy is removed if no other place uses it; otherwise a new copy is made so the other place does not change. Until phase 4, removal is today's removal; slice 48 sends it to Recently removed ★.
- The original is never changed.

## Done when

- `tests/trimmed-copies.test.ts`: naming and conflicts, fresh name on re-crop, record of source and trim, shared copy kept for the other place, turn and flip geometry.

## Done (2026-10-14)

- **Behaviour.** The engine behind trimmed copies; no popup yet (slices 39, 41, 42 and 45 call it). Lazy modules only.
  - **Geometry** (`src/page-builder/trim-geometry.ts`, loaded by the image worker without the naming code): flips first in the source's own orientation, then `turn` clockwise, then `straighten` (−45..45°, about the centre, frame keeps the turned size); `x, y, width, height` are fractions (0..1) of that frame, so a trim survives a re-prepared source. `trimGeometry` gives the output size and the canvas matrix; `validTrim` refuses empty, outside or non-finite trims; `isTrim` is false for a full frame with no turn or flip (no file is saved for it).
  - **Rules** (`src/page-builder/trimmed-copies.ts`): `trimStart` starts a re-crop from the full original with the earlier trim restored (a copy whose original is gone counts as the original). `trimmedCopyPath` names `media/images/<original>-crop.<ext>` (tidy names), numbered on conflict across the family, and never reuses an address: it numbers above the previous copy and above every `-crop` main of that source that exists or is on the records' removed list (family mains only, so `-crop-480` beside `-crop` is a copy while a `-crop-480` main still counts). `planTrimmedCopy` records `trimmedFrom { source, trim }` and carries the description (with its by-agent mark) and Decorative from the previous copy, else from the original; it removes the previous copy's whole family and records only when unused and not Always keep.
  - **Pixels** (`trimmed-copy-prepare.ts`, `optimiseMedia(…, trim)`): the worker draws the trim and then runs the site image recipe as for any picture, own responsive copies included; the stripped-source fallback never returns the untrimmed bytes; SVG, animated and Keep-original inputs refuse.
  - **Saving** (`createMediaWorkspace().trim`, label "Picture trimmed"): one batch, one Undo step: the new family's uploads, the place's page edit (caller's `apply`), `.editor/media.json`, and the previous copy's family deleted only when no site text mentions it after the edit (wide usage check). An unreadable text file keeps it. The request carries the source revision captured before encoding; a newer original, a stale page or newer records refuse with nothing saved. The original's bytes, path and record are never in the batch. Until slice 48 the removal is an ordinary delete.
  - **Details.** File details of a trimmed copy show "Made from <original's name>", even when the original is gone.
- **Commits.** b70183ec claim; 60b40d45 build (Sol, with the runner's geometry split out of the worker's imports, `suggestMediaName` reuse, removed-list names, batched reads); 75e0ffce ticket status; d86309c0 round-1 fixes; 397a7b09 round-2 fix; then this close.
- **Tests.** New `tests/trimmed-copies.test.ts`: naming and conflicts, fresh name on re-crop, shared-copy branches and removed addresses, responsive-width chain numbers, `trimStart`, record of source and trim, shared copy kept, Always keep, original unchanged, every turn × flip on a non-square source, straighten, invalid and no-op trims, preparation seam. `media-workspace.test.ts`: one batch and one Undo, previous copy or its responsive copy still mentioned (page, script, `_redirects`, JSON, same page) kept, unreadable text keeps it, removed-list address not reused, stale source revision refuses. `media-optimise.test.ts` (faked-canvas worker with a trim, stripped source never used), `media-file-details.test.ts` ("Made from"). `native-media-library.spec.ts`: real worker flips, turns, trims and straightens; decoded main and every responsive copy checked by colour. Ran `npm run check`, `npm run lint`, unit 2635/2635; native-media-screen, -library, -adding, -upload 45/45, plus the new real-worker case.
- **After rebasing over slice 26** (adding settings; `media-workspace.ts` keeps both its `adding` and this slice's `trim`): `npm run check`, `npm run lint`, unit 2641/2641; native-media-screen, -library (incl. the real-worker trim), -adding, -upload 48/48.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-40/round-{1,2}/` (`run.log`, `result.md`). Round 1, fixed: a shared copy's branches could reuse an address another branch removed (P2); prepared pixels carried no source revision proof (P2); its three validation gaps were added (shared chain, stale source, real-worker pixels). Round 2, fixed: a trimmed main numbered 480/960/1600 was read as a responsive copy, resetting the chain (P2). Rejected: none. Known limit: before slice 48, a `-crop` address removed outside the removed list (for example a manual delete of the highest number) could be reused; slice 48 records every removal.
- **Bytes.** Boot ±0: `test:budget` 344 KB gzip before first preview paint (budget 355 KB), as on origin/dev; the new code is in the worker and lazily loaded media chunks.
- **Follow-ups.** Slice 41/42/45: call `trimStart`, `prepareTrimmedCopy` (pass slice 26's remembered quality; capture `assetVersion(source)` before reading its bytes) and `workspace.trim`. Slice 48: send the previous copy's removal to Recently removed (the removed list already feeds naming). Slice 27: re-cropping could decode a kept original in `media/originals/` for more detail; today it uses the family's main.
