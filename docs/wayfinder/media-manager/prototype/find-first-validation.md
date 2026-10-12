# Find-first media directions — 2026-10-12

Planning-only comparison copied from the selected Tiles artifact at baseline `c7823099`. Canonical `tiles.html` remains unchanged, SHA256 `720341dadfda40d3f82b88fe95f5fed4d69c23e5e8d46c929a7e90f81aa77075`. The comparison's final SHA256 is `ba1e877f632cb25b5e4370ca21e4d1354ef48f6b47dfa3b20ea307b7fdef7951`.

| Direction | Placement | Useful when | Cost |
| --- | --- | --- | --- |
| Search first | Full-row search; Collections, Add files and More below | Finding an existing file leads the task | Uses two toolbar rows |
| One bar | Search, Collections and two icon actions on wide screens; search/Add/More above full-width Collections on phone | Adding and finding need equal access | Icons require familiarity |
| In the grid | Search/Collections/More; Add files is a grid tile | Adding belongs with the media itself | Add occupies one preview position; it follows results during search or collection filtering |

All directions start at All and retain ten shared records, the same 3/4/6-column Tiles density, overlapping collection memberships and all five screens. Main browsing has no Media title/header row. On phone, In the grid uses search/More above full-width Collections so the initial label stays readable; its Add tile remains distinct from One bar's toolbar Add. List and empty states retain an Add action. Management stays in More, and picker kinds remain target-compatible.

## Harness and overlays

PICKER.md CSS and standalone wiring were included verbatim and verified by direct string comparison. Only the three names/count, conditional removal of Replay/divider and permitted top position differ. Names contain nonbreaking spaces to keep the fixed pill's labels on one line. Body reserves 78/82 px above the editor, with no horizontal padding or viewport-height outer layout. Harness controls stay 28 px; product hits stay 44 px. Switching remounts a fresh demo, independently of the existing `state.variant=2` grid setting. A separate capturing guard keeps events from a native select's inert child button/options out of harness navigation without preventing native defaults.

The external harness is naturally inert behind a native modal. Close the dialog before clicking another direction. Number/arrow/replay navigation from a non-field modal control remounts the demo and removes the old dialog; it does not keep that dialog's state. Valid `?v=1–3` persists across reload. The reduced-motion test verified no highlight transition; the item's 150 ms color transition remains exactly as specified by PICKER.md.

Photo overlays use independent, noninteractive gradient and masked 8 px backdrop layers; foreground digits, filename and tick remain unfiltered. The top band is 50 px, and the lower band fades into the photograph. Checked markers use a smaller blue circle/white tick inside a separate 44 px hit. Files without a picture preview have dark numbers/names/circles and no blur/gray overlay bands. Both usage and selection have an inset keyboard-focus outline. [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) and [MDN mask-image](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask-image) informed the separate background layers; masks were not placed on the foreground-text ancestor.

## Review and fixes

The lead reported a read-only Claude Opus 5.5 medium review of immutable draft `fd1e2e743e24f376a597d8740c5028f3f9e35e0ae3c10cdecfa77c1cace8c5fd`, six library screenshots and baseline evidence: exit 0, `is_error=false`, no denials and pinned model usage. It did not run the browser or assess the picker, opened More or 1200 px screens. Accepted corrections were full-width phone Collections for In the grid; Add following search/filtered results; ordinary non-image surfaces; consistent 12 px Add/More radii; and visible inset focus. Optional suggestions were not implemented.

A white-image probe also found insufficient contrast near the lower edge of the number area. Moving the dark gradient stop from 55% to 72%, while retaining its 50 px height, corrected that measured case. The initial probe's data SVG was not URI-encoded and failed to load; the encoded test image then loaded successfully. No source asset URL was affected.

## Focused evidence

`node /tmp/mm-find-first-20261012/screens.cjs` exited 0 for three directions at 360/768/1200 px: All10, columns 3/4/6, no visible Media heading, no overflow/page errors and a 28 px harness. Phone first grid y=308.5 for all three; wide Search first y=314.5, One bar/In the grid y=262.5.

`node /tmp/mm-find-first-20261012/check.cjs` exited 0: 152 named assertions across three directions × 360/768, plus the harness block's six direct assertions and state waits. It covered real native collection open/change/focus/Escape, search/result order, all Add placements including list/empty, sample cancellation, More kind/list/cleanup, Details/Back, zero/other/unchecked usage states, blue selection, independent 44 px hits, inset keyboard focus and ordinary non-image colors. Phone image/video/PDF selection/Use/Cancel, a 30-image picker with visible sticky tools/footer and reachable last tile, and adding from the picker/returning to an actually added compatible image also passed. Harness keys, arrows, URL reload, R reset, modifier/input/select guards and modal remount passed. The old 33-case workflow suite was not rerun.

Two runner mistakes were corrected without source changes: sample Cancel returns to review and needs Back to landing before Back to library; a mouse-modality programmatic focus does not request `:focus-visible`, so the focus probe first used a real Tab. The final runs had no page errors. Node parsing, exact harness inclusion and scoped diff checks passed.

### White-background probe

A loaded pure-white SVG fixture rendered in a 107.33 px phone photo tile. Numeric box starts y=14; filename starts y=86.14. Relative background samples, measured from PNG pixels with the WCAG luminance formula, were:

| Foreground/background sample | With blur | Forced no blur |
| --- | --- | --- |
| White number, nearby background at (10,26) | 5.46:1 | 5.52:1 |
| Number's lower region at (10,32) | 5.52:1 | 5.52:1 |
| White empty-circle vicinity at (98,26) | 5.38:1 | 5.44:1 |
| White filename vicinity at (103,94) | 6.82:1 | 6.74:1 |

White tick against the computed project-blue marker is 6.10:1. The forced fallback computed `backdrop-filter:none`; gradients and sharp text remained. These are neighboring-background samples in one white fixture, not a claim to have measured every glyph or real image across browsers. Non-image dark text, no shade and inset focus were independently asserted. Unsupported engines, device compositing and long captions beyond the existing truncation remain unverified.

## Artifacts and cleanup

Screenshots and temporary helpers remain in `/tmp/mm-find-first-20261012/` for the lead's review: `library-v{1,2,3}-{360,768,1200}.png`, `selected-usage-v{1,2,3}-{360,768}.png`, `picker-v{1,2,3}-{360,768}.png`, and `bright-{tile,no-blur,selected}-probe.png`. Worker visually inspected all phone placements and One bar tablet, plus the relevant initial/final overlay captures. Temporary scripts: `build.py`, `screens.cjs`, `check.cjs`. No browser, timer, server or background command remains; every browser closed in `finally`.

T3 preview was explicitly unavailable because of the host AppArmor restriction; the lead's final preview probe returned the same error. Verification used local Chromium/file URLs without a server or host/sandbox changes. Sample usage/savings/upload/removal policies remain demonstrations. No production code, canonical artifact, tracker, commit, push, render or deployment was changed by the worker. Publication and the choice belong to the lead and Lex.

## Lead review and publication

The lead inspected the initial phone comparison and the corrected phone Search first/In the grid and tablet One bar captures, then final phone picker and selected-usage captures. The first preview's wrapped comparison labels and overly broad shading were corrected before the independent review snapshot. The accepted review fixes and measured bright-background correction were assessed against the final source; no additional broad review was requested after those bounded fixes.

`html_preview` was attempted with the exact final `ba1e877…` complete source and returned the host AppArmor error. Published with `html_render`, title **Media manager: finding and adding first — three ideas**, height 1000, thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-675e6ab4-22ac-4bba-a866-47fc3ad9305d-html`. Local images were inlined. A single plain-language question asks Lex to choose the arrangement; no answer is assumed or direction promoted. The look ticket records this exploration and the map retains one decision pointer with the pending refinement noted.

The dedicated worker `/tmp/mm-find-first-20261012` and lead `/tmp/mm-find-first-review-20261012` directories are removed after recording the evidence and publishing. The review CLI exited 0 and all browsers ended. Only the new comparison, validation and planning records are committed locally on dev, without a push or deployment. Canonical `tiles.html` stays unchanged until Lex's choice.

## Hover refinement checkpoint

Lex requested the same soft treatment on hover, then selected One bar and supplied further toolbar/upload changes. Before the selected-direction extraction, a bounded CSS checkpoint was saved in this comparison, SHA256 `675b58916ced80a33ebb8b67d7e538c3982d399139147445923d019b7afd5d73`. Expanded usage text now has separate faded-gradient and masked 8 px backdrop layers instead of the bordered dark rectangle; filename edges fade, and selection hover/focus has a soft background halo. Non-image selection stays lightly blue without blur. Foreground text, 44 px hits and checked blue/white markers are retained; no new motion or direction was added. The compact usage-label line height/padding is intended to avoid clipping the other-use state on small tiles.

Script parsing passed and canonical Tiles SHA remains `720341dadfda40d3f82b88fe95f5fed4d69c23e5e8d46c929a7e90f81aa77075`. Browser verification of this checkpoint was deliberately paused when the lead steered work to promotion of the chosen One bar direction; it is not reported as rendered or validated. Carry the CSS into that selected artifact and verify hover/focus/readability there. No browser, runner, server or temporary hover directory was started for this checkpoint.

Lex selected One bar; it was promoted into standalone `tiles.html`, and the current comparison was removed; its historical source remains available at `10450ca6:docs/wayfinder/media-manager/prototype/find-first-directions.html`.
