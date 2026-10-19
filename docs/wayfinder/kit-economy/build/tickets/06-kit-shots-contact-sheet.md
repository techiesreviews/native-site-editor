---
title: "kit shots: the contact sheet first, readable at 1x"
type: task (AFK)
status: ready-for-agent
assignee:
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
