# Canvas — selected planning prototype

Lex selected Canvas as the final visual direction, including phone and tablet, on 12 October 2026. `canvas.html` is the selected-only planning artifact. It does not implement or deploy the production editor.

Frozen HTML SHA256: `5bad53883e6854905ff0ef8976a63ea9ac90a78a9a5df03f1b5f1f8a77e88af9`.

Source: the final `look-directions.html`, SHA256 `35d766bc46afca0a03e9c76cbafb7cf577c2fb55b45c2f7dbccd3c26f66ed94f`. Existing comparison and refinement files remain unchanged.

## Selected-only changes

- Fixed `activeLook='canvas'`, initialized the existing `fresh(2)` state and rendered with `refresh()`.
- Removed the comparison navigation, its exact harness CSS and JavaScript, variant render helpers and reserved 76/82 px top spacing. The body now has normal 12 px phone / 16 px tablet top padding, no horizontal padding, a transparent background and natural content height.
- Set the browser title to Media manager — Canvas and the outer note to Canvas · sample content. No visible comparison or pending-choice wording remains.
- Retained Canvas’s phone contact-sheet ratio, caption backplate, white panels with 16 px padding, single-row footer actions below status, explicit selected blue marker and all absolute local demo/reference paths. Unused Quiet style selectors are harmless and were retained to avoid unnecessary refactoring.

The existing media data and workflows remain intact: Images on first open, collections on demand with overlapping memberships, search/kind/filter/view controls, usage states, details, Add files/optimise, actual Pages picker with compatible selection, and cleanup. All five screens retain their existing entry points. Earlier workflow, responsive look, contrast, footer and selected-marker evidence is recorded in [look-validation.md](look-validation.md); those wider flows were not repeated for removing the comparison harness.

## Focused verification

An inline Node/Playwright runner using local `require('playwright')` and `chromium.launch({headless:true})` opened the standalone HTML through `file://`; it exited 0. At 360, 728 and 768 px it checked:

- Canvas initializes immediately without a prototype picker; Images is active and the four sample images appear. Grid columns are 2 / 3 / 3.
- Horizontal body padding is 0. Top padding is 12 / 16 / 16 px; first grid positions are 428.5 / 434.5 / 434.5 px. There is no document horizontal overflow or browser page error.
- File details opens from Orange Orbit and Back restores the image grid.
- The actual Pages image picker opens as a native modal on compatible images. Selecting Orange gives a blue `rgb(36, 89, 211)` marker and a white `rgb(255, 255, 255)` SVG tick. The native picker has no horizontal overflow; Cancel returns to the page’s choosing control.
- Inline JavaScript passes Node `vm.Script`. Scoped `git diff --check` and direct trailing-whitespace checks pass.

No new full upload/cleanup or UX review was required for this extraction. The lead owns publication and the ticket’s resolution record.

## Artifacts and cleanup

Final screenshots:

- `/tmp/media-canvas-final-360.png`.
- `/tmp/media-canvas-final-728.png`.

This pass created no temporary helper script, background process or server. No demo upload timer was started; all worker browser instances were closed in `finally`. Existing comparison screenshots remain covered by the cleanup list in `look-validation.md`. Only the new `canvas.html` and this record were written. No production change, commit, push, render, publication or deployment was performed by the worker.

## Selection and publication

On 12 October 2026, Lex selected Canvas as the final look, explicitly including phone and tablet presentation. The lead visually checked the selected-only phone and 728 px screenshots. T3 `preview_status` reported no available browser; `preview_open` and `html_preview` returned the same host AppArmor sandbox error as previous rounds. The local browser verification above supplied rendered checks; no host configuration was changed.

Published with `html_render`, title **Media manager: Canvas — final mockup**, height 1100, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-087a675a-4678-4d42-b9b6-9c5bac8a8739-html`. The artifact uses local images inlined by the publication tool. Ticket 06 records the resolution; optimisation, naming and removal policies remain with their separate tickets. No editor code was changed or deployed.

## 12 October revision — Photos-inspired library

Lex subsequently revised the closed Canvas choice: show all media initially, remove the separate Collections shortcut and Images heading, expose collection filtering directly where it fits and fold it on narrow containers, remove the usage filter, and reduce small explanatory chrome. This section records the new artifact without changing the earlier selection and validation history above.

Current revised HTML SHA256: `f5ee2a6272eef91ba489036bceedb3be0c90d0480801bfcaee235ddb7cbc056c`.

Baseline before this revision: `5bad53883e6854905ff0ef8976a63ea9ac90a78a9a5df03f1b5f1f8a77e88af9` at Git baseline `81860fb5`.

The visual reference is the downloaded Apple Photos library screenshot, `prototype/references/apple-photos-library.webp`, from [Apple Photos on Mobbin](https://mobbin.com/screens/fd1557f6-17b2-4214-baca-c788ba625f5d). The implementation worker viewed that local screenshot and the revised phone/wide screenshots together. The revision follows its light white chrome and thumbnail-led grid; it retains this editor’s Pages / Media / Files navigation, Canvas filenames, selection controls and media workflows.

### Changes

- Initial state, Clear filters and Reset demo use All. Picker filtering remains restricted to the applicable image/video/PDF target.
- The library has no Collections shortcut, visible Images/All media scope row or collection-card navigation. Collection is the sole extra filter; the Usage select and its file-filter condition were removed. Usage badges, page/other-use details and the No uses found cleanup group remain.
- Each library control strip is a named inline-size CSS container. At 640 px of actual strip width, Collection displays directly alongside the kind row with no Filters toggle. Narrow strips fold Collection behind Filters, including an active count. Container queries respond to resizing without re-mounting or altering selection/filter state; the smaller picker measures its own available width.
- Search/kind/filter/view controls use two compact rows on wide screens and an additional Filters/view row on phone. The white controls box and gray app field are flattened into the existing white app surface. Thumbnail gaps are 4 px. Filenames stay on the dark caption, with the grid’s kind/size line removed; the list and details retain real size/usage data.
- Removed Website editor · draft, Documents helper copy, the outer Canvas sample note, library Inspiration and the explanatory footer. Reset demo remains in More without helper copy. The original reference assets, absolute local media paths, safety/status/error copy and undecided processing-policy notes remain intact.
- `#library-title` remains an accessible, clipped focus anchor. Its programmatic focus has no outline, so collection navigation preserves the native picker’s focus/scroll behavior without a visible blue point.

No production code or new workflow policy was introduced. Existing multi-collection memberships, blue selected markers, 44 px controls, responsive grid, details, Add files, compatible picker placement and cleanup behavior remain inherited.

### Focused checks

`node /tmp/media-canvas-photos-check.cjs` exited 0 with local Playwright and `file://`. It checked 360, 728 and 768 px: all eight records and All on first open; no Collections shortcut, usage dropdown, grid kind/size line, visible scope chrome or explanatory footer; narrow/inline Collection controls; kind/search/collection filtering, list size/usage, social-use dialog, blue selection, one Details/Back, and Reset returning to All. Both main library and picker retain the selected collection through wide ↔ phone resizing. The focused anchor computed `clip-path: inset(50%)`, width 1 px and `outline-style: none` when focused.

A separate same-viewport probe at 720 px confirmed the main library exposes Collection inline while the smaller picker’s 638 px content folds it. At 728 px both main and picker have room and expose it directly; at 360 px Collection is reached through Filters.

Native picker checks covered image, video and PDF target compatibility, collection changes, the blue marker/white tick, one-line footer buttons at least 44 px tall, Cancel, and Replace cancellation preserving Orange Orbit on the page. There was no document/native-picker horizontal overflow or browser page error. Add files and Clean up received entry-point smoke checks only; the existing upload/removal algorithms were not rerun. Node `vm.Script`, scoped `git diff --check` and direct trailing-whitespace checks passed.

First grid positions, with a 900 px browser height:

| Width | Previous Canvas | Revised library |
| --- | ---: | ---: |
| 360 px | 428.5 px | 340.5 px |
| 728 px | 434.5 px | 292.5 px |
| 768 px | 434.5 px | 292.5 px |

### Revised artifacts and cleanup

The source is frozen at the current revised SHA above for the lead’s limited library/picker review and publication. Final screenshots:

- `/tmp/media-canvas-photos-final-360.png`.
- `/tmp/media-canvas-photos-final-728.png`.
- `/tmp/media-canvas-photos-picker-360.png`.

Draft screenshots are `/tmp/media-canvas-photos-draft-360.png`, `/tmp/media-canvas-photos-draft-728.png` and `/tmp/media-canvas-photos-draft-768.png`. The temporary runner `/tmp/media-canvas-photos-check.cjs` was removed after verification. All worker browsers were closed, no upload timer was started, and no server/background command remains. Only `canvas.html` and this record were changed by the worker; no existing references, comparison/refinement files, production code, commit, push, rendering, publication or deployment was changed.

## Limited library/picker review — Filters button

The lead’s limited Opus 5.5 medium review evaluated the revised source snapshot `f5ee2a6272eef91ba489036bceedb3be0c90d0480801bfcaee235ddb7cbc056c` and five screenshots. The completed source/screenshot evaluation returned exit 0, `is_error: false`, with model usage matching the requested pin. All other requested library/picker changes passed; the only blocker was the phone Filters control reading as a plain section label rather than a clear button. Optional layout observations were not expanded into additional changes.

Current final HTML SHA256: `0dc3f3b3bb48f8be447a9dbcf9229a0883cf1d0cc9eeec94657e5e7f64f944e1`.

Before the correction, a local browser reproduced both border and background as transparent while the control was 44 px tall. The sole source change removes `.look-canvas .collection-toggle{border-color:transparent;background:transparent}`, restoring the existing product button’s visible 1 px border and white background. No icon, workflow or layout layer was added.

A focused inline Node/Playwright check exited 0 at 360 px for the main library and native picker. Both controls computed border `rgb(220, 226, 234)`, background `rgb(255, 255, 255)`, border width 1 px and height 44 px. Clicking opened and folded the collection dropdown. After selecting Studio art, Filters (1) remained accurate. Resizing to 728 px hid the toggle and kept the collection directly visible; resizing back retained the selected collection and control state. There was no document/native-picker horizontal overflow or browser page error. Scoped `git diff --check` and direct trailing-whitespace checks passed. No broader workflow or style checks were repeated.

Final button-focused screenshots:

- `/tmp/media-canvas-filters-button-360.png`.
- `/tmp/media-canvas-filters-picker-360.png`.

This correction created only those two screenshots, no helper or server. All worker browser instances were closed in `finally`, and no upload timer was started. The source is frozen at the final SHA above for the lead’s focused check and publication. Only the owned Canvas HTML and this appended validation record changed; no production, reference, commit, push or publication action was performed by the worker.

### Lead review and revised publication

A limited read-only Claude CLI review used `claude-opus-5-5 --effort medium`, source snapshot SHA256 `f5ee2a6272eef91ba489036bceedb3be0c90d0480801bfcaee235ddb7cbc056c`, and five captured library/picker screenshots, including before/after views. It completed with exit 0, `is_error: false`, no permission denials, and model usage including the exact pin. The reviewer confirmed the requested removals, All default, wide inline collection filtering, retained usage badges and compatible picker. It could not open the relative baseline-source path; baseline screenshots were inspected, so the assessment does not claim a full baseline-code comparison. Its one blocker, the narrow Filters button appearing as plain text, was corrected above.

The lead independently verified the corrected source at 360 px, resizing to 728 px and back: All opens with eight records; Filters has a 1 px border and a 44 px hit area; Studio art narrows the grid and stays selected across resizing; wide layout exposes the collection dropdown and hides the toggle; the compatible picker exposes the same working collection filter without overflow or page errors. The initial lead runner assumed the picker’s inherited Filters panel was closed and toggled it closed, causing a locator timeout. The corrected runner checks visibility first, then passed; no implementation change was needed. Browser instances were closed in `finally`.

Final source SHA256 is `0dc3f3b3bb48f8be447a9dbcf9229a0883cf1d0cc9eeec94657e5e7f64f944e1`. The lead viewed the corrected phone Filters screenshot. T3 `html_preview` was attempted with this source and returned the same AppArmor sandbox error; local browser checks supplied verification, and no host configuration was changed. Published with `html_render`, title **Media manager: photo-style Canvas**, height 1250, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-e4e3fba8-9f28-451f-8216-77cd5c98a8e6-html`. Ticket 06 remains closed with its resolution amended to Lex’s explicit changes. No editor code was changed or deployed.
