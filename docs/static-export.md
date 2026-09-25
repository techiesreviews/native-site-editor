# Static export

The editor owns the exporter that turns a native site into a standalone static site with no JavaScript (`shared/native-export.ts`, tested in `tests/native-export.test.ts`). It is served at `https://editor.techies.tools/native-export.mjs`, so a site's deploy workflow fetches and runs it instead of keeping a build script:

```sh
curl -fsSL https://editor.techies.tools/native-export.mjs -o native-export.mjs
node native-export.mjs [projectDir] [--out dist] [--site-url https://example.com]
```

`SITE_URL` in the environment also overrides `site.json`'s `url`. The export changes nothing about how the editor previews the site.

The editor runs the same module in the browser: **Download site** in the project menu exports the site as it is in the editor, unsaved drafts included, and saves it as `<repository>-site.zip`. `site.json`'s `url` is also where **View live site** goes.

## A site with no manifest

`.astro-editor/native.json` is optional, and legacy: a new site needs none, and the editor moves an existing one's page details into the pages and can then remove it (below). A repository with `src/pages/index.html` is a native site, in the editor and to the exporter, and everything the manifest would say is found by where the files are (`resolveNativeProject` in `shared/native-project.ts`, which the editor, the exporter and the agent context share):

| What | By convention | What wins, when it is there |
| --- | --- | --- |
| Pages | every `.html` file under `src/pages/` (see [Routes](#routes)) | a manifest route mapped to a file |
| Components | every `src/components/<name>/<name>.html`, and `src/components/<name>.html`, whose `<name>` is a custom-element name (lowercase, with a dash, not reserved such as `font-face`) | a manifest `components` entry, for its tag and its file; the others are still found |
| Shared stylesheets | `src/styles/site.css` when it exists (it may `@import` the others), else every `.css` file directly in `src/styles/`, in name order | the manifest's `styles` (even `[]`), which replaces the convention |
| Page title and description | a leading comment in the page (below) | the manifest route's `title` and `description` |
| Site settings | `src/site.json` | `.astro-editor/site.json` |

When `src/components/<name>.html` and `src/components/<name>/<name>.html` both exist, the folder's is used and the export prints a warning. `jsonLd` comes only from the manifest.

A page's title and description live in the page itself, in a metadata comment that is the first thing in the file, one `key: value` per line (other keys, such as `image`, may follow and are kept):

```html
<!--
title: About
description: Who we are.
-->
<site-header></site-header>
<main>…</main>
```

This is the recommended home for page details. The export leaves the comment out of the page, and the preview never shows it. The editor's Page block (Title, Description) and the Pages tab's Rename write it: a minimal edit of the comment, made when the page has none (`<!--\ntitle: …\n-->`), a line removed when a field is emptied, and the comment removed when nothing is left. New pages, copies and subpages are titled there too. When the manifest still gives the route that field, it would win, so the same edit (one Undo step) takes it out of the manifest.

A manifest whose `routes` give titles or descriptions shows a notice with **Move page details into the pages**: every route's title and description go into its page's comment and out of the manifest as one undoable change. When the manifest then says nothing the conventions do not already give (no page details or `jsonLd`, routes only where the files already put them, the conventional components and styles), the notice offers **Remove native.json**, a deletion saved like any other. The Files tab also deletes `native.json` when `src/pages/index.html` keeps the site native without it.

## Routes

A page's URL is where its file is. Every `.html` file under `src/pages/`, at any depth, is a page:

| File | Route | Output |
| --- | --- | --- |
| `src/pages/index.html` | `/` | `index.html` |
| `src/pages/about.html` | `/about/` | `about/index.html` |
| `src/pages/work/index.html` | `/work/` | `work/index.html` |
| `src/pages/work/fern-and-kettle.html` | `/work/fern-and-kettle/` | `work/fern-and-kettle/index.html` |
| `src/pages/404.html` | `/404/` | `404.html` |

- A file or folder whose name starts with `_` is not a page (`src/pages/_parts/note.html`), nor is a name with characters other than letters, digits, `_`, `.` and `-`.
- `work.html` and `work/index.html` both give `/work/`; `work/index.html` is used and the export prints a warning.
- There must be a home page: `src/pages/index.html`, or a page the manifest maps to `/`.
- Link between pages with `#/route/` (`#/work/fern-and-kettle/`); the export rewrites these to paths.

The editor routes pages by the same rule (`shared/native-routes.ts`), so the preview and the export agree.

## Output

| Source | Output |
| --- | --- |
| each page under `src/pages/` (see [Routes](#routes)) | `<route>/index.html` |
| the `/404/` route | `404.html` (see [Not-found page](#not-found-page)) |
| the shared stylesheets (the manifest's `styles`, else [by convention](#a-site-with-no-manifest)), in order | one `assets/site.[hash].css` |
| a repository file a stylesheet `@import`s | inlined into the importing stylesheet (see below); no file of its own |
| `src/components/<name>/<name>.css` | `assets/<name>.[hash].css`, with its imports inlined |
| a repository file a stylesheet's `url()` names, outside `src/images/` and `src/public/` (a font, say) | `assets/<name>.[hash].<ext>` |
| `src/images/*` | `assets/images/<name>.[hash].<ext>` |
| `src/public/*` | copied to the site root unchanged (`src/public/_redirects` is [`_redirects`](#_redirects)) |
| routes, with a site URL | `sitemap.xml`, `robots.txt` (unless `src/public/` has them) |
| — | `_headers` |

Pages:

- Each custom element becomes declarative shadow DOM (`<template shadowrootmode="open">`). Its shadow root links `site.[hash].css` and then the component's own stylesheet, the order the preview adopts them in, so the cascade matches the preview. The document links `site.[hash].css` once in the head and preloads the component stylesheets the page uses.
- A slot the page fills is written empty (`<slot name="title"></slot>`): the browser never shows its fallback, and a crawler that does not attach shadow roots would read it as page content. A slot the page leaves empty keeps its fallback. Template parts the page leaves empty are left out, as the preview hides them.
- `#/route/` links become paths, and the nav link for the current route gets `aria-current="page"`.
- `data-key` attributes are removed. The preview uses them to patch in place; nothing on the published site reads them.
- Images get `width`/`height` from the file, and `loading="lazy"` after the first `</section>`.

The shared stylesheets become one file, and so a page loads one stylesheet rather than a chain of imports: an `@import` of a repository file is replaced by that file's text, recursively, each file once. The import's conditions and layer become blocks around the text, the way the preview wraps an imported sheet and as CSS Cascade 5 declares an imported layer (conditions outside the layer): `@import "a.css";` is a.css's rules where the import stood, `layer(name)` gives `@layer name { … }`, a bare `layer` an anonymous `@layer { … }`, and `supports(…)` and media wrap those in `@supports (…) { … }` and `@media … { … }`. A file's own leading `@layer` statements stay inside its block, so nested layers compose as the browser composes them. A component's stylesheet gets the same treatment in its own file. An import that goes round in a circle, or names a missing file, stops the export.

Every stylesheet is served from `/assets/`, so each `url()` is resolved from the file it is written in: an image under `src/images/` becomes its hashed copy, a file under `src/public/` its path at the site root, and another repository file (a font) is copied to `assets/` with a hashed name. Root-relative (`/…`), external, `data:` and `#fragment` URLs are left as written; one that names a missing file is left too, with a warning.

An external import (`https://…`) cannot be inlined, and only `@layer` statements and `@import` may lead a stylesheet, so it moves to the head of the bundle, after the first file's layer statements (and those of each later file with an external import), keeping the layer and conditions of the imports around it. Declare the layer order in the first file and import into named layers, and the order is unchanged; the exporter prints a warning for an unlayered external import that moves ahead of other styles. (The Content Security Policy below blocks other sites' stylesheets anyway.)

## The document head

- Title: the page's leading `<!-- title: … -->` comment (a manifest route's `title`, where a legacy manifest still has one, wins), else the page's first `h1`, followed by ` · <site name>`. `og:title` is the same full title.
- Description: the page comment's `description` (a manifest route's wins), else the page's first `p`, else `site.json`'s `description`.
- `lang` is `site.json`'s `locale` in BCP 47 form (`en_GB` → `en-GB`); `og:locale` keeps the Open Graph form.
- JSON-LD: the home page gets a WebSite object and, with `organization` in `site.json`, an Organization (or the `type` given) linked as its publisher. A route may add its own with `jsonLd` in the manifest (below). JSON-LD is data, not script, so it runs under `script-src 'none'`.

## `src/site.json`

The site settings are read from `src/site.json`; an older site's `.astro-editor/site.json` is still read, and wins when both exist. Every field is optional; the editor ignores the file.

```json
{
  "name": "Larkspur Studio",
  "url": "https://larkspur.example",
  "description": "A two-person design studio.",
  "locale": "en_GB",
  "themeColor": "#2f6d3a",
  "favicon": "src/images/favicon.svg",
  "image": "src/images/social-card.png",
  "imageAlt": "Larkspur Studio: small, editable websites",
  "indexable": true,
  "contentSignals": { "search": "yes", "ai-input": "yes", "ai-train": "no" },
  "organization": {
    "type": "ProfessionalService",
    "email": "hello@larkspur.example",
    "telephone": "+44 1373 000000",
    "address": { "addressLocality": "Frome", "addressRegion": "Somerset", "addressCountry": "GB" },
    "areaServed": "Somerset",
    "foundingDate": "2019",
    "sameAs": ["https://social.example/larkspur"],
    "logo": "src/images/logo.png"
  }
}
```

- `url` is the canonical base. Without it (and without `--site-url`) the canonical link, `og:url`, `og:image`, `sitemap.xml` and `robots.txt` are left out, since they need absolute URLs.
- `image` is the social image. Use a PNG or JPEG, ideally 1200×630: Facebook, LinkedIn, X, Slack and WhatsApp do not show SVG images, and the exporter warns when `image` is an SVG. For a raster image the export adds `og:image:width` and `og:image:height`; `imageAlt` becomes `og:image:alt`.
- `indexable: false` keeps the site out of search results: `_headers` sends `X-Robots-Tag: noindex, nofollow`, every page gets `<meta name="robots" content="noindex">`, and `robots.txt` leaves out its `Sitemap:` line. Use it for test and staging domains.
- `contentSignals` becomes a `Content-Signal:` line in `robots.txt` (Cloudflare's [Content Signals](https://contentsignals.org/)); each value is `"yes"` or `"no"`.
- `organization`: `type` (default `Organization`; `@type` also works), `name` (default: the site name), `email`, `telephone`, `address` (a string or PostalAddress fields), `areaServed` (a string or strings), `foundingDate`, `sameAs` (URLs), `logo` (a `src/images/` file or a URL).

## Per-route fields in the manifest (legacy)

`routes` in `.astro-editor/native.json` is optional. Keyed by route, an entry gives the page's title, description and JSON-LD (titles and descriptions belong in the page comment now; `jsonLd` is only here):

```json
"routes": {
  "/about/": {
    "title": "About",
    "description": "Who we are.",
    "jsonLd": { "@context": "https://schema.org", "@type": "AboutPage", "name": "About Larkspur" }
  }
}
```

`jsonLd` is an object or an array of objects, written into the page as it is in its own `<script type="application/ld+json">`. An entry for a route no page gives is ignored, with a warning.

An entry may also map its route to a file, `"/about/": { "file": "src/pages/about-us.html", "title": "About" }`, or as the bare path, `"/about/": "src/pages/about-us.html"`. That file then serves the route instead of the one its place would give, and is published only there: `about-us.html` is not also written to `about-us/index.html`. Manifests written before pages were routed by folder map every route this way and export as before, except that an `.html` file under `src/pages/` they do not map is now a page too.

## Not-found page

Name a page `src/pages/404.html`, and give it a title in its comment if you like:

```html
<!--
title: Page not found
-->
```

The editor previews it like any other route. The export writes it to `404.html` at the site root instead of `404/index.html`, gives it `<meta name="robots" content="noindex">` and no canonical link, and leaves it out of `sitemap.xml`. Cloudflare serves it, with status 404, for every unknown path when `wrangler.jsonc` has `"assets": { "not_found_handling": "404-page" }`. Links in the page are root-relative, so they work at any depth.

## robots.txt and sitemap.xml

With a site URL the export writes `sitemap.xml`, listing every route except `/404/`, and a `robots.txt`:

```
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /

Sitemap: https://larkspur.example/sitemap.xml
```

To write your own, put `robots.txt` or `sitemap.xml` in `src/public/`; the export then copies that file instead of generating one. Anything else in `src/public/` (for example `.well-known/security.txt`) is copied to the site root too; a file that would replace an exported page or asset stops the export.

## `_headers`

```
/*
  Cache-Control: max-age=0, must-revalidate
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
```

HTML is always revalidated; hashed assets are cached for a year. All styles are in files, so `style-src` has no `'unsafe-inline'`. It is added only when a page carries a `style` attribute or a `<style>` element. The policy allows only this site's own stylesheets, fonts and images, so a stylesheet that `@import`s a web font service is blocked; host the font files under `src/public/` instead.

HSTS (`Strict-Transport-Security`) is not in `_headers`. Turn it on for the custom domain in the Cloudflare dashboard (SSL/TLS → Edge Certificates → HTTP Strict Transport Security), where its max-age, subdomains and preload can be managed for the whole zone. Every `.dev` domain, `workers.dev` included, is already HTTPS-only through the browsers' HSTS preload list.

## `_redirects`

`src/public/_redirects` is copied to the site root like any file in `src/public/`; the export writes no `_redirects` of its own, so nothing replaces it. Cloudflare's static assets read it (Workers and Pages alike): one rule per line, `source destination [status]`, `#` for comments, the first rule for a source wins, and a redirect is followed even where a page exists at its source.

The editor writes it when a page's URL changes (Change URL, Move to… or a drag in the Pages tab, or renaming or moving its file in the Files tab) with **Keep the old URL working** checked: one static line per moved page that is on GitHub, the page first, then its subpages:

```
/about/ /company/ 301
/about/us/ /company/us/ 301
```

Static lines rather than a splat rule (`/about/* /company/:splat 301`): Cloudflare allows 2,000 static redirects but only 100 dynamic ones, and `/about/` itself needs its own line anyway. Each change also keeps the file free of chains and loops: a line whose destination was the old URL (or under it) now points at the new one, one that would point at itself goes, and a line whose source is one of the new URLs goes, since it would hide the page there. Comments and other lines are kept as written.
