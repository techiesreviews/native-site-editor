# Browser-native preview

The editor's preview renders a site entirely in the browser from its own
files, with no build and no server round trip per edit. The repository is the
site (see `docs/adr/0001-the-repository-is-the-site.md`):

- a repository with `index.html` at its root is a native site;
- pages are its `.html` files (`index.html` is `/`, `about/index.html` is
  `/about/`, `notes.html` is `/notes.html`), except under `components/`,
  `node_modules/` and names starting with `.` or `_` (`shared/native-routes.ts`);
- each page is a full document: the preview renders its `<body>`, and its
  shared styles are the stylesheets its `<head>` links, with their `@import`s
  (`shared/native-project.ts`, `shared/css-imports.ts`);
- components are `components/<tag>/<tag>.html` (or `components/<tag>.html`)
  with a sibling `.css`, rendered in shadow DOM the way the site's own loader
  renders them.

The runtime is `public/native-preview-runtime.js`; the host side is
`src/components/native-preview.ts`.

## Supported

- A persistent sandboxed preview iframe (`sandbox="allow-scripts"`, never
  same-origin). Its `srcdoc` runtime is set once and never navigated.
- Sources loaded from the current snapshot and overlaid with saved and mounted
  (unsaved) browser drafts, so edits appear before they are saved; every
  keystroke patches the live DOM through `postMessage`.
- A component template edit updates every instance; CSS edits update in place;
  scroll position is preserved across edits.
- Ctrl/⌘+click on a root or relative link to one of the site's pages
  (including links inside component shadow roots) shows that page, keeping
  in-progress edits. Root-path images and CSS `url()`s show from the
  repository's files.
- Click-to-select, the edit bar, the page structure, inserting and moving
  sections: element-child indexes count from the page's `<body>`
  (`src/native-source-location.ts`).

## Not supported

- No page JavaScript. `<script>`, `on*` handlers, `javascript:` URLs and
  `<meta http-equiv="refresh">` are stripped before render; the site's own
  `components/components.js` does not run in the preview.
- Browser Back/Forward across preview pages: link clicks switch the page in
  place without history entries, since the editor owns the page URL hash.

## Focused tests

- `tests/native-preview/native-preview.spec.ts` drives the real app end to end
  over `fixtures/native-starter`.
- `tests/native-preview/native-cascade.spec.ts` checks the style panel's
  cascade against the small sites under `fixtures/cascade/` (no layers, layers
  up front, layers by first use, `@import` with `layer()`, shadow DOM, the
  starter's footer link), each served as its own repository.

Run them with `npm run test:browser-preview`; the config boots its own copy of
`tests/native-save/server.ts`.
