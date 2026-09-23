# Browser structural preview proof

This local experiment asks whether literal structural edits can update the existing editor preview without a new Astro build or iframe navigation, while keeping visual edits tied to exact current source positions.

## Isolation and baseline

The proof lives on `prototype/browser-structural-preview`, in a separate worktree based on `73c51c9` (production structural-preview fix `30cbfd9` plus its evidence). This deliberately retains the deployed GitHub Actions fallback. It is not based on the older recorded `origin/main`, and does not include the separate warm-Astro experiment at `441d917` or uncommitted work in the original checkout.

The original checkout and other worktrees are preserved. Local dependencies are symlinked from the original checkout; these symlinks are not part of the proof. No deployment, public tunnel, paid service, or live repository write is part of this experiment.

Baseline validation before changes: `npm run check` passed; `npm test` passed all 96 tests.

## Correctness requirements

- Use the actual editor, an initially compiled Astro fixture, and its annotation overlay.
- Support adding, deleting, and rearranging a narrowly defined set of literal headings, paragraphs, buttons, and links.
- Update rendered content and exact source mappings together. Do not enable visual edits against guessed or stale offsets.
- Preserve other content. Unsupported syntax, ambiguous rendering, and invalid code retain the full-build path and its read-only guard.
- Exercise the newly duplicated button's label and destination, the original button, and later heading and paragraph controls.
- Preserve source history and publication baselines. A browser projection does not establish that arbitrary Astro source builds successfully.
- Measure source-to-visible-and-editable latency, and distinguish local browser evidence from hosted performance.

## Implementation and scope

`VITE_BROWSER_STRUCTURAL_PREVIEW=1` opts this worktree into the experiment. The normal build leaves the feature disabled. The fixture annotation overlay contains the experimental transaction handler. The production integration bundle was subsequently regenerated for the deployment recorded below.

The source planner accepts a single contiguous sibling region containing literal `h1`–`h6`, `p`, `button`, and `a` elements. It checks unchanged source before and after the region and rejects nonliteral content within it. Attribute support is deliberately narrow: literal `class`, `href`, `type`, `title`, and `aria-label`. Unsupported attributes, expressions, imports, component changes, mixed markup, and moves between source parents use the existing build path. The trusted fixture's unchanged `Layout` wrapper and opaque self-closing components are accommodated; this is not a general Astro renderer.

The iframe verifies source locations, DOM parentage, element content and attributes, and scope attributes before replacing the affected region. Other DOM subtrees retain their identity. It shifts later annotation ranges and returns fresh inventories to the editor. The editor keeps the committed publication baseline separate from the projected mapping baseline. Rejected, missing, or stale acknowledgments must preserve the read-only guard and use the full-build path when available.

## Run locally

From this worktree, with editor and fixture dependencies installed:

```sh
npm run test:browser-structural-preview
```

The command starts an opt-in Vite server on loopback port 5181 and runs the actual editor against a compiled local fixture with intercepted repository APIs. Initial fixture compilation is required; supported edits are then projected in the browser. Publication requests are captured by the test harness and cannot write to GitHub. The command closes its server when the tests finish.

Further checks:

```sh
npm run check
npm run test:browser-structural-types
npm test
npm run test:browser-structural-overlay
npm run build:ui
```

## Verification notes

The opt-in proof has separate browser configuration so ordinary heading-bar tests do not accidentally enable or collect it. A reproducible isolated overlay check runs with `npm run test:browser-structural-overlay`; it exercises whitespace fidelity, insertion at a successor's old source location, and correct, stale, invalidated, and empty commit acknowledgments.

The default UI production bundle builds successfully. `npm run check` and the 109-test unit suite pass.

The existing editor regression selection passes 15 of 17 tests. Two `format-continuity.spec.ts` cases fail while waiting for the “Building draft preview” status: the unsupported expression case at line 123 and structural code edit case at line 148. Both failures were independently reproduced on the untouched `73c51c9` baseline in `/tmp/astro-browser-proof-baseline-20260922`. They are recorded rather than counted as successful regression checks. This does not diagnose their cause; the new proof's explicit invalid-source and full-build recovery scenarios are separate evidence.

## Acceptance results

The final complete browser run passed all **6 scenarios in 41.8 seconds**. It covered duplicate link/button edits and downstream edit-bar source mappings; rapid source changes; adding, moving, and deleting each supported heading, paragraph, and native button; Undo/Redo and a held stale acknowledgment; unsupported component edits; and invalid-source recovery through a real Astro build. Supported structural edits preserved the iframe and made no draft-build POST requests. Captured publication source and independently compiled output were also checked.

Nine supported updates measured **89–301 ms**, with a **104 ms median**, in the final run. Measurement starts after focusing the code pane, includes Monaco source replacement and test-driver overhead, and ends only after a fresh acknowledgment, the expected visible content, and the removal of the read-only guard. It excludes initial fixture compilation and page startup. This is a small local sample, not a hosted performance guarantee. Exact samples and check results are saved in [browser-structural-preview-results.json](browser-structural-preview-results.json).

`npm run test:browser-structural-types` and the isolated Chromium overlay checks also pass. The UI build reports its existing large-chunk warning. Shared dependency symlinks cause a Vite font allow-list warning during browser tests; the assertions do not depend on that font.

The proof meets the narrow browser-only objective without paid infrastructure. The feature remains opt-in at build time. The release below enables it; broader validation against real project templates remains necessary. Unsupported changes continue through the existing Astro build fallback; when that capability is unavailable, visual editing stays blocked instead of accepting uncertain mappings.


## Deployment — 2026-09-22

At the user’s explicit deployment request, the editor was deployed to https://astro.techies.tools from source commit `1562957` on `prototype/browser-structural-preview`. No source branch was pushed or merged. The original dirty checkout remains preserved. No paid infrastructure was added.

- Release build: `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run build:ui`, then `npx wrangler deploy`. Future releases must retain the build-time flag to keep this feature enabled.
- Cloudflare version: `c2065b37-e417-49a0-a5da-47b7d08dd246` (100%).
- Previous version for rollback: `d7f95b4e-1768-4472-9363-2605755919ef`.
- `worker/integration-files.ts` was regenerated from all five fixture integration files; their contents match and previous official annotation hashes are retained.
- Release checks: TypeScript and 109 unit tests passed again after packaging; UI build and Wrangler dry-run passed. The earlier six passing browser scenarios remain the functional evidence.
- Live verification through the existing browser tab returned HTTP 200 for the page and `/assets/index-BbQ2FLEU.js`. Its SHA-256, `96b4fea9281d1a8d0ada4e8dfc6e0bdb01519eb1df69de8230dd002a96352548`, exactly matches the local release bundle, which contains the structural runtime. A direct Python HTTP probe returned 403; browser verification succeeded.

The connected GitHub session returned 401, so authenticated repository updates and live edit-bar interactions were not verified. The starter repository was not changed and its draft was not published. After reconnecting GitHub, use **Prepare integration update**, review and merge the managed integration update, and let the preview rebuild. Existing previews with the older overlay retain the full-build fallback after the structural acknowledgment timeout; the fast browser path requires the new overlay.

## Connected starter integration update — 2026-09-22

The user subsequently authorized automatically applying the needed site integration changes. After sign-in recovered, the deployed integration endpoint created `astro-editor/update-integration-e61d26ba76fe` at `08ae047ee767105269723c893e05676f2aa6f4a6`. Review of the GitHub comparison confirmed that only `.astro-editor/annotate.mjs` changed and its bytes exactly matched the tested fixture. The branch was merged through the GitHub merge API into starter `main`, resulting in `46bfa9881990c727c04322d5c5e051313decd660`. No page source was changed or browser draft published.

[GitHub Actions run 35778446518](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35778446518) completed successfully, including annotated preview upload and the repository's normal live-site build/deploy. The main preview revision endpoint reports `46bfa9881990c727c04322d5c5e051313decd660`; its served `/_astro/page.cR1dmXJv.js` returns 200 and contains both `structural-preview-result` and `structural-preview-commit`. The editor integration API now reports `current`. This verifies the update is delivered; the existing local browser suite remains the edit-operation correctness evidence.
