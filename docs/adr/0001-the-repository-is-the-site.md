# ADR 0001: The repository is the site

- Status: accepted 2026-09-26, with Lex's decisions (below). Being built.
- Decides: repository layout, how the editor previews and edits a site, how components work in the starter, what agents and content editors get.
- Replaces: the `src/pages` layout, `#/` routes, the page metadata comment, the legacy manifest and the static export. Nobody else uses the old layout, so it is removed rather than converted.

## Context

Until now a native site was source that only the editor and the exporter understood. Pages were fragments in `src/pages/`, components were templates in `src/components/` that the editor's preview runtime (`public/native-preview-runtime.js`) turned into shadow DOM, links were `#/route/` hashes, page details sat in a leading comment, and publishing meant running `native-export.mjs`, a build. A repository downloaded from GitHub did not run anywhere.

The goal is the opposite: the repository is the site. Any plain static host serves it as it is, and the editor opens it as it is.

## Goals

Four cases, all served by the same repository:

1. **Native, no build.** HTML, CSS and browser JavaScript that run on any static HTTP server (a host, Cloudflare Pages, Vercel, an FTP host, `python3 -m http.server`). No `npm run build`, no Node or PHP server, no dependencies to install.
2. **Developer experience.** The code panes show the real, ready-to-run files. A component is defined once (structure, CSS) and every page that uses it updates.
3. **Agents.** With the editor open, an agent works through MCP on the user's drafts. Without it, an agent edits the repository directly (add a page, add a blog) and the result still runs and still opens in the editor.
4. **Content editors.** A marketeer builds pages visually: edits text (bold, italic, links), images and buttons, adds, moves and removes pre-made sections, fills optional fields.

## Constraints

- **Nothing to set up, nothing running on our side to preview.** A user opens the editor and the site shows. The preview stays inside the editor tab.
- **Assume nothing, eventually.** The editor should adapt to however a repository builds its components; conventions only make things easier. For now the editor supports the starter's conventions (below) and we pivot when needed.
- **What you edit is what ships.** The editor writes files that run as they are. It adds nothing to the site that the site does not carry itself.

## Decisions (Lex, 2026-09-26)

1. No conversion of existing sites; the old layout, its manifest and the export are removed.
2. The preview is the one we have (sandboxed `srcdoc` iframe plus `native-preview-runtime.js`). No preview origin, no service worker, nothing hosted per site. It renders pages and components the way the starter's loader does on the live site; it does not run the site's own scripts.
3. The starter's components are made now from the components the starter has, the simplest way; no spike.
4. Source mapping is fixed as it comes up.
5. Everyone who opens the editor gets every role for now.
6. Later, optionally: writing declarative shadow DOM into pages so visitors without JS see component content.

## 1. Repository layout

The repository root is the site root. URLs are file paths:

```
index.html                         /
about/index.html                   /about/
work/fern-and-kettle/index.html    /work/fern-and-kettle/
404.html                           the not-found page
styles/site.css                    shared styles; @import the rest
components/components.js           the component loader (native ES module)
components/<tag>/<tag>.html        a component's template
components/<tag>/<tag>.css         its styles
images/                            images
_redirects                         optional (Cloudflare Pages, Netlify)
.editor/config.json                optional, editor-only
README.md, AGENTS.md
```

- **Pages.** Every `.html` file is a page, except under `components/`, `node_modules/`, and any folder or file whose name starts with `.` or `_`. `index.html` is `/`, `a/b/index.html` is `/a/b/`, any other `x.html` is `/x.html`. `404.html` at the root is the not-found page.
- **Pages are full documents**: `<!doctype html>`, `<html lang>`, a `<head>` with `<title>`, `<meta name="description">`, Open Graph tags, the favicon, `<link rel="stylesheet" href="/styles/site.css">` and `<script type="module" src="/components/components.js"></script>`, and a `<body>` with the page.
- **Links and asset paths are root links** (`/about/`, `/images/hero.svg`). They work on any host at a domain root and locally through any static server; not from `file://` or a subfolder.
- **`.editor/config.json`** holds editor-only settings: `{ "site": { "name": "…", "url": "https://…" } }` for now. Nothing the site loads is in `.editor/`.

## 2. Components (the starter's convention)

A component is a custom element whose template is `components/<tag>/<tag>.html` (or `components/<tag>.html`) with a sibling `.css`. The template is shadow DOM markup with `<slot name="…">` for what a page fills. A page uses it as a tag and fills slots with whole elements:

```html
<section-hero>
  <h1 slot="title">A short, clear headline.</h1>
  <p slot="lead" class="lead">Who this is for and what they get.</p>
  <a slot="primary" href="/about/#contact">Get in touch</a>
</section-hero>
```

**`components/components.js`**, the site's own loader, a short dependency-free ES module every page loads. For each component it lists, it fetches the template and stylesheet once and defines the element. Each instance gets an open shadow root with:

- the document's own stylesheets (every `<link rel="stylesheet">` in the page head, in order), then the component's stylesheet, the order the preview adopts them in;
- the component's CSS with each selector's `::slotted()` twin added (the same rules as `shared/slotted-css.ts`), so component CSS is written without `::slotted()`: `h1 { … }` styles both the template's fallback and the page's `<h1 slot="title">`;
- the template;
- optional slots: a slot the page does not fill is hidden with its fallback, unless the instance fills no slot at all; `data-if="a b"` shows an element only when the page fills every named slot; a wrapper whose slots are all hidden is hidden too (the rules the preview runtime applies today);
- `aria-current="page"` on links in the shadow root that point at the current page.

While components load, `site.css` hides undefined components under `@media (scripting: enabled)`, so there is no flash of unstyled content and nothing is hidden when JS is off.

Header and footer are components without slots. A component change is one or two files and every page shows it on the next load.

The preview does what the loader does, from the drafts, so the preview and the live site match.

## 3. Preview

The current preview, adapted to full documents:

- It renders the `<body>` of the page on show. Scripts, inline handlers and `javascript:` URLs are still stripped; components are rendered by the runtime as the loader would.
- The shared stylesheets are the ones the page's `<head>` links (`<link rel="stylesheet" href>`, resolved against the page URL to repository paths), with `@import`s expanded as today.
- Root links to a page navigate the preview (Ctrl/⌘+click); images and CSS `url()`s resolve from root paths to repository files.
- Clicks map to the page file (inside `<body>`) or the component template, as today.

## 4. Editing

- **Text, formatting, images, links, sections** (insert, move, duplicate, remove) as today, inside the page's `<body>`.
- **Page details**: title and description edit `<title>` and `<meta name="description">` in the page's `<head>` (and `og:title`/`og:description` when present).
- **Create page**: `<path>/index.html`, a copy of the home page's document with the new title, the description cleared and `<main>` emptied (the header and footer stay).
- **Change URL / move / delete**: moves the file (a folder page moves with its subpages), rewrites root links to it in every HTML and CSS file, and adds `/old/ /new/ 301` to `_redirects`.
- **Site settings** in `.editor/config.json`.
- **Download site** zips the repository's files as they are, drafts included.

## 5. Roles

Everyone gets everything for now. A Content role (page builder only) comes later.

## 6. Agents

- **MCP**: the existing tools work on the new layout: `get_site` reports pages, components, their slots and the stylesheets; `create_page`, `set_page_details`, `add_section`, `move_section`, `remove_section` and `move_file` do what the editor does in section 4. The conventions resource describes this layout.
- **Directly**: the starter's `AGENTS.md` explains the layout, the loader and how to add a page, a component or a blog.

## 7. Publishing

Saving stays a batch commit to GitHub. Deploying is the host's "connect a repository, no build command, output folder `/`", or any upload. The starter's test deploy runs `wrangler deploy` on the files as they are, with `.assetsignore` keeping repository-only files off the site.

## Later

- Run the site's own scripts in the preview, and support other component approaches (detect `customElements.define`, infer fields, `.editor/config.json` hints).
- A Content role.
- Declarative shadow DOM written into pages (decision 6).
- `sitemap.xml`/`robots.txt` kept up to date; meta-refresh redirect pages for hosts without `_redirects`.
