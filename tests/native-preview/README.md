# Browser-native preview integration

An opt-in preview mode that renders a project entirely in the browser from plain
source files, with no Astro build and no server round trip per edit. It reuses
the existing editor: the same explorer, Monaco code editor, scoped browser
drafts, and Undo/Redo. There is no separate demo editor.

## Opting in

A project opts in with a validated, versioned manifest at
`.astro-editor/native.json`:

```json
{
  "version": 1,
  "routes": { "/about/": { "title": "About" } },
  "components": { "site-header": "src/components/site-header/site-header.html" },
  "styles": ["src/styles/site.css"]
}
```

- Pages are routed by where they are: every `.html` file under `src/pages/` is
  a page (`index.html` is `/`, `about.html` and `about/index.html` are
  `/about/`; names starting with `_` are skipped; see
  `shared/native-routes.ts`). A `/` home page is required.
- `routes` is optional metadata keyed by route (`title`, `description`,
  `jsonLd`). An entry with `file`, or the bare path
  (`"/about/": "src/pages/about.html"`), maps its route to that file
  explicitly.
- `components` maps a custom-element tag (must contain a dash) to a
  `src/components/*.html` template. Templates use native shadow DOM `<slot>`s.
- `styles` lists shared `src/styles/*.css` files. They may `@import` other
  repository stylesheets (with `layer`, `supports()` and media), which need
  not be listed; see `shared/css-imports.ts`.

Validation lives in `src/native-manifest.ts`; the preview runtime and panel live
in `src/components/native-preview.ts`. When a valid manifest is present the
editor bypasses the Astro branch/draft-preview path entirely; a project without
one is unchanged.

## Supported in this slice

- Persistent sandboxed preview iframe (`sandbox="allow-scripts"`, never
  same-origin). Its `srcdoc` runtime is set once and never navigated.
- Sources loaded from the current snapshot and overlaid with saved **and**
  mounted (unsaved) browser drafts, so edits appear before they are saved.
- Every keystroke patches the live DOM through `postMessage`, coalesced with
  `requestAnimationFrame`. No Astro build, no `/api/draft-preview` request.
- A component template edit updates every instance; CSS edits update in place;
  scroll position is preserved across edits.
- Hash-based route links (including links inside component shadow roots) switch
  the previewed route while preserving in-progress source edits.
- Scoped browser drafts and Undo/Redo work exactly as on the Astro path and
  survive a full reload.

## Deferred / not supported

- No arbitrary page JavaScript. `<script>`, `on*` handlers, `javascript:` URLs,
  and `<meta http-equiv="refresh">` are stripped before render. This is a
  prototype guard, not a general-purpose sanitizer.
- No source-position mapping, therefore **no** visual click-to-source editing,
  edit bar, linked-CSS rule navigation, heading/text-size/button-style tools, or
  structural drag. Those Astro affordances are hidden in native mode; edits flow
  only from the code editor into the preview.
- No publishing, GitHub writes, live-agent collaboration, or production routing.
- **Browser Back/Forward across preview routes is deferred.** Preview link clicks
  switch the route in place via `postMessage`, but do not push browser history
  entries. The editor already owns the page URL hash (`#repo=…&branch=…&file=…`)
  for workspace navigation, so wiring native route history without clobbering
  that hash is out of scope for this slice. (The throwaway prototype used
  `location.hash` inside its own standalone page, where no editor hash existed.)

## Testing against the running tunnel via the repo selector

The demo warm-preview server exposes a second sample repository,
`lex/native-starter` (id `77`), alongside the existing `lex/heading-starter`
(id `42`). Both use the same mock login. In the running editor (local dev server
or the protected tunnel gateway), open **Pages & files → repository** and choose
**native-starter** — or deep-link with the hash
`#repo=77&branch=main&file=src/pages/index.html`. The sample ships reusable
`project-card` cards, shared `site-header`/`site-footer`, Home and About routes,
and enough filler content to verify scrolling. Selecting `heading-starter`
returns to the ordinary Astro preview path.

## Focused tests

- `tests/native-manifest.test.ts` — manifest validation (`npm test`, or
  `npx tsx --test tests/native-manifest.test.ts`).
- `tests/native-preview/native-cascade.spec.ts` — the style panel's cascade
  against the small sites under `fixtures/cascade/` (no layers, layers up
  front, layers by first use, `@import` with `layer()`, shadow DOM, the
  starter's footer link), each served as its own repository.
- `tests/native-preview/native-preview.spec.ts` — drives the real app end to end
  (`npx playwright test -c playwright.native-preview.config.ts`). The config
  boots its own copy of `tests/warm-preview/server.ts` on port 5196, so it does
  not disturb the systemd demo instance on 5190.
