# Connecting a repository's preview

The editor's **Preview** toggle, and the visual text editing that runs inside it, work only when the connected repository builds its own preview and publishes it where the editor can reach it. The editor automatically checks its managed runtime files. When an official older version is detected, **Prepare integration update** creates a separate branch and opens a GitHub comparison for review. It never overwrites a custom `annotate.mjs`, changes the source branch directly, or edits the repository's workflow, Astro config, Cloudflare settings, or secrets. Those one-time setup parts still follow the manual steps below.

When the preview is present and building, the editor embeds the built branch and lets you click literal headings, paragraphs, links and buttons to edit them. When it is absent, the editor still browses and edits source, but the Preview toggle has nothing to show.

[`fixtures/astro-starter`](../fixtures/astro-starter/README.md) is the reference implementation. Copy its editor-owned files into your own Astro repository and adapt the names, as below.

## What the preview route actually is

Both committed previews and draft previews use the repository’s GitHub Actions workflow, proven in [preview proof](research/preview-proof.md):

1. On every push, a GitHub Actions workflow builds the site with an annotated preview config and uploads the output as a Cloudflare Worker **static-assets version**, aliased by branch name (for example `https://main-<worker>.<subdomain>.workers.dev`).
2. Pushes to the default branch additionally run the project's own `npm run build` and deploy that unannotated output as the live site.
3. The editor reads `.astro-editor/preview.json` to find the worker and subdomain, embeds the branch alias at the route of the open page, and fetches `/.astro-editor/revision.json` to report whether the preview matches the branch head.

### Draft previews

For repositories using the unchanged starter preview workflow, the editor can build browser drafts before **Publish**. After ten seconds without a structural source edit, it sends the complete current draft overlay to the authenticated `POST /api/draft-preview` endpoint. Restored drafts also build when the editor opens. Verified visual text changes still update immediately without a build.

The Worker verifies repository access, the exact source branch head, the preview configuration, and the canonical workflow. It creates a new immutable `editor/draft-<session8>-<snapshot16>` branch whose parent is the selected source commit, containing the submitted overlay. This push runs the repository’s existing Actions workflow and uploads a separate preview version. It does not move the selected branch, deploy the live site, change workflow/configuration/secrets, or publish the draft. **Publish** retains its existing direct-commit behavior; fast-forward publication from the preview branch is not part of this slice.

The editor keeps the last valid frame while waiting. It adopts the new frame only after its public revision stamp matches the exact draft commit. The compiled overlay becomes the visual mapping baseline; unchanged files use their committed source. GitHub originals remain the publication baseline. This restores selection and editing for newly inserted elements and elements shifted by code changes.

Builds use the repository’s existing GitHub Actions and Cloudflare resources. Previous starter builds took roughly 45–80 seconds; timing varies. The editor polls every three seconds for up to ten minutes. A timeout means the build was not confirmed; inspect the repository’s Actions page for the actual build result. Source remains editable and the last valid preview stays visible, with stale visual editing disabled.

This first production slice accepts up to 20 files under `src/`, 128 KB per file and 1 MB total. It does not accept package, workflow, or configuration changes. Symlink paths are rejected. Worker names are limited to 24 characters so generated preview hostnames fit DNS limits. Custom or missing preview workflows fall back to committed previews and are never overwritten.

Draft branches are retained in GitHub. Identical snapshots reuse their verified branch; different snapshots create new branches, with a limit of 20 per tab session, source branch and base commit. Automatic cleanup is deferred. These are ordinary repository branches and Actions runs, so previewing drafts writes source to GitHub even before **Publish**.

The separate [`scripts/draft-preview-runtime.ts`](../scripts/draft-preview-runtime.ts) remains a local, opt-in proof for the bundled fixture. It runs isolated Bubblewrap builds with preinstalled dependencies and is not used by the production Worker.

## Files to copy into your repository

All editor-owned files live in one removable directory, `.astro-editor/`, plus one workflow file. Copy the whole set — they depend on each other and must be deployed together:

| Path | Role |
| --- | --- |
| `.astro-editor/astro.preview.config.mjs` | Preview-only Astro config: imports your project's own `astro.config.mjs` as the base and appends the annotation integration. |
| `.astro-editor/annotate.mjs` | The annotation integration. At build time it imports `text-attributes.mjs` and `text-options.mjs`; it also embeds their code into the browser overlay it injects. |
| `.astro-editor/text-attributes.mjs` | Dependency-free attribute parser. Imported by `annotate.mjs` and embedded in the overlay. |
| `.astro-editor/text-attributes.d.mts` | Type declarations for `text-attributes.mjs`. |
| `.astro-editor/text-options.mjs` | The text-size option table. Imported by `annotate.mjs` and embedded in the overlay. |
| `.astro-editor/text-options.d.mts` | Type declarations for `text-options.mjs`. |
| `.astro-editor/preview-alias.mjs` | Shared branch-alias naming used by the workflow, editor, and draft-preview server; budgets for the Worker name. |
| `.astro-editor/preview-alias.d.mts` | Type declarations for the alias helper. |
| `.astro-editor/stamp-build.mjs` | Writes `dist/.astro-editor/revision.json` and a `_headers` CORS rule so the editor can verify which commit a preview shows. |
| `.astro-editor/preview.json` | Tells the editor which worker/subdomain hosts the preview and where the revision file lives. |
| `.astro-editor/wrangler.jsonc` | Cloudflare config for the preview host: a static-assets Worker with no script. |
| `.github/workflows/astro-editor-preview.yml` | Builds, stamps, uploads the branch-aliased version, and deploys the live site on the default branch. |

**`text-attributes.mjs`, `text-attributes.d.mts`, `text-options.mjs`, and `text-options.d.mts` are new required members of this bundle.** `annotate.mjs` imports the two `.mjs` modules; a deployment that ships `annotate.mjs` without them will fail the preview build. Copy and deploy the whole `.astro-editor/` directory as a unit whenever you update any part of it.

The alias-length correction requires updating `.github/workflows/astro-editor-preview.yml` together with `preview-alias.mjs` and its declaration file. **Prepare integration update** supplies managed helper files but does not rewrite workflows; reconcile the workflow separately. Keep `preview.json.worker` equal to the Worker name in `wrangler.jsonc`. Short valid aliases keep their existing URLs; long branch names use a shortened prefix and a stable suffix within Cloudflare’s combined hostname limit.

## Merge, do not overwrite

Your repository may already have some of these paths. Reconcile them rather than replacing existing work:

- **`astro.config.mjs`** — keep your project's own config. `.astro-editor/astro.preview.config.mjs` imports it (`import base from "../astro.config.mjs"`) and only adds the annotation integration to `base.integrations`. If your config exports a factory or uses a non-default shape, adapt the import instead of overwriting your config.
- **`.github/workflows/`** — add `astro-editor-preview.yml` as an additional file. Do not replace or fold it into unrelated CI workflows already in the directory.
- **Cloudflare / wrangler config** — the editor's `.astro-editor/wrangler.jsonc` describes a **separate** static-assets Worker used only for previews. Keep it distinct from any `wrangler` config your project already uses for its own hosting; do not overwrite the latter.

Set the worker `name`, `subdomain`, and the matching fields in `preview.json` to values you control. In the fixture these are `astro-editor-starter` and `lexvd.workers.dev`; change them for your own account.

## Cloudflare and GitHub prerequisites

- Deploy the preview Worker once (`wrangler deploy --config .astro-editor/wrangler.jsonc`) before any version upload, so the branch-aliased `versions upload` has a Worker to attach to.
- Add repository secrets `CLOUDFLARE_API_TOKEN` (scoped to Workers Scripts edit) and `CLOUDFLARE_ACCOUNT_ID`; the workflow reads both.
- The workflow needs no Cloudflare paid features and stays within the Actions free allowance for a small site.

## Removing the editor

Delete `.astro-editor/` and `.github/workflows/astro-editor-preview.yml`. The site then builds and runs with plain Astro, unchanged; the project's own `astro build` never loads the annotation integration.
