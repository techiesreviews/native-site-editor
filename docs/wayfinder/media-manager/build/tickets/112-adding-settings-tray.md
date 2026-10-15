---
title: Adding: settings as choice cards, shorter tray messages
type: task (AFK)
status: closed
assignee: claude (mm-112 runner)
blocked_by: [105-editor-toast, 106-touch-dark-fixes]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#adding-settings-and-repository-size-a-23-a-24) and the tray finding.

- Adding settings: each kind (Images, Video, Audio) is one grouped card, 12 px radius, a 1 px line between rows; each choice a 48 px row with title, 13 px hint and a trailing ✓ for the chosen one, with no radio dots, still a radio group for assistive tech (XChat "Upload Quality", WhatsApp "Media quality"). Keep original stays a switch-like row below.
- Reset to defaults becomes a text button, hidden when nothing differs from the defaults.
- Repository size as a storage card: "320 MB" at 20 px semibold, "of 1 GB GitHub Pages allows" in 13 px muted, a fully rounded 8 px bar in the primary colour (amber from 80 %) (WhatsApp storage).
- Tray: title "2 added · 1 couldn't be added"; each failure at most two lines ("phone-export.png couldn't be added. Save it as JPEG or PNG and try again."), with the full reason under Review; Retry as a 36 px secondary button; ✕ in the tray's top-right corner.

## Done when

- Also shot (not in the audit's sets): the picker's own adding progress, ready and error states, and the repository size line at 500 MB and 900 MB.
- Specs for settings choices and the tray's failure line updated; keyboard arrows still move between choices.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour (look and words only; the agreed choices stay: Balanced recommended, Keep original, the repository size line).**
- **Adding settings.** The header is the shared `sheetHead()` (Back, title, one helper). Each kind (Images, Video, Audio) is one grouped card on `--surface-card`, 12 px corners, with a 1 px `--control-line` between rows. Each choice is a row of at least 48 px: the title, a 13 px muted hint, and a trailing ✓ in `--link` on the chosen one. There is no radio dot: the native radio stays, transparent over the whole row, so it is still a radio group, the arrow keys still move the choice, and the focused row shows the focus ring. The chosen title is semibold.
- **Keep original** is the same row with a switch at its end. It stays a checkbox for assistive tech, styled as a 36 × 20 px switch.
- **Reset to defaults** is a text button under the cards, hidden while every choice is at its default. After Reset, focus goes to the heading.
- **Repository size** is a storage card: a muted "Repository size" label, then "320 MB" at 20 px semibold with "of 1 GB GitHub Pages allows" in 13 px muted, then a fully rounded 8 px bar in `--primary`. From 80 % (`repoSizeStatus().nearFull`) the bar is `--color-warning` (amber). From 500 MB the existing warning sentence shows in the card, in `--warning-fg` from 900 MB.
- The screen's own copy of the full-screen rules is gone (slice 111's follow-up). The shared `[data-mode]` rules cover it.
- **Tray** (Media, the picker and Files share it):
  - The title reads "2 added · 1 couldn't be added" ("1 file couldn't be added" when nothing was added). Success stays "Added 2 files".
  - ✕ sits in the tray's top-right corner. The actions follow the lines they act on: Show new files, Review… and Cancel are text buttons, and Retry is a 36 px edged secondary. Each is a 44 px target.
  - Each failure is one short line from the pure rule `mediaAddingFailedLine`, for example "phone-export.png couldn't be added. Save it as a new JPEG or PNG and add it again.": the "could not be prepared" opening and a long middle reason drop. A long name keeps its start and its end (`mediaAddingShortName`, 32 characters). A two-line clamp is the backstop.
  - The full reason (`mediaAddingFailedReason`) is under Review…: the Optimise sheet lists it at its top, from Media, the picker and Files (one optional `reasons` argument through main.ts → media controller → actions → view).
  - The progress track uses `--control-line`, so it shows in dark mode.
- **Picker fix found while shooting.** With only a failed file, the picker's tray said "0 ready · Use saves and places…". `mediaAddingHoldText` now gives "1 ready · 1 couldn't be added", or the ordinary words when nothing is ready.
- **Files tray.** The toast no longer covers the Files tray's Retry: the tray is marked `data-toast-avoid` (slice 105's mechanism).

**Commits.** 337220f4 claim; 6f6df1ae build; d26ed759 test fix; fb8be8dd review fix (long names); add4f812 toast above the Files tray. Rebased on slice 113 (f0255b31).

**Tests.**
- **Unit.** `media-adding-rules.test.ts`: new title words, short lines (the audit's example, size, video, drafts, a reason without the name, a reason that names the file), long names, full reasons, hold text. `media-limits.test.ts`: `nearFull` at exactly 800 MB.
- **New browser tests in `native-media-adding.spec.ts`:**
  - Choice cards: 12 px corners, rows of 48 px or more, no visible dot, 13 px hint, the ✓ only on the chosen row; ArrowDown/ArrowUp move the choice with a focus ring and save it.
  - Reset is hidden at the defaults and a text button otherwise. Clicking Keep original's row turns the switch on.
  - The storage card at 320 MB and 900 MB (amber, warning).
  - The tray: title, a short line of at most two lines, Retry at 36 px with an edge, ✕ in the corner, and the full reason under Review….
  - A 390 px long-name failure: two lines, nothing cut off, the whole name under Review.
  - Files: Review… brings the full reason to Media's Optimise.
- **Updated specs.** `native-media-adding` (Reset hidden, wording), `native-media-collections` (title, short line, full reason under Review…), `native-upload` (wording), `native-media-touch-contrast` (a disabled-secondary probe replaces the now-hidden Reset).
- **Runs.**
  - Touched specs (adding, collections, touch-contrast, upload, newest): 56/56 after one test-only fix.
  - Picker, screen and MCP media: 30/30. Two MCP cases first failed on a trace-file clash from two runs sharing one results folder and passed alone.
  - After the rebase: adding, collections, picker, touch-contrast and upload 62/62.
  - `npm run check`, `npm run lint`, unit 3467/3467.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-112/{before,after}/` (66 each) on the real starter at 390, 768 and 1280, light and dark. They cover:
- Adding settings: the top, and the size card at 320, 500 and 900 MB; a changed choice with Reset and the focus ring.
- Media's tray in progress and with a failure.
- The picker's adding progress, ready and error states.
- Files' tray with a failure.

Scenario: `.scratch/shots112.spec.ts` in the slice worktree, run by `scripts/agents/shots.sh`. The repository size is set by patching the repository listing in the browser. The Files before-shots came from a clean 20a29358 checkout.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-112/`; run.log shows model gpt-6.1-sol, sandbox read-only; result.md starts `REVIEW_STATUS: complete`).
- One P2, fixed in fb8be8dd: a very long file name could still make the line longer than two lines.
- Both validation gaps it named were added as tests: a long name at 390 px, and the Files path's reasons.
- Nothing rejected. No second review: the fix is a small pure rule plus a CSS backstop, covered by unit and browser tests.

**Bytes.** Boot 349 / 355 KB before first preview paint. The only boot-side change is one extra argument passed in `main.ts` (tens of bytes). Everything else is in the lazy media chunks.

**Follow-ups.**
- Long reasons in other sources are untouched: the animated-GIF message names the file mid-sentence, so it shows whole (still clamped to two lines, with the full text under Review…).
- The settings column stays 34 rem wide on wide screens, left-aligned like the other sub-screens' text.
