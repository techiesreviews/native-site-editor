---
title: "kit shots: named screens, every size and theme, small copies and a contact sheet"
type: task (AFK)
status: closed
assignee: ak-06
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

## Done (2026-10-16)

`scripts/agents/kit shots <screen...>` captures the 13 named screens on the real starter over fake GitHub, one `port.sh` slot and one server per run. Default matrix 390/768/1280 x light/dark, narrowed by `--width` and `--theme`; `--steps` runs a JSON or small-YAML steps file from `.scratch/`; `--spec` hands a raw spec in this checkout's `.scratch/` to `shots.sh`. Each shot gets a fresh browser session, so data seeded for one screen (the picture added for image-popup and picker when the starter has none, the unused SVG for cleanup) never leaks into another. A failed screen names its step in index.json and is retaken once. Output: full PNGs, webp copies under 40 KB (Chromium canvas, quality then size), `contact.html` and `contact.webp` (one row per screen, sizes and themes side by side; before/after pairs in their own row), `index.json`. Stdout lists paths and byte sizes only. `layout-check.ts` and `compare.mjs` are stubs for tickets 07 and 08. Shared helpers in `tests/support/scenarios.ts`: `openEditor`, `openMedia`, `openFileDetails`, `pickPicture`, `openImagePicker`, `openFiles`, `openPages`, `openStructure`. `switchSiteMidUpload` is left for ticket 22, which first needs it.

- Commits: 642b13ed (build, Sol), ab21bd9f (review fixes, Claude).
- Tests: `tests/kit-shots.test.ts` (7 tests: steps grammar and unknown step, JSON/YAML files, matrix and flags, webp stepping, contact sheet single/matrix/paired rows, index shape, help and bad-argument runs without a server). `npm run check`, `unit.sh tests/kit-shots.test.ts tests/kit.test.ts` (23 pass), `npm run lint` pass.
- Demo: `kit shots media-gallery --width 390` gave 2 PNGs, webp 13 KB each, contact sheet 13 KB and index.json. All 13 screens at 390 px light: 0 failed, webp 8 to 24 KB, contact.webp 82 KB, 34 s; every screen checked on the contact sheet.
- Review (Sol, saved in the main checkout's `.scratch/reviews/ak-06/review/`): fixed 1 (`--spec` advertised main-checkout specs that `shots.sh` rejects). Rejected 1: "seeded state disappears between screens". A fresh session per shot is intended, so seeded data stays with its screen. Validation-gap ideas (Chromium size test, failure-injection test) were left out: the demo runs prove the sizes; the retake path (a short loop in `capture.spec.ts`) was not exercised by a forced failure, and a browser-backed unit test would slow `unit.sh`. Contact sheet layout was also reworked after looking at the 13-screen sheet (shots were tiny and the sheet was mostly empty space).
