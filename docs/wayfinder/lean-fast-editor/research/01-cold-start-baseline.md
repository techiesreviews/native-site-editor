# 01 · Cold start baseline (2026-10-06)

Ticket: [Measure today's cold start](../tickets/01-measure-cold-start-baseline.md). Measured on `dev` at a46d990.

## The yardstick

`tests/perf/cold-start.ts` (Playwright, Chromium headless, 1440×1000). Each run is a **cold** load (a new browser context: empty HTTP cache, no storage) and then a **warm** load (`page.reload()` in the same context). It prints every run and the medians. How to run it is in the file header; in short:

```sh
npm run build:ui
ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=5293 tsx tests/native-save/server.ts &   # production build + fake GitHub
ASE_COLD_BASE=http://127.0.0.1:5293 tsx tests/perf/cold-start.ts 5                   # unthrottled
ASE_COLD_NET=100/20 ASE_COLD_BASE=http://127.0.0.1:5293 tsx tests/perf/cold-start.ts 5   # 100 ms latency, 20 Mbps
```

`ASE_COLD_JSON=<file>` writes the raw numbers. The local target is the production build (`dist/`) served by the native-save server in dist mode, which compresses (gzip) and applies `public/_headers`, with `/api/*` going through the real `worker/app.ts` handler and a fake GitHub.

Signals, all in ms from the top document's navigation start:

| Signal | Definition |
|---|---|
| session | Response end of the app's first `/api/session` request (Playwright request timing). |
| paint | First preview paint: `first-contentful-paint` inside the preview iframe. The srcdoc frame has an empty body, so its first contentful paint is the runtime's first render of the page. |
| usable | The later of *paint* and the first `[role=tree][aria-label="Page structure"] [role=treeitem]`. The structure tree fills from the runtime's `structure` message (`native-preview.ts:774`), so the runtime is ready and a click in the preview selects and shows the edit bar. |
| monaco | First `.monaco-editor .view-lines` with text: the Monaco chunk has loaded, an editor instance exists and has rendered code. |
| bytes<paint | Sum of encoded (on-the-wire body) sizes of responses that finished before *paint*. |

The default hash is `#repo=501&branch=main&file=index.html` (the fake server's demo repository, built from `fixtures/native-starter`).

## Baseline: local, fake GitHub, production build (5 runs, medians)

| Profile | Load | session | paint | usable | monaco | bytes<paint | requests<paint |
|---|---|---|---|---|---|---|---|
| unthrottled | cold | 157 | 459 | 459 | 717 | 1404 KB | 18 |
| unthrottled | warm | 67 | 185 | 185 | 279 | 15 KB | 18 |
| 100 ms / 20 Mbps | cold | 568 | 1719 | 1719 | **1475** | 1419 KB | 26 |
| 100 ms / 20 Mbps | warm | 339 | 1219 | 1219 | **996** | 15 KB | 29 |

Spread is small: throttled cold paint ranged 1714-1757 ms, unthrottled 423-754 ms (one outlier).

Top bytes before first preview paint (cold, identical across runs and profiles):

| Resource | Encoded |
|---|---|
| `assets/editor.api.js` (Monaco) | 659 KB |
| `assets/index.js` (main chunk) | 333 KB |
| `assets/code-editor.js` (Monaco contributions + our editor) | 300 KB |
| `native-preview-runtime.js` | 38 KB |
| `assets/index.css` | 32 KB |
| `assets/code-editor.css` + `assets/editor.css` | 25 KB |
| `assets/lspLanguageFeatures.js` | 7 KB |

Monaco and the code editor are about **990 KB of the 1404 KB (70%)** fetched before the preview paints. Total cold transfer by Monaco ready is 1556 KB.

## Remote: preview-editor.techies.tools

**Signed-in numbers are not recorded.** Signing in needs GitHub OAuth in a browser, and no saved session (storage state) exists on this machine; the agent did not use Lex's credentials. Lex can produce the state once and run the same script:

```sh
# 1. Sign in by hand, open the starter, then close the window (writes cookies to the file):
npx playwright codegen --save-storage=.scratch/preview-editor-state.json https://preview-editor.techies.tools
# 2. Note the repository id in the address bar (#repo=<id>&...), then:
ASE_COLD_BASE=https://preview-editor.techies.tools \
ASE_COLD_STORAGE=.scratch/preview-editor-state.json \
ASE_COLD_HASH='#repo=<id>&branch=main&file=index.html' \
ASE_COLD_JSON=.scratch/cold-remote.json \
tsx tests/perf/cold-start.ts 5
```

The session lasts at most 8 hours (the GitHub token's lifetime), so make the state just before a run. `.scratch/` is git-ignored.

**Signed out** (what the script measures without a storage state; 5 runs, real network from the agent's machine, colo AMS/LHR):

| Load | session | bytes | requests |
|---|---|---|---|
| cold | 559 (333-840) | 372 KB | 4 |
| warm | 133 | 3 KB | 4 |

The 372 KB is `assets/index.js` 332 KB + `assets/index.css` 38 KB (Cloudflare serves zstd here, so it is a little smaller than the local gzip). The cold session time includes DNS, TLS, `index.html` and downloading and running the main chunk, because `/api/session` is requested from the main chunk.

## Worker and cold isolates

A cold isolate can't be forced from outside without a deploy (not allowed here), so there is no clean cold-isolate number. What curl shows (12 requests each, time after the TLS handshake to the first byte, so network round trip plus Worker time):

| Route | median | min | max |
|---|---|---|---|
| `/` (static asset) | 40 ms | 29 | 75 |
| `/api/does-not-exist` (Worker, no storage) | 30 ms | 21 | 245 |
| `/api/session` signed out | 55 ms | 29 | 178 |

The occasional 180-250 ms outliers are the likely cold isolate or cold Durable Object cost. The first browser cold run's session (840 ms) also sits well above the others. A clean measure needs a fresh deploy to `preview` and an immediate request, which belongs with the build slices.

## Surprises

1. **Monaco beats the preview.** On the throttled profile Monaco is ready about 250 ms *before* the preview paints (1475 vs 1719 cold, 996 vs 1219 warm). The two `loadEditorModule()` prefetches (`main.ts:8549`, `:9246`) put 960 KB of Monaco on the wire ahead of the reads the preview needs. That matches ticket 06, and here it is measured.
2. **Warm is not cheap on a real network.** Warm transfers only 15 KB, but the warm paint is still 1219 ms at 100 ms latency, because every asset is revalidated (local `no-cache`; production sends `public, max-age=0, must-revalidate` on assets). Around 29 revalidation round trips. The `immutable` rule from ticket 06 should cut most of that.
3. **Signed-out `/api/session` still reaches a Durable Object.** On a self-hosted (owner-setup) editor such as preview, `configuredApp()` (`worker/owner-setup.ts:97`) fetches the App config from one global Durable Object on every `/api/session`, signed in or not. That is about 25 ms warm (55 vs 30 ms) and probably part of the cold outliers. It could be cached in the isolate.
4. "Usable" comes no later than paint: the structure tree fills within a frame of the first paint, so in practice paint is the boot milestone that matters.

## Caveats

- Local times are on one fast machine (no CPU throttling). Use them to compare runs against each other, not as what users see.
- CDP throttling covers the page and its iframe, not Monaco's web workers. Their script fetches are not in the byte table above.
- The fake server runs the Worker handler in Node with an in-memory session store, so the local `session` time includes no Durable Object or GitHub latency.
