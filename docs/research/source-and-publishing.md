# Astro source editing and direct publishing

Research date: 2026-09-17. First-pass feasibility, not an implementation proof.

**Verdict:** bounded edits to normal Astro source are plausible; arbitrary rendered-page-to-source round trips are unproven. Automatic publishing can follow a completed edit, but a Git commit, successful build, and live deployment are separate states. Start with a static starter and literal heading edit after the GitHub/file-tree milestone.

## What can be edited safely?

Astro supports expressions, loops and component props: rendered text need not be a literal in the current page. Its compiler exposes an AST, but its own README warns that position data can be incomplete or incorrect and text nodes can contain JavaScript/TypeScript. A parser alone therefore does not prove reliable element-to-source mapping. [Template expressions](https://docs.astro.build/en/reference/astro-syntax/), [compiler README](https://github.com/withastro/compiler).

Proposed initial contract, requiring a prototype:

| Rendered selection | Source operation |
| --- | --- |
| Literal heading in `.astro` | Replace only its verified text range, escaping Astro/HTML syntax appropriately. |
| Literal attribute | Replace its verified value; reject expressions initially. |
| Text from props, loops, collections, CMS or functions | Display normally; explain why direct editing is unavailable until an explicit source binding exists. |
| Shared component or CSS declaration | Edit the owning source and expose that other instances can change. |

Inject selection metadata only into the editor's temporary preview transform. Associate selections with a file, source range, source hash and preview revision; verify the original bytes before writing. Do not serialize the browser DOM back into Astro. Ambiguous mappings should disable editing. These are engineering proposals, not Astro guarantees.

CSS controls need their own ownership rules: Astro supports scoped styles, global styles and imported stylesheets. A computed color does not identify which declaration the user intends to change. Begin with an explicitly identified declaration; defer cascade inference and framework-generated styles. [Astro styling](https://docs.astro.build/en/guides/styling/).

## Removable configuration and external agents

Propose `.astro-site-editor/` for all editor-specific repository configuration. Keep content edits in ordinary Astro/CSS files. Load instrumentation from the hosted runner, avoiding mandatory imports in `astro.config.*` or editor runtime dependencies in the site. Astro's experimental programmatic API can merge inline configuration with project configuration; whether this works across supported versions and integrations needs testing. Deleting the directory must leave normal install/build commands working. Ordinary Astro configuration and deployment workflows remain site infrastructure, not editor configuration. [Programmatic API](https://docs.astro.build/en/reference/programmatic-reference/).

For agent coexistence, base each edit on a known commit. Create a child commit and update the branch without force; GitHub's reference API supports fast-forward-only updates. If an external commit wins the race, fetch, remap, and revalidate the edit; stop on overlap. Never retry stale byte offsets blindly. Refresh idle previews when the branch changes. This is a proposed concurrency design supported by the API, not yet race-tested. [GitHub references API](https://docs.github.com/en/rest/git/refs#update-a-reference).

## Source, build and deployment granularity

A heading edit may produce a one-line source diff while still triggering a site build. A shared component can affect many generated pages. Astro ordinarily prerenders static routes at build time. Current docs describe experimental incremental builds for eligible `getStaticPaths()` pages with cache keys; ordinary static pages still render every build, and dependency changes invalidate related outputs. This is an optional optimization, not a universal single-page publish mechanism. [Rendering](https://docs.astro.build/en/guides/on-demand-rendering/), [incremental builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/).

| Target | Practical first publishing model |
| --- | --- |
| Cloudflare | Git-triggered build/deploy. Pages supports branch previews; Workers also supports Git integration. Workers versions represent complete code/assets/configuration snapshots, even when uploads reuse unchanged assets. |
| Vercel | Production-branch commits trigger production deployments; other branches can get previews. Treat publication as deployment of the project revision. |
| GitHub Pages | GitHub Actions builds and uploads the static site, then deploys it. No Astro server rendering here. |
| Own VPS | Serve static build output, or run the Node adapter output for SSR. A custom pipeline can transfer changed files, but should activate a consistent release containing all affected assets. |

Sources: [Cloudflare Git](https://developers.cloudflare.com/pages/configuration/git-integration/), [Worker versions](https://developers.cloudflare.com/workers/versions-and-deployments/), [asset uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/), [Vercel Git](https://vercel.com/docs/git), [Astro GitHub Pages](https://docs.astro.build/en/guides/deploy/github/), [Astro deployment](https://docs.astro.build/en/guides/deploy/), [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/). VPS release activation is a recommendation.

Thus “publish only my heading edit” should initially mean commit that source mutation and rebuild a coherent site. It should not promise patching a heading in deployed HTML. Experiments remain on separate branches.

## Faithful preview and proof required

Use the actual site's rendering, with editor controls overlaid. A fast development preview is provisional: Astro documents previewing built output separately from development. For stronger confidence, compare the same commit's production build under matching viewport, assets, environment and runtime. Dynamic data, cookies and origin differences prevent unconditional pixel identity. [CLI build/preview](https://docs.astro.build/en/reference/cli-reference/).

On a completed edit, automatically save and start deployment; show **saving → building → live**, or a failure/conflict. “Direct” removes manual approval, not build latency. Keep preview revision and deployed revision distinct.

Required next proof: select and edit a literal heading; preserve all unrelated bytes; reject expression-backed text; rebuild and compare preview/live screenshots; accept an external agent change and reopen; simulate overlapping commits and failed deployment; delete editor configuration and rebuild normally. Documentation cannot establish these outcomes without that prototype.
