# Browser code editor options

Researched 2026-09-18 against official documentation and upstream source. This evaluates the editing surface; GitHub writes and Astro preview execution are separate capabilities.

## Recommendation

Try three interactive views: **Monaco workspace**, **CodeMirror workspace**, and **Monaco change review**. Use the same sample document and draft for a fair comparison. My recommendation is Monaco for the desktop-first experience requested; CodeMirror is a useful alternative if a compact, adaptable UI and mobile editing become more important. These are product recommendations inferred from the capabilities below, not measured bundle-size claims.

| Option | What it provides | Fit and limits |
| --- | --- | --- |
| Monaco Editor | VS Code's editing component, models with URI-based identity, completion/hover providers, background language services, custom language tokenizers | Best starting point for a familiar desktop code editor. It does **not** run arbitrary VS Code extensions. Upstream does not claim mobile-browser support. MIT licensed. [Upstream README](https://github.com/microsoft/monaco-editor) |
| CodeMirror 6 | Modular web editor with syntax highlighting, search, folding, completion, keyboard/screen-reader and mobile support | Easier to shape around a page builder. Language packages and completion sources need explicit configuration; a rich-looking autocomplete menu alone is not project-aware IntelliSense. MIT licensed. [Features](https://codemirror.net/), [completion sources](https://codemirror.net/examples/autocompletion/), [license](https://github.com/codemirror/dev/blob/main/LICENSE) |
| OpenVSCode Server | Full VS Code-derived browser workbench backed by a remote machine; supports installing extensions | Useful if we later want a complete remote development environment. Requires a server/container and its operational lifecycle; it is not an editor component that can be dropped into the existing static frontend. MIT licensed, but infrastructure is a separate cost. [Project and setup](https://github.com/gitpod-io/openvscode-server) |

VS Code for the Web is also an existing browser application. Browser availability should not be mistaken for an embeddable Monaco replacement or guaranteed desktop-extension compatibility. Its extension environment has web-specific constraints. [VS Code web](https://code.visualstudio.com/docs/remote/vscode-web), [web extensions](https://code.visualstudio.com/api/extension-guides/web-extensions).

## Astro intelligence: what is and is not solved

Syntax colouring, matching brackets, indentation and snippets can run entirely in the client. Project-aware component props, cross-file navigation, type errors and imports need Astro-aware language services plus the relevant repository files and dependencies. Standard HTML support is not equivalent to `.astro` support.

The official Astro extension currently declares `main: ./dist/node/client.js` and no browser entry point. It includes an Astro grammar, snippets and a TypeScript plugin. Reusing a grammar can improve highlighting; that does not port the language server. [Current extension manifest](https://github.com/withastro/astro/blob/main/packages/language-tools/vscode/package.json).

The official language server starts using `@volar/language-server/node`, requires a TypeScript SDK directory, locates Astro in the workspace and watches project files. Its package exposes a Node server executable. **A drop-in, browser-only Astro language server has not been verified here.** A browser port with virtual files/dependencies or a remote language-server bridge is a separate feasibility prototype. [Server implementation](https://github.com/withastro/astro/blob/main/packages/language-tools/language-server/src/nodeServer.ts), [package manifest](https://github.com/withastro/astro/blob/main/packages/language-tools/language-server/package.json).

The former `withastro/language-tools` repository is archived and points to the Astro monorepo; use the current paths above for implementation research. [Migration notice](https://github.com/withastro/language-tools).

## Cost and hosting

Client-side Monaco/CodeMirror code and their browser workers can be bundled as static assets. Cloudflare currently lists static asset requests as free and unlimited with no additional asset-storage charge; Worker-script execution is subject to its separate pricing/limits. Therefore these editor prototypes do not themselves require a paid language-server service. This does not promise unlimited free authenticated API usage. [Cloudflare static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

OpenVSCode's documented Docker/remote-machine architecture is outside that static hosting model. An existing devbox can supply compute, but its availability is not a permanent free hosted service guarantee.

## Prototype evaluation

1. **Monaco workspace:** fill the available workspace; edit real text, undo, search, fold and try completions. Label Astro snippets as snippets; prove actual TypeScript intelligence using a `.ts` sample.
2. **CodeMirror workspace:** same content and changes, compact controls, keyboard and narrow-screen checks. Compare interaction and loading characteristics without claiming unmeasured performance superiority.
3. **Monaco change review:** compare original and edited text in a diff view. Test whether reviewing a single file supports the intended direct-publish workflow.

All three should keep draft state across prototype switches. Distinguish draft editing from saving a GitHub commit, and label any sample preview as a sample rather than a real Astro build. Before claiming full IntelliSense, demonstrate an imported component's props and an intentional type error across multiple files in an actual Astro project.

## Implemented exploration

Run `npm run prototype`, sign in, then use **Editor prototypes** in the header. The existing authenticated route accepts `?prototype=code&variant=A`, `B`, or `C`. The explicit prototype query enables the comparison UI on the hosted app so it is accessible without the devbox. Normal source browsing does not load the editor bundles. If no file is open, samples are available; use the sample selector to switch between Astro and TypeScript. Opening a repository file while in prototype mode loads that file instead.

Implementation: `src/components/code-editor.prototype.ts` and its scoped stylesheet. This is disposable exploration; no interface has been selected for production yet. The workspace has no root Git repository or implementation issue, so no throwaway branch capture has been created. Capture the chosen design and archive the alternatives when the verdict is known.

- A: Monaco 0.56 workbench, dark theme, minimap, find, completion control.
- B: CodeMirror 6 focused layout, wrapping, HTML/JS/CSS language packages. Astro is treated as HTML here, so frontmatter/expression intelligence is not implemented.
- C: Monaco editable diff against the original file, using the same draft as A and B.
- Drafts are memory-only and keyed by repository/branch/revision/path. Switching variants, samples, or files retains drafts within the tab; reload discards them. Download exports a draft. No commit, publish, build preview, or remote code execution occurs.
- Monaco Astro support is a small prototype tokenizer plus explicitly labeled snippets. The TypeScript sample demonstrates the separate built-in TypeScript service; this is not evidence of project-aware Astro support.
- Both engines currently share a lazy prototype bundle. This compares interaction, not isolated engine download performance. Monaco and its TypeScript worker are substantially larger than the normal file browser; optimize imports only if this direction is selected.
- The static CSP permits runtime inline **styles**, required by the editor libraries' generated styles/layout, while scripts and workers remain restricted to same-origin assets. Repository content remains text in the editor. Monaco's pinned DOMPurify dependency is overridden to patched 3.4.15; installation audit reports no vulnerabilities.

Decision pending: evaluate A for daily editing, B for embedding beside a future canvas, and C as a review step. No paid language-server or compute service has been added.

## Selected direction

The user selected Monaco editing plus Monaco diff review. These are now the default source workspace, implemented in `src/components/code-editor.ts` with shared model/undo state and scoped CSS. CodeMirror and the sample/switcher UI were removed from the application. The prior comparison is archived at `docs/archive/code-editor-prototypes.tar.gz`. The root workspace is not a Git repository, so the archive substitutes for a throwaway branch. Draft editing does not yet write GitHub commits. Project-aware Astro intelligence is the next requested addition.
