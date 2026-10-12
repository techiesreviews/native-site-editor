# Photo-library directions — validation

Lex subsequently chose **Tiles — more pictures in cropped squares** on 12 October 2026. [The selected Tiles mockup](tiles.html) and [its checks](tiles-validation.md) now supersede Canvas. The comparison harness has been removed under the prototype skill; its reviewed source is retained in Git at `f2956c77` (`git show f2956c77:docs/wayfinder/media-manager/prototype/photo-app-directions.html`). The sections below record the comparison before selection.

Validated on 12 October 2026. The comparison owns only `photo-app-directions.html` and this record. Existing Canvas remains unchanged at SHA256 `0dc3f3b3bb48f8be447a9dbcf9229a0883cf1d0cc9eeec94657e5e7f64f944e1`. These three directions remain candidates for Lex; no choice is inferred.

Frozen comparison HTML SHA256: `6b203f2035d0bdc1cff80632b1a949743d478c250d9dc108af058b289e7348d4`.

## Directions and common behavior

- **Timeline:** groups by explicit sample `addedDate`, newest first. These dates represent the demo’s Added field, not EXIF or capture dates. Rows use each preview’s real ratio and choose their item count against a 128 px minimum; the last row stays at its target height instead of stretching to fill. Phone can therefore use one landscape photo per row, giving pictures more room but increasing vertical length.
- **Tiles:** a dense square contact sheet with 3 px gaps and cover cropping. It uses 3 columns on phone, 4 on tablet and 6 on wide desktop. Names appear on hover/focus or selection; touch and hybrid devices retain visible names. Phone filenames are 12 px and may truncate, with the full name available in Details and the accessible file control. It fits more pictures at the cost of cropping.
- **Natural:** original preview ratios with `object-fit: contain`, no date groups or cropping, and names below the image. CSS grid preserves the file/keyboard DOM order with 2 / 3 / 4 columns. Different image heights leave empty space within rows; that is this direction’s cost, rather than a CSS-column reorder.

All three share the existing Canvas controller, file data and five screens: Library, Add files/optimise, File details, actual Pages picker and Clean up. Default All includes ten unique media records: six images plus video, audio, PDF and download. Collections remain overlapping memberships without copies, available through the existing container-width filter. Search, the five kinds, grid/list, independent usage hits, selection, details, upload/Retry, placement cancellation, cleanup and Undo remain available. No usage filter, collection shortcut, visible Images scope heading, cloud sync or account workflow was introduced.

The original eight seed records stay in their original order and positions; two portrait records are appended, preserving the sample-upload controller’s existing seed references. Monochrome portrait starts unchecked and shows ? / Not checked yet. The colour portrait has one sample page use. Page-zero social use remains separate from No uses found; unchecked records are excluded from the cleanup group with no uses found.

## Assets and reference basis

The worker inspected the downloaded Google Photos timeline and Apple Photos view-options references. The lead owns their Mobbin URLs, download provenance and reference README. Reference files remain local in `prototype/references`: `google-photos-timeline.webp`, `google-photos-selection.webp`, `apple-photos-view-options.webp` and `apple-photos-filter-menu.webp`.

Actual bitmap dimensions were read with Pillow, without modifying originals:

| Preview | Actual pixels | Ratio used |
| --- | --- | --- |
| neon-forms / orange-orbit / pink-light | 960 × 538 | 960 / 538 |
| creative-laptop | 720 × 720 | 1 |
| portrait-mono.png | 472 × 521 | 472 / 521 |
| portrait-colour.png | 639 × 639 | 1 |

The layout uses these preview ratios, not the existing demo’s original/copy dimensions. Video uses the sample’s 16:9 placeholder; other non-image placeholders are square. New records and every bitmap/reference source retain full absolute local path literals for publication inlining. Real uploads, EXIF reading and processing policies are not implemented by this planning artifact.

## Harness

The prototype skill’s `PICKER.md` CSS and reference JavaScript were copied verbatim and checked for exact substring equality. Markup differs only in the three names/count and the allowed `data-position="top"`: Timeline / Tiles / Natural, with no static replay button/divider. Existing product tag rules remain scoped with `:where(#stage)`, keeping product hits at least 44 px while the floating harness is 28 px. Transparent outer body spacing of 76–82 px leaves the top pill clear of editor controls; there is no outer horizontal padding, card or title banner and no viewport-height body layout.

Switches re-mount a fresh demo and clear the old upload timer and layout observer. Native dialogs removed during a keyboard switch close with their old DOM, and the new demo remains usable. URL selection, 1–3, arrows, R and field-key ignoring retain the exact reference wiring. Timeline waits for its initial row layout without displaying a full-width unlaid image flash. ResizeObserver adjusts rows/compact placeholder icons without changing media data.

## Review findings and corrections

The lead ran a limited Opus 5.5 medium source/screenshot review of immutable draft `fcb8785b83515cdb2d2eec8901d7c109f8122d2141fdc5b2d41ffdd66a57580d` and six initial screenshots. The lead reported exit 0, `is_error: false`, no permission denials and model usage containing `claude-opus-5-5`. Its findings were addressed as follows:

- A real Tiles phone hover defect was reproduced: usage label x 52–81.97 overlapped selection x 75.33–119.33. The hit now stays 44 px; its visual label opens below both top controls, uses the tile’s available width and has `pointer-events: none`. Tested labels remain fully inside the tile rather than clipping or covering the selection hit.
- Fixed item-count rows made two phone landscape previews about 92 px tall. Row count now considers real ratio and minimum height before accepting another item. The supplied assets’ final minimum heights are reported below; single remaining items are not expanded to full row width.
- Compact placeholder icons/type words conflicted with selection or duration. Previews below 130 px use a 22 px icon below the top hits and hide the redundant type word while retaining duration; the phone Tiles video case was measured for non-overlap.
- Tiles phone filenames were increased from 10 to 12 px. `any-pointer: coarse` also keeps names visible on devices with touch and mouse.

Natural’s row whitespace was retained as a direction tradeoff. A new Select mode was not added: the brief permits the existing independent selection controls, and all three directions retain that established controller.

## Focused verification

`node /tmp/media-photo-app-20261012/check.cjs` exited 0 using local Playwright with `file://` and browsers closed in `finally`. Node `vm.Script`, exact harness comparisons, scoped `git diff --check` and direct trailing-whitespace checks passed.

Twelve layout cases covered every direction at 360, 728, 768 and 1200 px: ten records, the correct URL/harness selection, real bitmap ratios and contain behavior for Timeline/Natural, square crop for Tiles, independent 44 × 44 px usage and selection hits, single-item last rows, empty search and reset, no horizontal overflow and no browser page errors. Natural’s file DOM order matched the seed order. Tiles phone width is 107.33 px, exceeding the 96 px minimum needed by the two independent top hits.

| Direction | 360 px minimum preview height | 728 px | 768 px | 1200 px |
| --- | ---: | ---: | ---: | ---: |
| Timeline | 138 px | 128.52 px | 135.98 px | 190 px |
| Tiles | 107.33 px | 171.75 px | 181.75 px | 188.83 px |
| Natural | 89.66 px | 127.02 px | 134.50 px | 157.47 px |

Each direction’s focused phone pass also checked four usage states (pages, other uses, unchecked and checked zero-use), hover label containment below selection, tap dialogs/Escape, selected blue checkbox, clear selection, list/grid, Images and collection filtering, Details/Back, Add files/version comparison and cleanup entry points. The actual image picker showed only six compatible images, offered Details and Add files, accepted one choice, returned it through Use, and preserved Orange after Replace/Cancel. Modal arrow switching returned a fresh usable demo; 1–3, R, URL selection and input-ignore behavior passed. Existing video/PDF targeting and upload/removal algorithms are inherited from Canvas; no new broad algorithm suite was run.

The lead independently verified three directions at 360/728 with all ten records, no overflow or page errors, and the Tiles phone detail/back/image-picker/selection path. T3 `html_preview` remains unavailable with the already recorded host AppArmor error; local Playwright provides rendered evidence without changing host configuration. The lead visually inspected the final Timeline phone view, corrected Tiles usage label, phone picker and details. The reviewer described a new Select mode as missing; the lead rejected this as a requirement because Lex had not requested that interaction. The existing independent selection controls remain. Publication and pending choice are recorded below.

## Artifacts and cleanup

All worker temporary artifacts use the dedicated directory `/tmp/media-photo-app-20261012/`:

- Final library: `final-v{1,2,3}-{360,728}.png` (6).
- Phone detail and picker: `detail-v{1,2,3}-360.png`, `picker-v{1,2,3}-360.png` (6).
- Initial draft: `draft-v{1,2,3}-{360,728}.png` (6).
- Hover evidence: `hover-before-tiles-360.png`, `hover-fixed-v{1,2,3}-360.png` (4).

The temporary `check.cjs` runner was removed after verification. There is no worker server/background command or active browser, upload timer or layout observer. Existing Canvas, product code, tracker, assets and reference files were not modified. The worker did not commit, push, render, publish or deploy. Dates, file facts and usage remain sample data; direction choice is still Lex’s. The lead owns publication and final resolution.

## Publication and later selection

T3 `preview_status` and `preview_open` were attempted before browser fallback. `preview_open` and the final `html_preview` reported:

> This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+). Run `sudo env "PATH=$PATH" t3 browser setup` on the host once to allow it, then try again.

Local Playwright supplied rendered checks; no host configuration was changed.

Published with `html_render`, title **Media manager: photo-app directions**, height 1600, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-243e8714-baeb-4684-85ee-c26a59a6c9b0-html`. Absolute local image paths are inlined by the publication tool. No expiring image URL is embedded.

At publication, Lex was asked one plain-language choice question with Timeline, Tiles and Natural options, and no answer was assumed. Canvas was then the recorded baseline, with SHA256 `0dc3f3b3bb48f8be447a9dbcf9229a0883cf1d0cc9eeec94657e5e7f64f944e1`. Lex later chose Tiles; ticket 06 and the map now record that choice and point to the selected mockup. No new domain term was introduced. Both the comparison and selection work are committed locally on dev, without a push or deployment.

The lead's temporary directory `/tmp/mm-photo-directions-review-492d7080` contains the review brief, immutable snapshots, copied references, JSON/report, lead notes and eight final screenshots. It is removed after recording this evidence and publishing the inlined artifact. The worker's own temporary directory is removed in the same cleanup. The review CLI exited and browsers closed; no owned server, watcher or upload timer remains.
