---
title: The Social image sharing copy
type: task (AFK)
status: closed
assignee: claude (mm-36 runner)
blocked_by: [25-image-recipe]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Other contexts"; research 03 §7.

- Choosing a Social image (Site settings, page details) makes a separate 1200 × 630 JPEG sharing copy, trimmed around the centre; the chosen image is untouched; the copy has no responsive copies.
- `og:image` points at the copy at a **full address** built from the site's address (today a root link: `src/page-builder/site-settings.ts:405`, `shared/starting-point.ts:165`).
- With no site address set, write a root link and show a note asking for the address ★.
- CSS background images get one prepared file, no copies, no `@media` rules.

## Done when

- `tests/social-image.test.ts`: size, format, centre trim, full address, the no-address note.
- Nightly spec: set a Social image in Site settings; `og:image` is a full `https://…` address of the 1200 × 630 copy.

## Done (2026-10-14)

- **Behaviour.** Choosing a Social image (Page settings' Social image, Site settings' Default social image) makes a separate sharing copy when **Apply** is pressed: a 1200 × 630 JPEG (quality 85), trimmed around the centre, transparency on white, no responsive copies, no kept original, never enlarged (a picture whose centre trim is under 1200 wide keeps its own 1.91:1 size). Named `media/images/<name>-social.jpg`, numbered on conflict across the family, and always a fresh address (existing, Recently removed and previous addresses stay taken; slice 40's `trimmedCopyPath` with a suffix). `og:image` points at it at a **full address** from `site.url` (`https://…/media/images/x-social.jpg`); Site settings also stores it as `site.socialImage`, and pages following the default follow it. The chosen image is untouched.
  - **One step.** The JPEG, `.editor/media.json` (`sharing: true`, `trimmedFrom { source, trim }`, so File details says "Made from …") and every text edit (the page, or config plus following pages) are one media batch, "Social image set", one Undo. A previous sharing copy nothing else mentions goes to Recently removed (slice 48's `removedRecords`); a mentioned, unreadable-text or Always keep one stays. Stale page, config, records, source revision or a repository switch refuse with nothing saved.
  - **No address (★).** The copy is linked as a root link `/media/images/…`, both Social panels show "Your site has no web address yet, so sharing services may not show this image. Set up publishing to give it one, then choose the image again.", and the Apply message says it was linked without an address.
  - **Which values.** A repository still raster (root link, page-relative, or a full address on the site's own origin) gets a copy, including the picture a page already links when it is chosen again in the picker. An existing sharing copy is linked at the full address with no new copy. Outside addresses, SVG, animated pictures and missing files are written as typed, as before. CSS background images: the editor places none today, so nothing changed.
  - **Code.** `src/page-builder/social-geometry.ts` (centre trim, size; the only part the worker loads), `social-image.ts` (options, names, addresses, which values), `social-copy-prepare.ts` (worker seam with an optional trim for slice 44), `social-sharing.ts` (controller flow), `media-workspace.ts` `share`, worker `sharing` option; wired through `media-controller.shareImage` and `native-settings.ts`.
- **Commits.** c3597e8d claim; d325474b build (Sol; runner: geometry split out of the worker's imports, unchanged pages left out of the batch, slice 48's removal); e750c3b0 test follows slice 48's record; bbc4a604 review round 1 fixes; 7ac249e5 round 2 fix; then this close. Rebased over slices 48, 33, then 29/38/51, then 53 (its workspace `replace` sits beside `share`): the sharing branch was re-applied onto slice 29's `installMediaOptimiser` worker (SVG and HEIC paths refuse a sharing copy like a trim); `frame-guard` worker posts 6 → 7. After that rebase: check, lint, unit 2761/2761; social image, site settings, media library (real worker), adding, upload, picker and social source specs 63/63. After slice 53: unit 2795/2796 (the one, `agent-scripts` supervisor timing, passed on rerun), social image, site settings and media library specs 32/32.
- **Tests.** New `tests/social-image.test.ts` (size, never enlarged, JPEG options, centre trim landscape/portrait/full, names and removed/previous addresses, full address and encoding, no-address note, which values, outside/SVG/missing bypass, existing copy reused). `media-workspace.test.ts`: one batch and one Undo, records, original unchanged, previous copy to Recently removed, kept when still mentioned, stale sources refuse. `media-optimise.test.ts`: faked-canvas worker sharing output. New nightly `native-social-image.spec.ts`: Site settings Default social image → `og:image` is `https://sharing.example/media/images/sharing-source-social.jpg` on every page and in config, the copy is a 1200 × 630 JPEG, the original byte-identical, one Undo; the same without an address (root link and the note); Page settings with other fields in one batch; choosing the already-linked picture. Ran `npm run check`, `npm run lint`, unit 2716/2716; touched specs (social image, site settings, social source/preview, settings final proof/layout, page settings context, picker, media library/adding, upload) 71/73 on the first run (1 `@actual` case skipped there, passed in its own group: 58/58; `native-settings-final-proof` "Files Delete waiting…" failed once, passed on rerun), 28/28 after round-1 fixes; after round 2: unit 2716/2716, site settings and social image specs 18/18.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-36/round-{1,2}/` (`run.log`, `result.md`).
  - Round 1, fixed 4 (P2): reselecting the already-linked picture made no copy; choosing an existing sharing copy kept a root link; Site settings did not prove unedited pages through preparation; a repository switch during clean-up could announce success and adopt a new proof.
  - Round 2, fixed 1 (P2): a reused sharing copy is now proved to exist inside the final guarded write. Rejected 1: "an SVG chosen as the Social image must become a JPEG or be refused". The image worker cannot draw SVG (no decoder in workers), and refusing broke `native-site-settings.spec.ts`, which pins a typed SVG `og:image` as allowed; SVG stays written as typed, like outside addresses. Follow-up for slice 44: let the Social image picker offer raster pictures only.
- **Bytes.** Boot 345 KB gzip of 355 KB (`test:budget`); this slice adds about 0.2 KB (Sol's same-sitting measure +221 B: the settings port and the controller's lazy `shareImage` import). Everything else is in the lazy settings and media chunks and the worker.
- **Follow-ups.** Slice 44: call `prepareSocialCopy(blob, name, trim)` and `share` with `previous`; the record keeps the trim. Sub-folder stage (decision 7): `socialImageAddress` keeps the address's path. Pages keep a root-linked copy until the image is chosen again once the site has an address; a rewrite on setting the address belongs to that stage. Agents: no social-image tool yet.
