---
title: A readable list view on phones
type: task (AFK)
status: closed
assignee: claude (mm-86 runner)
blocked_by: [12-usage-badges-and-list]
builder: claude
phase: 1
---

## What

Follow-up to slice [12](12-usage-badges-and-list.md)'s list view, seen in the stage-1 screenshots at 390 px: file names break in the middle of a word ("favicon.sv" / "g", "glaze-" / "tests.jpg") because the usage words leave the name about 55 px, the usage words wrap ("Used on 6" / "pages"), and one row shows a highlighted background for no visible reason.

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Phone and tablet": phone file names may shorten long names; details shows the complete name; usage and selection targets stay at least 44 px and never overlap.

- On phones each list row keeps the name on one line, never broken mid-word. A name that does not fit shortens in the middle, keeping its end and extension ("portrait-m…maya.jpg"); the complete name stays in the row's accessible name, as a tooltip, and in File details. At 390 px everyday names (up to about 20 letters) fit whole; the narrowest phones (320 px) shorten more.
- The usage number and words stay on one tidy line below the name (only the longest words, "0 pages · Other uses found", may take two balanced lines inside the 44 px target on the narrowest phones); the selection and usage targets stay 44 px, apart, and the list never scrolls sideways (320 to 1280 px).
- On wider screens the list keeps complete names, and the usage numbers line up in one column.
- A row is highlighted only by real hover (a mouse), keyboard focus or selection. The hover background of the selection and usage controls covers only that control, never the whole row, and does not stay behind after a tap on a touch screen.
- Code stays in the lazily loaded Media chunk.

## Done when

- `tests/native-save/native-media-screen.spec.ts`: on a 390 px phone a long name shows on one line, shortened with its extension kept and the complete name in its accessible name and tooltip; short names are whole; usage words do not wrap; targets 44 px and apart; no sideways scroll at 320 px. After a tap on a row's usage, no row keeps a highlighted background; hovering a control with a mouse highlights only that control.
- Unit tests for the pure name-shortening split.
- Scratch screenshots at 320, 390, 768 and 1280 px, before and after.

## Done (2026-10-14)

- **Cause of the highlighted row.** In the list, the selection and usage controls were `position: static`, so their soft hover background (`::before`, `inset: 0`, 22 px radius) stretched over the whole row; and `:hover` stays on a touch screen after a tap. In the stage-1 shot that was the More → List tap, whose spot sits over the last row's controls. Reproduced on origin/dev at 390 px (a row lit with no interaction) and at 1280 px (hovering one usage badge lit its whole row). It was not an intended "other uses" style.
- **Behaviour.** The list's rows share its columns (subgrid). On wider screens names stay complete, the usage numbers sit in one column and their words never wrap ("0 pages · Other uses found" included). On phones (Media narrower than 520 px) each row takes two lines: the name on one line with its size beside it, and the usage pill (44 px) below the name. A name that does not fit shortens in the middle, keeping its end and extension (`nameEnds`: an extension of up to 5 letters, plus the stem's last 4 letters when the stem is longer than 8). The full name stays in the row's accessible name ("Details for …"), as a tooltip and in File details. At 390 px everyday names fit whole; at 320 px names longer than about 12 letters shorten. The selection and usage controls are their own boxes, and their soft background shows only for a mouse hover or keyboard focus, never after a tap. The Always keep and By agent marks follow the picture's lower corner on the taller phone rows. Grid tiles are unchanged.
- **Commits.** a9d45b01 claim; 754a8ccc phone list, aligned usage, highlight fix; 070280ea review follow-up (tests, ticket wording); close.
- **Tests.** Unit: `tests/media-library-filter.test.ts` adds 3 `nameEnds` cases (long names, dot files and long or missing extensions, two-unit characters); all units 2542/2542. Browser `native-media-screen.spec.ts`: the phone long-name test now checks one line, the middle shortening with "ober.png" kept, the tooltip and "Details for" name; the 44 px test runs at 390 and 320 with targets apart, usage below the name and no sideways scroll; new: a tap on a phone leaves no control lit, and a mouse lights only the hovered control; new: usage words in every state (Not checked yet, Used on 1 page, No uses found, Other uses) at 320/390/1280, one line except "0 pages · Other uses found" at 320 (two lines at most, inside 44 px), long names whole and numbers aligned at 1280. Ran media screen, tab, picker, fades and library 72/72 (before the review follow-up); media screen 16/16 local fonts after; with CI fonts media screen and tab 43/44 (one 320 px over-strict check, relaxed), then the list tests 6/6 in both fonts. `npm run check`, `npm run lint` clean.
- **Screenshots.** Before (origin/dev c49c4f66) and after at 320, 390 (touch), 768 and 1280, with tap-and-close and mouse hover states, on the starter plus 5 scratch pictures with long names: `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-86/{before,after}/`.
- **Review (GPT-6.1 Sol).** Log: `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-86/review/run.log` (result.md beside it, `REVIEW_STATUS: complete`). Fixed: both validation gaps (every usage state at 320/390; long names and aligned numbers on wide lists). Rejected in part: P2 "usage words wrap at 320 px". At 320 px the space beside the picture is about 150 px, and "0 pages · Other uses found" needs about 215 px at the list's small text size. Fitting it would mean dropping words, shrinking 44 px targets or shrinking text. It now takes two balanced lines inside its 44 px target there, without growing the row; every other phrase is one line, and at 390 px all are. The test pins this. No re-review: the follow-up changed tests and the ticket's wording only.
- **Bytes.** Same-sitting builds against origin/dev c49c4f66: entry JS +9 B gzip (chunk name), entry CSS ±0; lazy media chunk JS 17,926 → 17,968 B (+42), CSS 7,611 → 7,775 B (+164). Byte budget 342 KB of 355 KB.
- **Follow-ups.** Grid tiles still use `:hover`/`:focus-within` for the badge and selection backgrounds, so on touch screens a tapped tile can keep its soft background and usage words until the next tap elsewhere. That's the same cause as the list's, so a small grid-side fix could reuse this slice's rule.
