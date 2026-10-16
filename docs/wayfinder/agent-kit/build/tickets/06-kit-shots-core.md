---
title: "kit shots: named screens, every size and theme, small copies and a contact sheet"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- **Named screens** in `scripts/agents/shots/scenarios.ts`: `editor`, `media-gallery`, `media-select`, `file-details`, `image-popup`, `picker`, `files`, `pages`, `site-settings`, `cleanup`, `improve-images`, `add-panel`, `structure`. Each is built from helpers in `tests/support/scenarios.ts` (`openEditor` — the shared "editor loaded" wait used by shots and specs —, `openMedia`, `openFileDetails`, `pickPicture`, `openFiles`, `openPages`, `switchSiteMidUpload`…), so specs can reuse them (ticket 22).
- **Steps file** (`.scratch/**/*.json` or `.yaml`): `{"screen":"media-gallery","steps":["click \"Filter\"","type \"logo\" in search","hover first tile"],"name":"filtered"}`. Step grammar: `click "<name>"`, `type "<text>" in <label>`, `hover <first|last|nth N> tile|"<name>"`, `press <key>`, `scroll <down|up>`, `wait for "<text>"`. Unknown step → error naming it. `--spec <file.spec.ts>` keeps the raw Playwright escape hatch (via the old shots.sh path).
- **Matrix by default**: 390 / 768 / 1280 px × light / dark (`colorScheme` emulation); `--width 390,1280`, `--theme dark` narrow it.
- **Output** in `<out>/` (default `/home/ubulex/Projects/native-site-editor/.scratch/shots/<owner>/<time>/`): full PNGs `<screen>[-<name>]-<w>-<theme>.png`; webp copies under 40 KB each (encode in Chromium via canvas `toDataURL('image/webp', q)`, stepping quality/size down until it fits — no new npm package); `contact.html` (labelled rows; before/after columns when pairs exist) plus `contact.webp` (the HTML screenshotted, ≤ 300 KB); `index.json` (screens, files, sizes, failures, layout findings).
- Real starter (`~/Projects/native-site-editor-starter`) over fake GitHub on a `port.sh` slot, like shots.sh; one server for the whole matrix.
- A failed screen reports the step that failed; it is retaken at most once.
- Calls `checkLayout(page)` from `layout-check.ts` (stub here) per shot and puts its findings in index.json and the RESULT line.
- Never print image data to stdout: print paths and a short summary only.

## Files

- `scripts/agents/kit.d/shots`
- scripts/agents/shots/ (new folder: scenarios, steps runner, Playwright config, outputs)
- scripts/agents/shots/layout-check.ts (stub returning [] for ticket 07)
- scripts/agents/shots/compare.mjs (stub for ticket 08)
- tests/support/scenarios.ts (new shared helpers)
- `tests/kit-shots.test.ts`

## Done when

- Unit tests: steps parsing, matrix expansion and flags, webp size stepping (pure part), contact sheet HTML for single and paired rows, index.json shape.
- Demo run: `kit shots media-gallery --width 390` produces PNG, webp < 40 KB, contact sheet and index.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
