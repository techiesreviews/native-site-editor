---
title: "kit shots: the contact sheet first, readable at 1x"
type: task (AFK)
status: closed
assignee: ke-06
blocked_by: [04-kit-slice]
builder: sol
---

## What

Today `kit shots` (`scripts/agents/kit.d/shots` → `scripts/agents/shots/cli.ts`, captured by
`shots/capture.spec.ts`) writes per shot a PNG and a WebP under 40 KB, then `contact.html`
(`contactHtml()` in `shots/core.ts`: one row per screen, tiles at least 150 px wide) and
`contact.webp`: a full-page screenshot of that HTML at a 1000 × 900 viewport, encoded by
`smallWebp()` (`shots/output.ts`) under 300,001 bytes, shrinking quality then size by 0.8 steps.
The CLI prints every PNG/WebP path first, then `index.json`, then findings; `contact.webp` is one line
among many and the RESULT line names only the out dir. With many screens the sheet becomes a tall
strip whose tiles are too small to read, so agents opened single PNGs at 2x (up to 300 KB), often twice.

- **One contact sheet readable at about 1x**: at most 1600 px wide and 2400 px tall, each tile
  labelled `screen · width · theme` (and before/after for compares), file at most ~300 KB. Tiles keep a
  readable size (narrow shots at their CSS width up to 400 px, wider ones scaled to fit); when all
  tiles do not fit one sheet, split into numbered sheets `contact-1.webp`, `contact-2.webp`, … by
  whole screen rows. Quality may drop to reach the byte limit, dimensions only as a last resort.
- **Output order**: the sheet path(s) are the FIRST output line(s) (`contact: <path>`), and the RESULT
  line names them: `RESULT: ok shots <n> files, …, contact <path>[ +N more]`. Per-file paths stay in
  `index.json`; by default the console prints only `<n> files: <index.json path>`, and a new
  `--files` flag lists every path as today (documented in `--help`).
- `--compare` (`shots/compare.mjs`) follows the same rule for its paired sheet.
- Docs: `docs/agents/runner.md#screenshots` says: view only the contact sheet; open a single PNG only
  for a specific finding, and never twice. The `kit shots` line in `docs/agents/agent-scripts.md#kit`
  states the sheet limits.

## Files

- `scripts/agents/kit.d/shots`
- `scripts/agents/shots/cli.ts`
- `scripts/agents/shots/core.ts`
- `scripts/agents/shots/output.ts`
- `scripts/agents/shots/capture.spec.ts`
- `scripts/agents/shots/compare.mjs`
- `tests/kit-shots.test.ts`, `tests/kit-shots-compare.test.ts`
- `docs/agents/agent-scripts.md`
- `docs/agents/runner.md`

## Done when

- Pure tests: the sheet layout (tile sizes, labels, rows) for 1, 13 and 39 shots (13 screens × 3
  widths), the split into numbered sheets by whole rows, and the encoding steps (quality before
  dimensions; never above 1600 px wide).
- A CLI test (stubbed capture) proves the contact path is the first output line and is in the
  RESULT line, for one and for several sheets, and for `--compare`.
- One real run (`kit shots` of three screens) recorded in Done with the sheet sizes in px and KB.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-shots.test.ts tests/kit-shots-compare.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.


## Done (2026-10-19)

- Behaviour: contact sheets use the original PNGs, keep narrow shots at CSS width up to
  400 px, scale wider shots to fit, and label each tile with screen, width, theme and name
  (including before/after). Pure geometry bounds each sheet to 1600 × 2400 px and splits
  into `contact-1.webp`, `contact-2.webp`, … only between complete rows. A single sheet
  remains `contact.webp`. Actual PNG heights are recorded; unusually tall images also
  scale to fit a complete sheet. Each WebP is at most 300,000 bytes; encoding exhausts
  quality 85, 70, 55, 40, 25, 20 before reducing dimensions by 0.8.
- Output: normal and compare captures print `contact: <path>` first, followed by the file
  count and `index.json`. RESULT includes the first contact path and `+N more` for additional
  sheets. `--files` lists every generated path plus the index; capture diagnostics go to
  stderr. Raw specs retain their own output contract. The help and screenshot guidance
  describe the limits and opening individual PNGs only once for a specific finding.
- Tests: `scripts/agents/unit.sh tests/kit-shots.test.ts tests/kit-shots-compare.test.ts`
  passed 28, failed 0 (`.scratch/unit/20261019T101812-3.log`). Coverage includes 1, 13 and
  39 shots, wrapped rows, paired before/after rows, bounded encoding and contact-first CLI
  output for single and multiple sheets, normal captures, compares and `--files`.
  Including `tests/agent-scripts.test.ts` passed 43, failed 0
  (`.scratch/unit/20261019T101703-4.log`). `npm run check`, `npm test` (4,750 passed,
  0 failed), and `npm run lint` passed; lint reported 0 export-check failures.
  The first full run exposed the runner documentation line limit and two test-fixture
  mismatches; all were corrected before the passing rerun. Final logs are under
  `.scratch/ke-06-validation/`.
- Kit evidence: `RESULT: ok doctor 7/7 checks passed`;
  `kit specs --affected --list` reported `RESULT: ok specs none affected`.
  The changed `scripts/agents/shots/capture.spec.ts` ran through the real capture below.
- Real run: `ASE_OWNER=ke-06 KIT_MAIN_ROOT="$PWD" scripts/agents/kit shots editor media-gallery files --theme light --out .scratch/ke-06-shots`
  captured nine shots at 390/768/1280, all on their first attempt. Inspected only the two
  contact sheets: `.scratch/ke-06-shots/contact-1.webp` is **1262 × 2048 px, 80.962 KB**
  (80,962 bytes); `contact-2.webp` is **1262 × 1056 px, 30.554 KB** (30,554 bytes).
  Both retain their planned dimensions. One app layout finding remains outside this
  ticket's Files: the editor's 768 px light rule button is 100 × 20 px, below the 24 px
  tap-target minimum.
  `RESULT: ok shots 22 files, 0 failed, 1 layout findings, contact /home/ubulex/Projects/native-site-editor-build-ke-06-shots-sheet/.scratch/ke-06-shots/contact-1.webp +1 more, out /home/ubulex/Projects/native-site-editor-build-ke-06-shots-sheet/.scratch/ke-06-shots`
- Dogfood: this build is already running under `kit slice`. Its saved state at
  `.scratch/kit-slice/06-kit-shots-contact-sheet/state.json` records the completed brief
  and the Sol/high builder path. It helped by supplying the scoped brief and preserving
  the build phase for the outer runner. No nested slice or agent was started.
- Commits and review decisions: changes are intentionally unstaged; this builder made no
  commits and ran no separate review, push or deployment, as required by the build contract.
  Sol review via `kit review --ticket`, any resulting decisions, and landing via
  `kit pr --ticket` into `dev` with green CI remain the outer runner's next phases.
