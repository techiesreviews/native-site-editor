# ADR 0001: The repository is the site

- Status: proposed, 2026-09-26. Nothing is built yet; the spikes below come first.
- Decides: repository layout, how the editor previews and edits a site, how components work in the starter, what agents and content editors get.
- Replaces, once done: the `src/pages` layout, the preview runtime's own component machinery, `#/` routes, the page metadata comment and the static export as the way to publish.

## Context

Today a native site is source that only the editor and the exporter understand. Pages are fragments in `src/pages/`, components are templates in `src/components/` that the editor's preview runtime (`public/native-preview-runtime.js`) turns into shadow DOM, links are `#/route/` hashes, page details sit in a leading comment, and the preview strips every `<script>`. Publishing means running `native-export.mjs`, a build, and uploading `dist/`. A repository downloaded from GitHub does not run anywhere.

The goal is the opposite: the repository is the site. Any plain static host serves it as it is, and the editor opens it as it is.

## Goals

Four cases, all served by the same repository:

1. **Native, no build.** HTML, CSS and browser JavaScript that run on any static HTTP server (a host, Cloudflare Pages, Vercel, an FTP host, `python3 -m http.server`). No `npm run build`, no Node or PHP server, no dependencies to install. Browser JS, ES modules and CDN imports are fine.
2. **Developer experience.** The code panes show the real, ready-to-run files. A component is defined once (structure, CSS, behaviour) and every page that uses it updates. The best editor for modern native HTML, CSS and JS.
3. **Agents.** With the editor open, an agent works through MCP on the user's drafts. Without it, an agent edits the repository directly (add a page, add a blog) and the result still runs and still opens in the editor.
4. **Content editors.** A marketeer builds pages visually: edits text (bold, italic, links), images and buttons, adds, moves and removes pre-made sections, fills optional fields, and cannot break the structure.

## Constraints

- **Nothing to set up.** A user opens the editor, picks a repository, and the site runs in the preview with its own JS. No local server, no install, no configuration.
- **Assume nothing.** The editor adapts to however a repository builds its pages and components. Conventions and the optional `.editor/` folder only make things easier; a site never needs them to run.
- **What you edit is what ships.** The editor writes files that run as they are. It adds no runtime, attributes or build step to the site.
- **Browsers only.** What a browser cannot run (server code, build tools, `node_modules`) is shown and edited as source but not previewed. That is the edge of a native editor.

## Non-goals

- Running build tools (Sass, TypeScript, bundlers) in the editor.
- Server features (forms handled by our servers, databases). A site can call outside services that allow browser requests.
- Access control inside a repository. GitHub's write permission is the security boundary; editor roles are UX (below).

## Decision

### 1. Repository layout

The repository root is the site root. URLs are file paths:

```
index.html                    /
about/index.html              /about/
work/index.html               /work/
work/fern-and-kettle/index.html
404.html
styles/site.css               shared styles (native @import)
components/                   the starter's components, served
  components.js               the starter's loader (native ES module)
  site-header/site-header.html, site-header.css
  section-hero/section-hero.html, section-hero.css
images/
sitemap.xml, robots.txt       optional, kept up to date by the editor
.editor/config.json           optional, editor-only
README.md, AGENTS.md
```

- Pages are full documents with their own `<head>`: `<title>`, `<meta name="description">`, Open Graph tags, stylesheet links, the component loader.
- Links and asset paths are root links (`/about/`, `/images/hero.svg`). They work on any host at a domain or port root, and locally through any static server. Opening files by double-click (`file://`) and hosting in a subfolder are not supported.
- Editor-only settings live in `.editor/` (replacing `.astro-editor/native.json` and `src/site.json`). Nothing the site loads is in there. Hosts may or may not serve dot folders; either is harmless.
- The editor assumes none of this beyond "HTML files are pages". Another layout (pages in `pages/`, components in `elements/`, `.html` URLs) opens too; see section 4 for how the editor finds things.

The starter follows this layout exactly. It is the reference site, not the only shape the editor supports.

### 2. Preview: a static server inside the editor

The preview runs the site exactly as a static host would, including its own JavaScript. The editor supplies files, not behaviour.

- **Preview origin.** The site runs in an iframe on a separate preview origin, never on the editor's origin, so site JS cannot reach the editor's session or GitHub access. Each repository gets its own subdomain (`<id>.preview.<domain>`), so two sites cannot see each other's storage or service workers. The preview origin is served by our Worker; there is nothing to configure per user.
- **Service worker as the server.** The preview origin's bootstrap page registers a service worker whose scope is the whole origin. Every request the site makes (`/about/`, `/components/components.js`, `fetch("/data/posts.json")`) goes to the service worker, which asks the editor tab for that path over a `MessageChannel` and answers with the draft file (or the saved one). Requests to other origins (CDNs, APIs) go to the network unchanged.
- **Static host rules.** The service worker resolves paths the way common hosts do: an exact file; a folder serves its `index.html`; `/about` serves `about.html`, else redirects to `/about/`; anything else serves `/404.html` with status 404. Content types come from the extension. These rules are written down once and tested, so the preview and a real host agree.
- **The editor's overlay.** The service worker adds one script to HTML responses, the editor overlay (the successor of today's runtime). It draws selection boxes, the edit bar, insert points and drag handles in its own closed shadow root and talks to the editor over `postMessage`. It does not define components, route pages or change the site's DOM beyond its own UI.
- **Updates.** CSS edits swap the stylesheet in place, without a reload. Text typed in the preview is already in the DOM. Any other change (HTML structure, JS, a component template) reloads the iframe from memory, keeping scroll position and the selection. A reload is needed for templates anyway: a custom element cannot be redefined in a running page.
- **Navigation.** Links inside the site navigate inside the preview as on a real host; the editor follows the route and opens the page's file. Links to other origins open in a new tab.

### 3. From a click to a source file

- **Page content.** The overlay pairs each element with its place in the page's HTML source by structure and markup, as the editor already does since `data-key` went away (`136d224`). Elements the site's JS created, and so has no source for, are marked "rendered by script".
- **Component content.** Content inside a shadow root (or inside a component's light-DOM template, section 4) belongs to the component. When the editor knows the component's template file, a click opens that file at the element and edits go there; otherwise it opens the script that defines the tag.
- **Styles.** The style panel (`shared/cascade.ts`) reads the rules matching the selected element from the live CSSOM, as today, and maps each to its file and rule.
- **Scripts.** Behaviour is not traced. A script-rendered element's panel shows the defining module and nothing is edited in place.

### 4. Components

**What the editor supports (assume nothing).** Any custom element in a page is a component. The editor finds out what it can:

- where it is defined: a module that calls `customElements.define("<tag>", …)`, found by scanning the repository's JS;
- its template: `components/<tag>/<tag>.html`, `components/<tag>.html`, or a file named in `.editor/config.json`;
- its fields: each `<slot name>` in the template is a field; the fallback element sets the kind (`h1`–`h6`, `p` → text; `img` → image; `a` → link or button; anything else → rich content); `static observedAttributes` in the class lists attribute fields;
- whether it is a section: the template's root is one `<section>`, or config says so.

`.editor/config.json` can add what cannot be inferred: labels, help text, which components content editors may insert, which fields are required, a template file path. It is never needed to run the site.

**The starter's approach: real web components, no build.** Each component is a folder with an `.html` template and a `.css` file (and a `.js` file when it has behaviour). `components/components.js`, a short native ES module every page loads with `<script type="module">`, lists the components, fetches each template once, and defines the elements. A page uses a component as a tag, filling slots with its own elements:

```html
<section-hero>
  <h1 slot="title">A short, clear headline.</h1>
  <p slot="lead" class="lead">Who this is for and what they get.</p>
  <a slot="primary" href="/about/#contact">Get in touch</a>
</section-hero>
```

- The page's own content is in the page's HTML, so it is indexed and it is what the page builder edits.
- A component's structure and CSS live in one place. A change to a template is one file in one commit, and every page shows it on the next load.
- Optional fields: a slot the page does not fill is hidden instead of showing its fallback, except in an instance that fills no slot at all (today's rule, moved from the editor runtime into the starter's loader, where it is visible code the site owns).
- Header and footer are components without slots.

**Open: shadow DOM or light DOM (spike 2).** Shadow DOM gives native `<slot>` and the page DOM equals the page source, but CSS for slotted elements needs `::slotted()` (the problem behind this ADR). Light DOM lets the loader place the page's elements into the template and styles use `@scope (section-hero) { h1 { … } }` with one normal cascade, but the rendered DOM differs from the source and the loader does more. The spike decides; the editor supports both either way.

### 5. Editing

Carried over from today, now on real files:

- **Text and formatting** in the preview: typing, bold, italic, links, with minimal source edits.
- **Images**: upload to `/images/`, `src`, `alt`, `width`/`height` written into the tag.
- **Sections**: insert a section component between sections with its fields pre-filled from the template's fallbacks (today's `slotMarkup`), move up and down, duplicate, remove.
- **Pages**: create (from `.editor/page.html` when present, else a copy of the home page's head, header and footer with an empty `<main>`), rename, change URL (moves the file, rewrites root links in every HTML and CSS file, and leaves a redirect page at the old URL: a small `index.html` with `<meta http-equiv="refresh">` and a canonical link, which works on every host; `_redirects` is also updated when the repository has one), delete.
- **Page details**: title, description and social image edit the page's `<head>` directly.
- **Site settings** (name, URL, locale in `.editor/config.json`): the editor offers to update `<head>` tags across pages and regenerates `sitemap.xml`/`robots.txt` when they exist or a site URL is set.
- **Code panes**: the page, the component template and CSS side by side, as today; every edit shows in the preview.

The edit bar and page builder UX stay as specified by the Astro User Editor interaction contract.

### 6. Roles

- **Developer**: everything, including code panes and templates.
- **Content**: the page builder only. Edit field content, format text, change images and links, insert only the sections config allows, fill or clear optional fields, create pages from the page template. No code panes, no template or CSS edits.

A role is chosen per user per repository; the repository owner can make Content the default for others in `.editor/config.json`. Roles shape the UI. They are not security: anyone with write access can push anything to GitHub.

### 7. Agents

- **Through the editor (MCP).** The existing tools (`get_site`, `list_files`, `read_file`, `get_page`, `edit_file`, `write_file`, `move_file`, `delete_file`, `create_page`, `set_page_details`, `open_page`, `add_section`, `move_section`, `remove_section`, `get_command_status`) move to the new model: `get_site` reports the pages, components, fields and settings the editor detected; `create_page`, `add_section` and `set_page_details` do what the editor does in section 5; everything still lands as drafts the user reviews. The conventions resource is generated from the repository (what was detected, plus the starter's conventions when it is the starter) instead of being fixed text.
- **Directly on the repository.** The starter's `AGENTS.md` explains the layout, the component approach and how to add a page or a blog, so an agent without the editor produces files that run and that the editor opens.

### 8. Publishing and download

- Saving stays a batch commit to GitHub (`worker/publish.ts`, 100 files, 1 MB). A component change is one or two files.
- Deploying is the host's own "connect a repository, no build command, output folder `/`", or any upload of the files. The starter drops its build workflow.
- **Download site** zips the repository files as they are, drafts included.
- `native-export.mjs` stays for sites on the old layout until they convert.

### 9. Security

- Site JS only ever runs on the preview origin. Recommended: a separate registrable domain for previews, so previews are cross-site to the editor and share no cookies with it (spike 1 checks service workers in cross-site iframes on every browser). The editor's cookies are already host-only with `Origin` checks on state-changing requests (`worker/app.ts`).
- The preview origin holds no tokens and fetches nothing from GitHub. It only serves what the editor tab sends it.
- Messages between editor, preview page and service worker are checked by origin and shape in both directions.
- The preview origin sets `frame-ancestors` to the editor, so it cannot be framed elsewhere.

### 10. Existing sites

A one-time **Convert to a native repository** for `src/pages` sites, reusing the exporter's logic:

- each page becomes a full document at its URL path, head from the page comment and `site.json`;
- `#/route/` links become root links; `src/images/*` moves to `/images/`;
- components move to `components/`, the starter loader is added, and their CSS keeps its `::slotted()` rules;
- `src/site.json` and `.astro-editor/native.json` become `.editor/config.json`;
- everything lands as drafts to review, saved in one or more commits.

The starter v2 is made by running the conversion on today's starter and polishing by hand. Until a site converts, the editor keeps opening the old layout with today's runtime, frozen: no new features.

## What changes in this repository

| Area | Today | After |
|---|---|---|
| Preview | `srcdoc` iframe, `public/native-preview-runtime.js` renders pages and components, strips scripts | Preview origin plus service worker serving drafts; the runtime becomes the overlay (selection, edit bar, insert points, text editing, cascade reading) |
| Project model | `shared/native-project.ts`, `native-routes.ts`: `src/pages`, `#/` routes | Detection over any repository: HTML files as pages, custom elements as components, config as hints |
| Components | Runtime hydration, `slotMarkup`, optional slots in the runtime | Detection and field inference; instance markup for inserts; optional-slot behaviour moves to the starter's loader |
| Page details | Leading comment (`native-page-meta.ts`) | The page's `<head>` |
| Links | `#/route/` | Root links; Change URL rewrites them and leaves a redirect page |
| Export | Required to publish; `slotted-css.ts` twins | Legacy only |
| MCP | Fixed conventions text | Conventions generated from detection; tools on the new model |
| Worker | `editor.techies.tools` | Plus the preview origin (wildcard subdomain) |

Kept as is: drafts, GitHub publishing and history, code panes, the style cascade (`shared/cascade.ts`), the page structure sidebar, the edit bar UI, uploads.

## Spikes (before any production code)

Each is throwaway code with pass criteria. Their results fill in the open decisions.

1. **Preview engine.** A three-page site with ES module imports, `fetch()` of a JSON file, root links, CSS `@import` and images, served from in-memory drafts by a service worker on a preview origin inside an iframe on the editor's origin.
   Pass when: it runs in Chrome, Edge, Firefox and Safari, including with the preview on a separate registrable domain; a CSS edit shows in under 100 ms without a reload; an HTML edit reloads in under 300 ms keeping scroll; the preview recovers after the browser stops an idle service worker; no request reaches GitHub from the preview origin.
2. **Starter components.** `site-header` (no slots), `section-hero` (slots, optional parts) and a card list with nested components, built both with shadow DOM and with light DOM plus `@scope`, served by `python3 -m http.server`.
   Measure: layout shift and time until components show (throttled), what a crawler without JS sees, how the CSS reads for a developer, nested components, and how easily the overlay maps clicks to files.
3. **Source mapping with live JS.** Pages whose scripts add, reorder and remove elements. Pass when clicks on source elements open the right tag, script-created elements say so, and component content opens the template.

## Open decisions

1. Preview domain: a separate registrable domain (recommended) or `preview.techies.tools`. Needs a wildcard DNS record, created once by hand.
2. Shadow DOM or light DOM for the starter's components (after spike 2).
3. Where the Content role is set, and whether owners can enforce it as the default.
4. How long the old layout stays supported after conversion ships.
5. Later, optionally: the editor writing declarative shadow DOM into pages on save, so visitors without JS see component content. Off by default.

## Phases

Each phase ships on its own, with unit and browser tests, and is deployed.

0. This ADR and the three spikes; decisions 1–2 made.
1. Preview engine for repositories in the new layout: detection, preview origin and service worker, overlay selection, click to file, code panes. The old layout keeps today's preview.
2. Starter v2 in `native-site-editor-starter`, made by the conversion and polished; `AGENTS.md` written.
3. Visual editing on the new engine: text and formatting, images, links, sections, pages, page details, site settings.
4. Component field inference, `.editor/config.json`, the Content role.
5. MCP tools and generated conventions on the new model.
6. Conversion for existing sites; the old runtime and the export become legacy.

## Risks

- **Service workers in cross-site iframes.** Browser behaviour differs, Safari most of all. Fallback: open the preview as its own tab on the preview origin. Spike 1 decides.
- **Mapping clicks when site JS changes the DOM.** Mitigated by structural pairing and the "rendered by script" state (spike 3).
- **Reloads.** Custom elements cannot be redefined, so template and structure edits reload the frame. A reload from memory should stay under 300 ms.
- **Losing today's runtime features.** Insert points, section drag, empty-part hiding and cascade reading move to the overlay and need their tests carried over.
- **Repositories with build tools** open as source only; the editor says why the preview may differ.
- **Content without JS.** Component templates only show with JS; page content is always in the HTML. Decision 5 covers it if it matters.
