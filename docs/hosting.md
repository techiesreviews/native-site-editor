# Hosting

A native site has no build. The repository is the site (see [ADR 0001](adr/0001-the-repository-is-the-site.md)): `index.html` is `/`, `about/index.html` is `/about/`, links and asset paths are root links such as `/about/` and `/images/hero.svg`, and the components are rendered in the visitor's browser by the site's own `components/components.js`. Whatever serves the repository's files as they are serves the site.

## Host settings

Serve the repository root at the root of a domain (root links do not work from a subfolder or from `file://`):

- **Cloudflare Pages, Netlify, Vercel**: connect the repository; no build command (or none/`exit 0`); output directory `/` (the repository root).
- **Cloudflare Workers static assets**: `wrangler deploy` with `assets.directory` set to `.`; list repository-only files (`README.md`, `AGENTS.md`, `.editor/`, `.github/`, `wrangler.jsonc`) in `.assetsignore`.
- **Any other host or FTP**: upload the files as they are. **Download site** zips them, unsaved drafts included (hidden from the editor's project menu for now; clone the repository instead).
- **Locally**: any static server at the repository root, such as `python3 -m http.server`.

A root `404.html` is the page hosts show for an address the site does not have (Cloudflare, Netlify and Vercel pick it up by name).

Publishing from the editor (GitHub Pages, a Cloudflare pipeline, Spacefast, other hosts detected from the commit) is described in [Publishing to a host](publishing-hosts.md).

## Redirects

`_redirects` at the repository root (Cloudflare Pages, Cloudflare Workers static assets and Netlify read it) holds one `from to status` line per redirect:

```
/old-page/ /new-page/ 301
```

The editor writes these lines itself when a page's URL changes and **Keep the old URL working** is on. Hosts without `_redirects` support need their own redirect settings.

## Editor settings

`.editor/config.json` is read only by the editor, never by the site:

```json
{ "site": { "name": "Larkspur Studio", "url": "https://larkspur.example" } }
```

`site.url` is where **View live site** goes.
