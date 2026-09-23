# Astro editor starter

A standalone static Astro site with two pages, one shared layout and one shared stylesheet. No editor dependency or configuration is required.

Use Node 22.12+ and npm 9.6.5+. Run `npm ci`, then `npm run dev` or `npm run build`.

Copy this directory into a separate repository to test the editor's GitHub connection. Exclude `node_modules`, `dist`, and `.astro`. The root `package.json` should be at that repository's root.

The home page also includes a Preact counter island, an SVG from `public/` and a PNG processed by `astro:assets`, used by the editor's preview proof.

## Editor preview (removable)

`.astro-editor/` and `.github/workflows/astro-editor-preview.yml` belong to the Astro Site Editor. The `.astro-editor/` directory is one bundle whose parts depend on each other: `astro.preview.config.mjs` layers the annotation integration (`annotate.mjs`) onto the project's own config, and `annotate.mjs` both imports and embeds the `text-attributes.mjs` and `text-options.mjs` modules (with their `.d.mts` type declarations). Deploy the whole directory together — shipping `annotate.mjs` without `text-attributes.mjs` or `text-options.mjs` breaks the preview build. On every push, GitHub Actions builds the site with `.astro-editor/astro.preview.config.mjs` (the project's own config plus an integration that annotates literal text elements with their source location and injects a small selection script when embedded in the editor), stamps `dist/.astro-editor/revision.json`, and uploads the output as a Cloudflare Worker static-assets version aliased by branch name, for example `https://main-astro-editor-starter.lexvd.workers.dev`. Pushes to `main` also run the project's own `npm run build` and deploy that unannotated output to `https://astro-editor-starter.lexvd.workers.dev`. The workflow needs the repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts edit) and `CLOUDFLARE_ACCOUNT_ID`, and the Worker must be deployed once before versions can be uploaded. Delete both paths to stop using the editor; the site builds and runs unchanged without them.
