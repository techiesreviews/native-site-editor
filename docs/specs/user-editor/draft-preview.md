# Real Astro draft preview

Adding, removing or rearranging source in the code panel must update the preview through an actual Astro build. Existing literal-text patches alone cannot render newly inserted elements.

## First delivery

Connect the current editor to an optional draft rendering capability. The demo uses its fixed starter project and preinstalled dependencies in an isolated local build process. This proves the full browser-to-Astro workflow; it does not deploy a compiler to Cloudflare or establish arbitrary repository hosting support.

The editor submits the complete current draft overlay after a short idle period. Mounted source models take precedence over persisted drafts. Undo, Redo, discard and restored drafts use the same path. Files omitted from the overlay come from the immutable project baseline.

Keep the last valid iframe while compiling. A compile error leaves source editable and displays the actual failure. Do not replace the valid frame with incomplete output. While its source no longer matches the draft, prevent visual edits against stale source positions. The newest desired snapshot wins; responses from older edits, routes or project contexts must never replace it.

Code changes invalidate visual editing immediately. An already verified visual text edit may continue through the existing source-mapping and patch path during the idle period, so normal typing is not cut off after one character. Lock that frame when the actual build starts. Moving the caret or receiving diagnostics does not count as a source change and must not trigger a build or iframe reload.

After a successful build, load an immutable revision-specific URL and use its compiled source snapshot as the preview mapping baseline. GitHub originals remain the publication baseline. These baselines must not be confused. New elements must become selectable through the ordinary annotation and visual editing pipeline.

## Capability contract

`GET /api/draft-preview` returns `{ available: true, previewOrigin }` when supported. An unavailable capability preserves the existing committed-preview behavior.

`POST /api/draft-preview` accepts `{ sessionId, repo, branch, baseCommit, files }`, where `files` is an array of `{ path, content }`. Success returns `{ revision, previewUrl, sources }`: a content identity, an absolute build-directory URL and the compiled source snapshot. A build error returns HTTP 422 with an error message; unsupported baselines, oversized input and exhausted capacity have distinct error responses.

The demo accepts only its fixed fixture baseline. It does not install dependencies or accept configuration/package changes. Builds must run without host secrets or network access, with bounded inputs, execution time, output, concurrency and retained artifacts. Failed builds never overwrite successful artifacts. Build paths and static serving must reject traversal and symlinks.

## Acceptance

- Insert a second button through Monaco; both buttons appear in real compiled output and the second can be edited visually.
- Delete and reorder source elements; preview follows their actual order.
- Undo and Redo restore the corresponding output without adding a separate history engine.
- Reload with browser-local drafts; rebuild and recover the current draft.
- Edit page, imported component and stylesheet source; compile the combined snapshot.
- Invalid Astro preserves the last valid frame; fixing the source recovers normally.
- Rapid edits and delayed responses cannot show an older snapshot.
- Builds and source positions remain isolated across project/session contexts.
- Existing text, link, class selector and history behavior remains covered.

## Production GitHub Actions adapter

The production Worker implements the capability through the repository’s existing canonical preview workflow; see [repository preview](../../repository-preview.md#draft-previews). `GET` takes `repo`, `branch` and `baseCommit` query parameters and returns `mode: "github-actions"` when supported. `POST` takes the same repository query context and the request body above, authenticates access and creates an immutable preview branch based on the exact source commit.

The asynchronous response is HTTP 202 with `{ status: "building", revision, previewUrl, revisionUrl, sources }`. `revision` is the draft commit SHA and `sources` contains the verified overlay. Omitted files retain their committed baseline, including when Undo removes an earlier overlay entry. The client polls the revision stamp and adopts only an exact match. An Actions error cannot be read through the current GitHub App permissions; an unconfirmed build times out after ten minutes and directs the user to Actions. The synchronous local fixture contract remains unchanged.

The Worker does not execute repository code. Existing repository Actions build the preview with their existing credentials and configuration. This adapter requires the exact canonical workflow, bounded `src/` overlays and valid preview configuration. It does not implement arbitrary rendering or the later fast-forward Publish design.

## Warm local provider

For local development only, `npm run dev:ui` can expose a warm renderer when `ASE_WARM_PREVIEW_PROJECT` points at a trusted, already installed Git checkout. With the variable unset, Vite does not intercept `/api/draft-preview`, so the normal Worker and GitHub Actions preview path remains available. The provider does not clone, install dependencies, write to GitHub, publish branches or replace the hosted preview workflow.

The provider reads the checkout's GitHub `origin`, named branch and immutable `HEAD`, then serves the capability only when the editor asks for that exact `repo`, `branch` and `baseCommit`. The checkout must be clean for project source: dirty tracked files and untracked source files make the capability unavailable rather than rendering the wrong baseline. Dependency and output directories such as `node_modules`, `dist` and `.astro` are ignored. Symlinks in project source and missing warm-preview config files are rejected before runtime startup.

The Vite middleware intercepts exact `/api/draft-preview` before the generic `/api` proxy only when local warm preview is enabled. `GET` returns `mode: "warm"` and a local `previewOrigin` for a matching baseline. `POST` requires same-origin loopback requests, matching query parameters and matching request body context, enforces bounded request bodies, then calls the warm runtime. Runtime startup and build failures return explicit errors; they do not silently fall back to an older GitHub preview. The provider re-checks the checkout before startup and restarts the runtime if `HEAD` changes. If startup fails, the editor shows a warm preview error; fix the checkout or port conflict and restart `npm run dev:ui`.

The runtime interface is replaceable. The default provider calls:

```ts
createWarmPreviewRuntime({
  projectRoot: trustedCheckout,
  fixtureRoot: trustedCheckout,
  baseline: { repo, branch, baseCommit },
});
```

The runtime returns `{ availability, apply, close }`. `apply` receives the normal draft preview request and returns the normal build success object.

Warm mode uses a 150 ms source-edit debounce. GitHub Actions mode keeps the 10 second debounce. Without a draft-preview capability, committed preview behavior is unchanged.

To run the local warm provider, start the Worker API in one terminal and Vite with the trusted checkout in another:

```sh
npm run dev
ASE_WARM_PREVIEW_PROJECT=/path/to/trusted/astro-checkout npm run dev:ui
```

For supported literal HTML insertions to update in place, also set
`VITE_BROWSER_STRUCTURAL_PREVIEW=1`. Warm rendering alone still replaces the
iframe after a build. The structural preview handles supported literal sibling
headings, paragraphs, buttons and links locally; unsupported Astro/component
changes retain the build fallback.

On 2026-09-23, a focused code-pane paragraph-insertion check failed to update
the existing iframe with the flag disabled and passed with it enabled. The
enabled run measured 93 ms from paste to visible paragraph, zero draft-build
requests, zero iframe navigations, and scrollY unchanged at 120. This is one
local browser sample with intercepted repository APIs, not a remote latency
guarantee. Run the focused regression with:

```sh
VITE_BROWSER_STRUCTURAL_PREVIEW=1 npx playwright test -c playwright.heading-bar.config.ts tests/heading-bar/code-pane-insert-paragraph.spec.ts
```

The browser harness uses a fake GitHub API transport but the actual editor UI, provider middleware and warm Astro renderer. Passing it verifies this local connected-preview path only. It is not authenticated hosted GitHub proof, not a public-user setup decision and not a hosted-cost proof.

The warm renderer currently supports the known static Astro routes it captures from the trusted checkout, including `.astro`, `.md` and `.mdx` pages that the runtime is configured to visit. Draft overlays are limited to `src/` files. Project config, dependencies, environment, integrations and install steps are immutable for a running warm preview. Dynamic routes, arbitrary API endpoints, server-side actions and newly referenced public assets outside captured output need explicit future handling; unsupported paths must fail clearly rather than guessing a rendered baseline. This keeps the fast-rendering proof scoped to the current User Editor preview path instead of promising arbitrary repository hosting.

Public users still need near-zero setup and low owner cost. Browser-side execution with [WebContainers](https://webcontainers.io/guides/introduction) remains a candidate; its [enterprise page](https://webcontainers.io/enterprise) indicates separate commercial production licensing, and terms plus Astro compatibility are unproven here. [Cloudflare Containers](https://developers.cloudflare.com/containers/platform/pricing/) are another candidate, but require the Workers Paid plan minimum plus metered usage. No paid hosted path is selected or enabled by this local proof.

## Local verification

Run the integrated warm-preview browser checks with:

```sh
npx playwright test -c playwright.warm-preview.config.ts
```

This starts two local test editors, with browser structural preview disabled and
enabled. Both use real Astro rendering and isolated Vite dependency caches.
The test captures publication requests without publishing to GitHub. Timing
samples and failure traces are written under `.scratch/warm-preview/`.

Controller tests run with `npx tsx --test tests/draft-preview.test.ts`. Warm provider tests run with `npx tsx --test tests/warm-preview-provider.test.ts`. Provider and warm browser harness type coverage runs with:

```sh
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types node,vite/client --strict --skipLibCheck --allowImportingTsExtensions scripts/warm-preview-provider.ts tests/warm-preview-provider.test.ts tests/warm-preview/server.ts
```

The old cold fixture runtime integration is opt-in with `ASTRO_DRAFT_PREVIEW_INTEGRATION=1 npx tsx --test tests/integration/draft-preview-runtime.test.ts`. It requires Linux, Bubblewrap, `prlimit` and the starter fixture's preinstalled dependencies. That runtime restricts overlays to `src/`, clears the build environment, hides the host home directory, disables network access and mounts dependencies read-only. These measures support the fixed-fixture proof; they are not a production multi-tenant security boundary. In particular, the output-size check occurs after compilation, and the temporary project directory does not have an aggregate disk quota.

The warm runtime integration is opt-in with `ASTRO_WARM_PREVIEW_INTEGRATION=1 npx tsx --test tests/integration/warm-preview-runtime.test.ts`. It runs a trusted local Astro dev server from a preinstalled checkout. It is faster and preserves revision snapshots, but it does not provide Bubblewrap isolation or network blocking. A production renderer needs authenticated project access and enforceable per-build resource quotas before accepting arbitrary repository code.

## Class font-size live patch (no spurious rebuild)

Changing a text size that resolves to a class rule (for example a button's
`font-size` in a linked stylesheet) is already applied to the running preview by
the live class-style patch. In an adopted GitHub Actions draft this must not also
trigger a full rebuild: a rebuild dropped the toolbar to read-only and reloaded
the iframe, which the user saw as the preview freezing.

`classFontSizeEditCovered` (in `src/text-style.ts`) decides coverage from the
exact source diff. The active fix covers the Default case where the editor
removes a safe class-rule `font-size` declaration that the live patch has
already replayed, and the exact planned re-addition when a supported size is
selected again. Any other coincident change — another declaration, an
element-selector font-size, markup, a renamed selector, or an invalid value —
leaves an unpatched region and falls back to a full rebuild.
`notifyDraftPreviewSourceIfChanged` compares against the last notified content
(else the clean baseline), so an Undo back to the baseline is covered too.
Coverage is only applied when
`previewPanel.livePatchReady()` reports the draft is idle or ready; in
pending/building/error states the patch is dropped, so the edit rebuilds (and an
error recovers) instead of being silently treated as covered.

Verified by `tests/heading-bar/button-size-draft.spec.ts`: repeated size value
changes, Undo/Redo and a post-reload size edit stay live with no extra
draft-preview POST, while a coincident non-font-size CSS change still drops to a
pending rebuild whose full snapshot carries the change. The exact live draft
regression in `tests/heading-bar/no-bg-freeze.spec.ts` confirms that the
captured page+CSS state and Secondary → Link (`no-bg`) style switch stays a
covered live patch, and that the restored draft Default → size → Link plus
Undo/Redo cycle keeps the iframe and toolbar alive without another draft-preview
POST. Unit coverage is in `tests/text-style.test.ts`.

## Topbar preview status

The topbar preview status mirrors the preview lifecycle without mixing into the
publish/change status. Branch previews show Loading until the iframe sends the
editable `ready` handshake, then Preview ready. A same-revision re-check keeps
Preview ready when the iframe is already loaded and no new handshake will fire.
Draft rebuilds show Waiting during the debounce window, Building while the
request is in flight, Loading after the draft build is adopted but before the
iframe handshake, and Preview failed with Retry only for draft build failures.
Branch preview failures auto-poll and do not show Retry.

Current coverage is in `tests/heading-bar/preview-status.spec.ts`: waiting →
building → ready, held draft iframe handshake, retry recovery, branch failure
without Retry, and same-current-revision re-checks.

### Release evidence (2026-09-23)

- Commit: `fded1e5` (Default font-size live patch, preview status, historical prepared button insertion), built with `VITE_BROWSER_STRUCTURAL_PREVIEW=1`.
- Cloudflare `astro-site-editor` Version ID: `8a19134f-8709-459c-b474-0ced5a4be5d4`.
- Rollback target (previous version): `e7906d1e-06d4-4a9d-83ca-720a10ba5ba4`.
- Bundle `assets/index-BM7dCu-P.js` sha256 `eb3f4daa11e078fc358bf3303fe4cef3e3fad1c443c18f3c5fe7b566fbef5886`;
  `index.html` sha256 `19780e6c660d143d1f04b6c20190698379e57cde61549ffd50dc5a3fcd5110c0`.
- Read-only verification: live `https://astro.techies.tools/` index and hashed JS
  are byte-for-byte identical to `dist/` (HTTP 200). The historical live bundle contains
  `Add another button`, `Preview ready`, `Waiting to rebuild`, `Building preview`,
  and `Preview failed`; the Add-button quick-add control was later removed by user request.
- Verification before deploy: `npm test` passed 142 unit tests; the focused
  browser runs passed 22 checks across preview status, exact no-bg/default
  draft recovery, button size/style draft behavior, browser structural preview,
  and button insertion recovery. `npm run check`, structural types, structural
  overlay, `git diff --check`, and `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run build`
  passed.

### Quick-add removal evidence (2026-09-23)

- Commit: `5b0c2ca` (remove button quick-add functionality), deployed with `VITE_BROWSER_STRUCTURAL_PREVIEW=1`.
- Cloudflare `astro-site-editor` Version ID: `a868d64b-f520-4ab5-8775-b3e37e4317e4`.
- Rollback target (previous version): `8a19134f-8709-459c-b474-0ced5a4be5d4`.
- Bundle `assets/index-DFfWld7W.js` sha256 `e12e70e630c3ea0e21ba98fa07a63ab68a3db7867739eb151375866cfb7792f3`;
  `index.html` sha256 `9826acd94c41e7185aa6b8f58b5a4547e04ad1842cbbb6e33348cb3e10b3dd93`.
- Read-only verification: live `https://astro.techies.tools/` index and hashed JS are byte-for-byte identical to `dist/` (HTTP 200).
- The live bundle contains none of `Add another button`, `Add button`, `applyPreviewAddButton`, `findPreparedButtonSlot`, `onAddButton`, `preview-edit-bar__add-button`, `This slot cannot add a button safely.`, or `The button slot changed. Select the button again.`
- Verification before deploy: `npm run check`, `git diff --check`, `VITE_BROWSER_STRUCTURAL_PREVIEW=1 npm run build`, and 11 focused browser checks passed.
