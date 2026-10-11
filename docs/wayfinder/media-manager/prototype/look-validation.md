# Media look directions — validation

Validated locally on 11 October 2026. Owned paths are `look-directions.html` and this record. These are visual candidates for Lex’s overall look-and-feel choice; neither direction is a product decision.

Frozen HTML SHA256: `35d766bc46afca0a03e9c76cbafb7cf577c2fb55b45c2f7dbccd3c26f66ed94f`.

Baseline: the approved compact `refined.html`, SHA256 `0431ecc60d439bf9623a1d80a2bd672d82858c8c99f0e0a72f488c62a2c48d2b`. The lead confirmed this is the same behavior at the brief’s Git baseline `6a2efc05`. The baseline file remains unchanged. The new comparison reuses its sample media, absolute local image/reference paths, state model, target-restricted picker, page placements, checked/unchecked use model, upload/Retry, collection memberships, details and cleanup. There is no new product code, commit, push, publication or deployment.

## Visual directions

- **Quiet:** flat white file browser, no app frame or persistent tile border/shadow, small corners, metadata below each picture, lightly separated list rows and short collection rows. Details, version comparison and cleanup follow the same restrained surfaces. It makes names and facts easy to scan, with smaller pictures.
- **Canvas:** close contact sheet with 6 px gaps, larger pictures and a separate white tool strip. Metadata sits on a fixed solid `#142033` backplate; text remains readable over the bright sample pictures. Collections use an existing photo as a cover where one exists, without adding media records. Details and optimisation give the image more space; cleanup stays compact. On phone the 4:5 picture area is about 201 px tall; after its 48 px caption, about 153 px of picture remains visible, compared with Quiet’s 118 px picture. The cost is more vertical space. Tablet keeps square contact-sheet pictures.

Both retain Images on first open, collections on demand, five kind buttons, search, Filters, grid/list, scope headings and search recovery, accurate collection counts and the latest Back snapshot. All five screens remain available through real controls: library, file details, Add files/optimise, actual Pages picker and More → Clean up.

## Prototype harness and surfaces

`PICKER.md` at `/home/ubulex/.codex/skills/prototype/PICKER.md` supplies the exact CSS and reference JavaScript, copied verbatim. Only names/count changed to Quiet / Canvas, with the allowed `data-position="top"`; there is no static replay button or divider. Product tag styles are scoped with `:where(#stage)` so the harness retains its specified 28 px height while product controls keep 44 px hit areas. Variant swaps are instant; only the prescribed picker highlight transitions. Each variant render resets the sample demo on re-mount, including its timer and native dialogs; the comparison does not promise to retain a workflow position between looks.

The transparent outer body has no horizontal padding, card or title banner. Its 76–82 px top spacing leaves room for the top harness. App surfaces and Canvas’s independent white control/header/footer panels retain at least 16 px padding. Page content uses natural height, with no body/html viewport-height layout. Native dialogs enter the browser’s top layer; while one is open the floating harness outside it is intentionally inaccessible by pointer. Close the dialog to compare by mouse/touch; the reference arrow-key behavior can also re-mount a fresh look from a modal button.

## Focused verification

Command: `node /tmp/media-look-check.cjs`, exit 0, local `require('playwright')` / `chromium.launch({headless:true})` with `file://`. The helper was removed after its results were recorded. No server or host configuration change was needed.

The runner checked both looks at 360, 728 and 768 px:

- Exact harness CSS and JavaScript substring equality against the skill; 28 px top pill, one active item, URL selection, arrow switching, R re-mount, field-key ignoring and an arrow switch from an open media dialog returning to a working fresh demo.
- Initial Images with the same four pictures; primary kind controls on one row with 44 px height. All eight media records across the file kinds in the library, grid/list, guide search and broader search recovery, collection counts/search/Back, extra filters and separate page/other-use dialogs.
- Canvas solid captions have at least 4.5:1 contrast for both the file name and its secondary kind/size text. Bright pictures, non-image media and a long filename were checked. Long names remain ellipsised in the tile and available in the accessible file control/detail form. Metadata never covers the independent top badge and selection controls.
- Usage and selection each have at least 44 × 44 px hits and do not overlap. Hover zero-use text, tap other-use/page names, Escape and focus return remain available.
- Details, disclosures, multi-collection save without copies, long-name save, Add files/version comparison and the existing demo-policy notes; all cleanup groups and its review list remain reachable.
- Actual page picker with the same compatible files and views, a single selected file, page choice, Replace cancellation preserving the placement and native-dialog usability. At 360 px the picker fills the phone; at 728/768 px it is 688/728 px wide.
- No document or native-picker horizontal overflow and no browser page errors. Inline JavaScript passed Node `vm.Script`; scoped `git diff --check` passed.

A separate inline phone check used an unchecked display fixture in memory, without exercising or changing the upload algorithm. Both looks rendered ? / Not checked yet, hover labels stayed within the independent selection hit, and tapping showed the unchecked usage state. Canvas selected-caption contrast was 11.09:1 for the name and 9.24:1 for secondary text. The temporary fixture disappeared when its browser closed.

The baseline’s click/input/change/submit handlers and `beginUpload` / `addUploaded` functions were compared verbatim in the new HTML. The already validated mixed upload, retry and cleanup algorithms were reused rather than broadly retested; this pass targets changed presentation and control access. All worker browser instances were closed. No background server or command remains running.

## Review artifacts and cleanup

Frozen final screenshots for the lead’s independent look/harness review:

- `/tmp/media-look-final-v1-360.png`, `/tmp/media-look-final-v1-768.png`.
- `/tmp/media-look-final-v2-360.png`, `/tmp/media-look-final-v2-768.png`.
- `/tmp/media-look-detail-v1-360.png`, `/tmp/media-look-detail-v2-360.png`.
- `/tmp/media-look-picker-v1-360.png`, `/tmp/media-look-picker-v2-360.png`.
- `/tmp/media-look-canvas-all-kinds-360.png`.

Earlier draft screenshots remain `/tmp/media-look-draft-v1-360.png`, `/tmp/media-look-draft-v1-768.png`, `/tmp/media-look-draft-v2-360.png`, `/tmp/media-look-draft-v2-768.png`. The helper `/tmp/media-look-check.cjs` was deleted. The lead owns independent review, rendering and publication; no publication was performed by the worker.

## Independent review and phone footer fix

The lead’s read-only Claude CLI review used Opus 5.5 at medium effort on immutable snapshot `070c14ba52a82d62be77f9f36a9d1cdff637ccccb3fc12bc01529d69389d3ccd` plus the nine final screenshots. It completed with exit 0, `is_error: false`, and model usage containing the requested pin. The reviewer judged the looks distinct and found no other blockers in the look/harness evaluation; it did not run the prototype.

The one reported defect was reproduced at 360 × 900 px: Canvas’s Use image button was 90.92 px wide and 62 px tall, and its label occupied two text lines while the footer correctly retained 16 px padding. The narrow fix changes only the Canvas phone footer layout: status occupies its own row, with Cancel and Use side by side below it. Buttons use `white-space: nowrap` and retain at least 44 px height; the white panel keeps 16 px padding on every side. Quiet, desktop/tablet layout, the business model and the exact prototype harness remain unchanged.

A focused inline Node/Playwright check opened the actual image, video and PDF page targets at 360 × 900 px. Before and after selection, Cancel and Use each measured 144 × 44 px, had exactly one text line, and shared a row below the status. All three targets retained 16 px footer padding, with no document/dialog horizontal overflow or page error. The selected choice enabled Use. The command exited 0 and closed every browser in `finally`; it created no helper file or server. Scoped `git diff --check` passed. No broader workflow tests were repeated for this CSS-only correction.

The final Canvas phone picker screenshot is `/tmp/media-look-canvas-picker-footer-fixed-360.png`; it supersedes the earlier Canvas phone picker image for footer assessment. The source is frozen at the SHA above for the lead’s focused verification and publication. All previously listed screenshots remain available for cleanup; this pass adds only that one screenshot. No production code, commit, push, rendering or publication was performed by the worker.

## Selected marker correction

The lead independently checked the corrected image/video/PDF phone footer and confirmed its shared action row, 44 px height, 16 px panel padding and absence of overflow. While viewing Orange selected, the lead found a separate CSS specificity defect: the look’s white selection-button background overrode the baseline selected background, leaving a white tick on white.

Before changing snapshot `3402e0eb85be1f2da504e8d89134cf293fc54e5122e9bbd2df08fa4cee4c2cdb`, a local browser confirmed selected Quiet and Canvas markers used white `rgba(255, 255, 255, 0.94/0.95)` backgrounds with `rgb(255, 255, 255)` tick colour. The sole correction is `.look-root .select-tile[aria-pressed=true]`, setting background and border to the existing primary blue and colour to white with explicit selected-state priority.

A focused inline Playwright check passed for Quiet/Canvas × library/picker, at 360 × 900 px. All four selected markers computed background and border `rgb(36, 89, 211)`, with colour and SVG tick stroke `rgb(255, 255, 255)`. The adjacent unselected marker remained white and `aria-pressed=false`. The command exited 0 and closed its browsers. The footer and broader workflows were not retested for this colour-only rule.

The latest selected Canvas picker screenshot is `/tmp/media-look-canvas-picker-selected-fixed-360.png`; it supersedes the earlier selected phone-picker image for the final marker check. The final source is frozen at the SHA above. This pass created only that screenshot, no helper or server, and changed only the two owned look files. Scoped `git diff --check` and a direct trailing-whitespace check passed. Publication remains with the lead.

## Lead review and publication

The lead ran a read-only Claude CLI UX/design review with `claude-opus-5-5 --effort medium` on immutable source SHA256 `070c14ba52a82d62be77f9f36a9d1cdff637ccccb3fc12bc01529d69389d3ccd` and nine rendered screenshots. The process exited 0, `is_error` was false, and model usage included the exact pin. The review confirmed a real difference in layout, readable captions and an unobstructed comparison picker; it found the Canvas phone footer label wrapping. The worker reproduced and corrected that issue as recorded above.

The lead independently checked Canvas’s image/video/PDF picker footer at 360 × 900 px: Cancel and Use share a row, Use is 44 px high with `white-space: nowrap`, footer padding is 16 px, and neither the picker nor its actions overflow horizontally. No page errors occurred and the browser was closed. The lead’s final visual check also found the white selected tick on a white button; the worker’s four-case correction is recorded above. The final selected screenshot shows the blue button with a clear white tick. These are focused assessments of the corrections, not a claim that Opus reviewed the later source.

T3 `html_preview` was attempted with the final source and returned the same host AppArmor sandbox error recorded in earlier rounds. Local Playwright checks and rendered screenshots supplied verification; no host configuration was changed. The final source was published with `html_render` at height 1200, title **Media manager looks: Quiet and Canvas**, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-5a3e5a8c-5694-4e1d-9972-36b0e53d2ea1-html`. Lex’s final choice remains pending. No editor code was changed or deployed.
