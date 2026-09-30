> Current architecture, audit and checkpoint: [docs/NATIVE-PROJECT.md](docs/NATIVE-PROJECT.md). The sections below record the project's origin as an Astro editor; the Astro build, preview and intelligence code has since been removed, and the editor now works only with native HTML/CSS sites: pages under `src/pages/`, components and styles by folder, page details in each page's leading comment, and an optional, legacy `.astro-editor/native.json`.

# Native Site Editor

A browser-based editor for plain HTML and CSS websites stored in GitHub, hosted on Cloudflare's free plan. Built in public; MIT licensed. Reference deployment: **https://editor.techies.tools**. Pages, custom-element components and shared stylesheets render live in a sandboxed preview as you type, with no site build; selected files save straight to the branch.

Run your own copy: see [setting up your own editor](docs/setup.md). Everything below documents the reference deployment and the project's direction.

Discovery started with Lex on 2026-09-17, inspired by UnblockWP and the modern WordPress interface.

## First milestone

The editor connects a GitHub App, browses selected personal repositories and branches, shows their file trees, and detects Astro dependencies. Monaco provides editing, diff review, undo, discard, and downloads. Draft content and its GitHub baseline persist in this browser across reloads, scoped by account, repository ID, branch, and path. Selected existing files can be published together as one direct GitHub commit. Unrelated remote changes are preserved; overlapping edits stop publication for review. GitHub App Contents write permission is required. See [publishing and recovery](docs/publishing.md). A **Preview** toggle embeds the branch's built site when the repository carries the editor's preview workflow; see [connecting a repository's preview](docs/repository-preview.md) and [preview proof](docs/research/preview-proof.md). Repositories using the unchanged starter preview workflow can render source drafts through a separate GitHub preview branch before Publish; other integrations keep committed previews. The workspace splits into resizable code and preview panes, and their widths persist between visits.

Inside the preview, clicking an element opens its page or component source and the stylesheet rules that style it, side by side, and shows an **edit bar** anchored to the element: heading level, text size, **B** and **I** (Ctrl/⌘+B, Ctrl/⌘+I) for the selected word or the whole element, and **Follow link** for route links. Those controls edit the HTML source directly and each change is one undo step. Edits to any of those files patch the live preview as you type; Undo and Redo (Ctrl/Cmd+Z, Ctrl+Y) reach across both panes and the bar.

Refresh restores the last accessible repository, branch and file for the signed-in account, including local drafts. Without saved navigation, a single accessible repository opens automatically on its default branch, and a native site opens on its home page.

The address bar tracks the selected repository ID, branch and file, for example `/#repo=123&branch=main&file=src%2Fpages%2Findex.astro`. Bookmark or copy this URL to reopen that file. Explicit links take priority over remembered navigation and survive GitHub sign-in in the same tab. Links grant no access: the signed-in account still needs repository permission. Fragments are not sent with HTTP requests; draft contents and agent credentials never appear in the URL. New unpublished files can only reopen where their browser-local draft exists.

**Connect with MCP** in the project selector copies a prompt that connects Claude, Codex or another MCP client to the open site; **Disconnect MCP** revokes it. Agents can update the active draft or create a new unpublished file; the browser applies changes with conflict checks and undo. Publishing remains in the editor. See [MCP setup and tools](docs/mcp.md).

GitHub sign-in is configured on the reference deployment; your own installation registers its own GitHub App in the browser during setup. The private starter site is [techiesreviews/native-site-editor-starter](https://github.com/techiesreviews/native-site-editor-starter).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8787. The app runs without credentials but needs a GitHub App for a live connection. See [setup and deployment](docs/setup.md) for owner setup, Cloudflare deployment, local credentials, tests and limitations. A complete sample site lives in [fixtures/native-starter](fixtures/native-starter).

## Hosting

The repository is the site: pages are `.html` files at their URLs, and any static host serves the repository as it is, with no build step. Host settings and redirects are in [hosting](docs/hosting.md).

## Starting context

Lex is questioning the future direction of Phantom Studio after Facebook group updates and of Stacki Builder following his report that its maintainer is joining Webflow. These are user-reported motivations, not independently verified project-status claims.

The attached reference shows a visual canvas, contextual element toolbar, a right-side attributes/style inspector, HTML/CSS/JavaScript panels, and selection breadcrumbs. These are inspiration, not yet an agreed feature list.

Related workflow preferences from the website-rebuild discussion: combine AI-assisted work with hands-on visual refinement, reuse components, and support shared CSS helpers with bounded component overrides.

Persistent design preference: **no decorative separators by default**—no horizontal rules, divider elements, panel borders, or border lines between interface sections. Use spacing and background differences for grouping. Keep keyboard focus indicators and code diagnostics visible. The page-structure sidebar is user-resizable; retain its width preference between visits.

The user-provided utility foundation lives in `src/utilities.css`, imported before the editor styles. Reuse these classes for common layout, content, typography, and buttons; keep component-specific rules in `src/components/` and the shared palette and UI tokens (hover, selection, type scale, sizes, radii) in `src/theme.css`. Shared DOM constructors live in `src/ui/dom.ts`. Repository actions and the file explorer reuse `src/components/dropdown.ts` for anchored, nonmodal dropdowns with hover, touch, keyboard navigation, and light dismissal. The shell and Monaco share semantic color tokens and follow live system light/dark preferences. Canvas, sidebar, toolbar and raised dropdowns have distinct backgrounds; body/muted text contrast is checked against every surface (at least 4.5:1), with focus indicators at least 3:1. The editor's scrolling document pane uses `.workspace-content` to avoid colliding with the general `.content` utility. These styles apply to the editor UI; they are not injected into connected repositories.

## Discovery

Use Matt Pocock’s wayfinder workflow, with grilling and domain-modeling. Record resolved vocabulary in CONTEXT.md and only consequential architectural trade-offs in docs/adr/. Create those files when there is resolved material to record.

Open decisions include supported Astro project shapes, the first visual editing capabilities, preview execution, synchronization with external edits, and deployment granularity.

The first repository-browsing milestone is implemented. Live GitHub authorization still requires App registration and account consent. Source publishing and visual text editing over the committed preview are implemented; deployment of connected sites relies on the per-repository preview workflow described in [connecting a repository's preview](docs/repository-preview.md).

## Wayfinder direction

Confirmed by Lex on 2026-09-17:

- Establish technical feasibility first, then identify an incremental MVP that proves a useful part of the workflow. Adjust expectations if investigations expose limits.
- Start with Lex's own website-building workflow; build in public and open source, with the intention that others can connect their own GitHub repositories.
- Connect existing Astro repositories and identify their setup. All editor-specific configuration must live in one obvious editor-owned directory at the repository root, removable when the user wants to continue with Astro alone. The directory name remains undecided.
- External agents work in the same repository through normal GitHub pull/push workflows, including Lex's devbox running T3 Code. An embedded agent is not required for this workflow. Handling concurrent or incoming changes remains to be investigated.
- Host the editor on Cloudflare and support publishing sites to Cloudflare. Vercel, GitHub Pages, and a VPS are also desired destinations through GitHub-driven deployment workflows; initial support remains to be scoped.
- GitHub holds the durable project history. Experiments can live on separate branches; completed edits on the live branch automatically save and start publishing in the first version, without a Publish button. The precise edit-completion trigger remains to be designed, and publishing controls may change later.
- Prefer publishing only the changed heading when possible; a page update is acceptable. Shared button edits should change the relevant component or CSS and propagate accordingly. The distinction between source edits and deployed output, including rebuild granularity, requires investigation.
- The first useful milestone is connecting to GitHub and seeing the repository file structure. Visual editing is a later milestone; it remains central to the overall feasibility investigation.
- Initial GitHub access covers public and private personal repositories, with access granted only to selected repositories. Organization repositories are deferred.
- The editor must be usable entirely through a hosted website, without requiring local software. A devbox is an optional external editing workflow.
- Lex requires no recurring cost for the permanent GitHub authentication/repository-browser setup. Keep this milestone compatible with Cloudflare's Free plan and do not enable paid services or upgrades. The local registration helper is one-time setup only. Hosted Astro preview costs remain a separate feasibility decision.
- Lex does not yet have an Astro project to use as a test case. The intended product offers both creating a new site and opening an existing repository. For the first milestone, create a simple starter repository separately and prove GitHub connection and file browsing before adding integrated site creation.
- The eventual editing view should faithfully show how the website will look when published. Preview fidelity is a feasibility requirement, not something established by a file-tree milestone.

Wayfinder is the active planning workflow, using grilling and domain-modeling. Its destination is a feasibility verdict and a proposed first useful MVP, rather than a complete implementation specification.

The canonical planning map is [Astro editor feasibility](.scratch/astro-editor-feasibility/map.md).

## References

- [Editor inspiration](docs/references/editor-inspiration.png)
- [Skills installation](docs/skills-installation.md)
