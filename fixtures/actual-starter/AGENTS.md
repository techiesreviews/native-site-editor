# Agent notes

This repository is a static website. The repository root is the site root, there is no build, and every file runs as it is. Keep it that way: no bundler, no `package.json`, no generated files. Check changes by serving the root (`python3 -m http.server`, then http://localhost:8000/) and looking at the page.

When editing through Native Site Editor's MCP server, the editor applies the same layout; read its `native-site://conventions` resource too.

## Layout

```
index.html                           /
about/index.html                     /about/
work/<slug>/index.html               /work/<slug>/
404.html                             the not-found page (Cloudflare serves it for unknown paths)
styles/site.css                      shared styles; @imports tokens, elements, layout, sections, utilities
components/components.js             the component loader
components/<tag>/<tag>.html          a component's template
components/<tag>/<tag>.css           its styles (optional)
images/                              images
robots.txt                           served as is
_redirects                           optional: `/old/ /new/ 301` lines (the editor writes it when a page moves)
.editor/config.json                  editor-only: { "site": { "name", "url" } }; the site never loads it
```

- Every `.html` file is a page, except under `components/` and files or folders whose name starts with `.` or `_`. `a/b/index.html` is `/a/b/`; any other `x.html` is `/x.html`. Prefer folders with `index.html`.
- Links and asset paths are root links: `href="/about/"`, `href="/about/#contact"`, `src="/images/studio-desk.svg"`. A section on the same page is `href="#work"`. They work on any host at a domain root and through any local server, not from `file://`.
- Images live in `images/` and are referenced as `/images/<file>`.

## Pages

Every page is a full document. Copy an existing page and change its head and `<main>`:

```html
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>About · Larkspur Studio</title>
  <meta name="description" content="One sentence about this page.">
  <link rel="canonical" href="https://native-site-editor-starter-test.lexvd.workers.dev/about/">
  …favicon, theme-color and Open Graph tags as on the other pages…
  <link rel="stylesheet" href="/styles/site.css">
  <script type="module" src="/components/components.js"></script>
</head>
<body>
  <site-header></site-header>
  <main class="page" id="main">
    …sections…
  </main>
  <site-footer></site-footer>
</body>
</html>
```

- The `<title>` is the page title followed by ` · Larkspur Studio`; `og:title` repeats it. `<meta name="description">` and `og:description` match. `canonical` and `og:url` are the site URL plus the page's path; `404.html` has neither. The site is kept out of search results (`<meta name="robots" content="noindex">` on every page) because this is a test domain.
- JSON-LD (the organization and the website) is on the home page only.
- `<main>` keeps `id="main"`: the header's "Skip to content" link points there.
- Sections written straight into a page are `<section>` elements with shared classes: `hero flow`, `prose flow`, `contact flow` (see `styles/sections.css`).

To add a page at `/services/`: create `services/index.html` from a copy of `about/index.html`, change the title, description, canonical, `og:*` URL and text, then link to it (for the main navigation, edit `components/site-header/site-header.html` and `site-footer.html`; every page picks it up).

## Components

A component is a custom element: a template `components/<tag>/<tag>.html` (shadow DOM markup with `<slot name="…">` for what a page fills) and a stylesheet beside it. Tags are lowercase with a dash and named *part*-*name*: `section-` for page sections, `card-` for cards, `site-` for the header and footer. A page uses one as a tag and fills its slots with whole elements:

```html
<section-hero>
  <p slot="eyebrow" class="eyebrow">Larkspur Studio</p>
  <h1 slot="title">A short, clear headline.</h1>
  <p slot="lead" class="lead">Who this is for and what they get.</p>
  <a slot="primary" href="/about/#contact">Get in touch</a>
</section-hero>
```

### The loader

`components/components.js` is a dependency-free ES module every page loads. There is no list of tags: it looks for custom elements that are not defined yet (tags with a dash) in the page as it loads, in whatever other scripts add later, and in each template it renders, so components can use components. For each new tag it fetches `components/<tag>/<tag>.html` and its `.css` (optional: a missing one means no styles) once and defines the element. Each instance gets an open shadow root with, in order:

1. the page's stylesheets (every `<link rel="stylesheet">` in `<head>`), so tokens and shared rules apply inside components;
2. the component's CSS in a `<style>`, with a `::slotted()` twin added to each selector: `h1 { … }` becomes `h1, ::slotted(h1) { … }` and `.actions a` also `.actions ::slotted(a)`. So write component CSS **without** `::slotted()`; one rule styles the template's fallback and the page's slotted element alike. `:host` rules and selectors that already use `::slotted()` are left as they are;
3. the template.

It also:

- hides optional parts: in a section component (template is one `<section>`) that the page fills at all, a slot the page does not fill is hidden with its fallback, while a bare tag shows every fallback. `data-if="a b"` on an element shows it only when the page fills every named slot. An element that holds slots, has no text of its own and whose slots all show nothing is hidden too (an empty button row, `card-project`'s link paragraph). It recomputes on `slotchange`;
- sets `aria-current="page"` on links in the shadow root that point at the current page (the header's nav styles it); links with a `#` are left out, so the nav's Work link (`/#work`) is not marked;
- scrolls again to the target of a link like `/#work` once the page's components have loaded (the browser's own scroll happens before they grow), unless the reader has scrolled.

Until a component is defined, `styles/site.css` hides it (`:not(:defined):not([data-unloaded])` under `@media (scripting: enabled)`; `:not(:defined)` only ever matches custom elements), so there is no flash of unstyled content and nothing is hidden with JS off. If a tag's template cannot be fetched, the loader logs one warning, marks that tag's elements `data-unloaded` so they show their own content unstyled, and leaves the tag undefined: a site script may define it instead.

### Writing a component

- Each editable part of a section is one slot wrapping one whole element: `<slot name="title"><h2>Headline</h2></slot>`, not `<h2><slot name="title">…</slot></h2>`. Put classes on the fallback element (`<p class="lead">`) so a copy in a page keeps them.
- A `section-` template is exactly one `<section>` with nothing before or after it; only those are offered by the editor's "Add to the page".
- Styles are scoped to the shadow root: use element selectors (`article`, `nav a`) and a short class only to tell same-tag siblings apart. Use tokens (`var(--space-l)`, `var(--text-2xl)`, `var(--accent)`).
- Shared styles are in cascade layers; component CSS is not, so any component rule beats any shared rule. Shared rules that size elements use `:not([slot])` (see `styles/elements.css`) so a heading slotted into a component is sized by the component.
- Components can use other components (`card-project` uses `card-note`, and passes its `note` slot on with `<slot name="note" slot="text">`). A component styles what a page slots in with a rule on the slotted element; text that is passed through another component's slot is reached only by inheritance, so `card-note` sets its type on `:host`.

To add a component `card-quote`: create `components/card-quote/card-quote.html` and `card-quote.css`, then use `<card-quote>` in a page. That is all; the loader finds it.

## Styles

`styles/site.css` sets the layer order and imports, in order: `tokens.css` (custom properties), `elements.css` (plain elements), `layout.css` (`.page`, `.flow`, `.cards`), `sections.css` (page sections: `.hero`, `.lead`, `.cta`, `.steps`, `.contact`), `utilities.css` (`.text-s` … `.text-4xl`, which the editor's Text size writes). A new shared file is imported from `site.css`. Elements have no margins: text blocks take `flow`, components use `gap`.

## Adding a blog

1. `blog/index.html`: a copy of `about/index.html` with a hero section and a list of posts, for example `<div class="cards">` of `<card-project>`s, each with `<p slot="note">` (date), `<h3 slot="title">`, `<p slot="body" class="body">` and `<a slot="link" href="/blog/<slug>/">Read</a>`, as in the home page's `#work` section.
2. `blog/<slug>/index.html` per post: a copy of `work/fern-and-kettle/index.html`, with the post in `<section class="prose flow">`. Set its title, description, canonical and `og:*` URL.
3. Add `<a href="/blog/">Blog</a>` to the nav in `components/site-header/site-header.html` (and the footer), which updates every page.

## Do not

- Add a build step, dependencies or generated output.
- Use hash routes (`#/about/`) or relative asset paths (`images/x.svg`); use root links.
- Add `::slotted()` twins by hand; the loader adds them.
- Put site files in `.editor/`, or editor settings anywhere else.
