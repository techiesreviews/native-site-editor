---
title: The canvas shows sub-folder sites
type: task (AFK)
status: open
assignee:
blocked_by: [76-site-path-prefix]
builder: sol
phase: 7
---

## What

The canvas srcdoc resolves against `https://site.invalid` and assumes the repository root is the site root (`src/components/native-preview-runtime.js:111-147`). With a prefix, `/my-site/media/…`, `/my-site/about/` and `/my-site/styles/site.css` must resolve to the repository's files, as must unprefixed root links already in the site.

- Also the preview's asset scanner and page navigation inside the canvas.

## Done when

- A unit test of the runtime's address mapping with and without a prefix.
- Nightly spec: a fixture site with a project-site address shows its styles, images and component in the canvas; clicking a link opens the right page.
- Full suite green.
