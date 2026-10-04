# Native Site Editor starter

A small studio site in plain HTML, CSS and one short browser script, ready to open in [Native Site Editor](https://editor.techies.tools). The repository is the site: there is no build step and nothing to install. Any static host serves it as it is.

## See it locally

```sh
python3 -m http.server
```

Then open http://localhost:8000/. Any static server works; opening the files with `file://` does not, because links and asset paths start at the site root (`/about/`, `/images/…`).

## Layout

```
index.html                           /
about/index.html                     /about/
work/<slug>/index.html               /work/<slug>/
404.html                             the not-found page
styles/site.css                      shared styles; @imports the other files in styles/
components/components.js             the component loader
components/<tag>/<tag>.html, .css    a component's template and styles
images/                              images
robots.txt                           served as is
.editor/config.json                  editor-only settings (site name and URL)
```

Every page is a full HTML document. Components such as `<site-header>` and `<section-hero>` are custom elements: `components/components.js` finds them on the page, fetches each one's template and stylesheet and renders it into a shadow root, so a change to a component shows on every page. A new component is just `components/<tag>/<tag>.html` and `.css`: put them there and use `<tag>` in a page; there is no list to update. See [AGENTS.md](AGENTS.md) for how the loader works and how to add pages, components or a blog.

## Deploying

Any host that serves a folder works: connect the repository with no build command and `/` as the output folder, or upload the files.

This repository deploys itself to a test Cloudflare Worker. `.github/workflows/deploy.yml` runs `npx wrangler@4 deploy` on every push to `main` (which is what the editor's Save to GitHub does). `wrangler.jsonc` points the assets at the repository root, and `.assetsignore` keeps repository-only files (`.git`, `.github`, `.editor`, the docs, the config) off the site. The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit) and `CLOUDFLARE_ACCOUNT_ID`.
