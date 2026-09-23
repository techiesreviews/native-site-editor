# Project-aware Astro IntelliSense in a browser

Investigated 18 September 2026 against npm packages, with an executable conversion and TypeScript-service experiment in `/tmp/astro-intelligence-research/verify.mjs`. This is implementation research, not a claim that these features have already shipped.

## Recommendation

Use a dedicated browser worker with Astro's browser compiler, a TypeScript language service, and a virtual project filesystem. Start with repository imports, component Props completions, hover, definitions, and mapped diagnostics. The official latest Astro language-server entry is not a drop-in browser worker.

The compiler package explicitly exports a browser build; its published API has async `initialize({ wasmURL })` and `convertToTSX(source, { filename })`. Serve its WASM from our own static assets. Version inspected: `@astrojs/compiler@4.0.0`, approximately 5 MiB WASM. [Compiler source](https://github.com/withastro/compiler/tree/main/packages/compiler).

## Verified mechanism

Converting a component with `interface Props { title: string; count?: number }` produces a default exported function whose argument is `Props`, plus an Astro global parameterized by those props. Converting a caller preserves its component imports. A TypeScript language-service host can resolve `./Card.astro` to virtual `/project/Card.astro.tsx`.

The local experiment used `typescript@6.0.3` and two compiled Astro files. `getSemanticDiagnostics` reported TS2322 for a number passed to the component's string `title` prop. `getCompletionsAtPosition` in its attributes returned `title` and `count`. This proves real cross-file type checking and completion, rather than filename/snippet suggestions. [TypeScript language-service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API).

Implementation details:

- Compile `.astro` documents asynchronously before updating the synchronous TypeScript host. Serialize/coalesce conversions and reject stale results by project identity and document version.
- Host project sources, generated `.astro.tsx`, standard TypeScript library declarations, `tsconfig.json`, and dependency declarations in memory. Preserve actual source paths so relative imports work. Parse JSONC config with TypeScript's config parser and respect `baseUrl`/`paths`.
- `convertToTSX` returns a v3 `map` object, `diagnostics`, and `metaRanges`. Frontmatter/body ranges are **generated TSX offsets**, not original Astro offsets. Offsets are UTF-16.
- Use `@jridgewell/trace-mapping` for bidirectional original/generated positions. Do not report diagnostics from generated helper code or blindly apply edits whose mappings are missing. Validate range endpoints and handle astral characters/newlines in tests.
- Register Monaco completion, hover, definition, and diagnostics adapters. Translate TypeScript spans back to Astro positions. Map completion replacement spans as well as cursor positions; auto-import insertion needs special handling of Astro frontmatter.
- Include the current draft overlay when compiling all project files. Clear worker state on logout, repository/branch switch, and project reload. Scope fetch/cache keys to repository and immutable commit SHA.
- Source discovery can use existing GitHub tree/blob access, with bounded files/bytes and explicit incomplete-index state. Do not execute the repository's JavaScript config, package scripts, or imported source.

The proof used deliberately small ambient Astro/JSX declarations. Production should use versioned Astro declarations, including `env.d.ts`, `astro-jsx.d.ts`, package exports, and transitive declaration imports. A fallback `Astro: any` does **not** provide meaningful Astro-global typing. Arbitrary npm dependencies and generated content collection types need separate resolution; expose unsupported/unavailable types honestly.

### Declaration bundle inspected

The npm tarball for `astro@7.3.3` was extracted to `/tmp/astro-intelligence-research/astro-package/package`. Its MIT license is at `LICENSE`. `astro-jsx.d.ts` is approximately 56 KiB and depends on `dist/types/public/elements.d.ts` and `dist/type-utils.d.ts`; elements additionally imports view-transition types. These are useful candidates for a small licensed declaration bundle. The JSX adapter must export `astroHTML.JSX` from `astro/jsx-runtime`, following the package's root `jsx-runtime.d.ts`. Global `Astro.ClientDirectives` also needs its standard client directive interface.

Full `env.d.ts` and `client.d.ts` are not standalone: they introduce references to Vite, content, assets, actions, and other package declarations. The complete `AstroGlobal` from `dist/types/public/context.d.ts` pulls cookies, actions, sessions, cache, runtime, and config declarations. An explicitly documented subset can accurately type `props`, `self`, `request`, `url`, `site`, `generator`, `params`, `response`, `redirect`, and slots without silently making all unimplemented APIs `any`. Such a subset is editor fallback support, not a claim of full version-matched Astro API parity. [Astro declarations](https://github.com/withastro/astro/tree/main/packages/astro).

### Mapping traps

The inspected compiler output maps some synthetic fragment/footer lines back to source position zero. Restrict diagnostic mapping to the generated frontmatter/body regions, and reject helper-only ranges. Do not blanket-suppress diagnostic codes: for example, unresolved imports can indicate either unavailable dependency declarations or a real misspelled project import.

Original-to-generated template mappings can be sparse. A nearest preceding segment plus arbitrary offset delta can point into unrelated generated text. Only interpolate when the copied source/generated substrings agree, and handle unmappable cursors explicitly. Apply the same checks to completion replacement spans and additional text edits. Auto-import insertion into new frontmatter needs dedicated handling.

## Why not import the latest server directly?

`@astrojs/language-server@2.17.0` exposes `getAstroLanguagePlugin` and `AstroVirtualCode` under `dist/core/index.js`, but that module imports Node path/package discovery. Its `@astrojs/astro2tsx@0.1.0` dependency reads a WASM file using `node:fs`, accesses `process.env`, and creates shared WebAssembly memory with 4,000 initial pages (approximately 250 MiB). Browser adaptation would need a different loader plus cross-origin isolation for shared memory. This is not suitable as an unexamined Vite import. [Astro language-server core](https://github.com/withastro/astro/blob/main/packages/language-tools/language-server/src/core/index.ts), [Rust conversion package](https://github.com/withastro/compiler-rs/tree/main/crates/astro2tsx).

`@astrojs/ts-plugin@1.10.12` is a tsserver plugin, not a Monaco extension; its main export assumes a TypeScript server host. Installing it alone does not enable project awareness in Monaco. [Astro TypeScript plugin](https://github.com/withastro/astro/tree/main/packages/language-tools/ts-plugin).

## Volar alternative

`@volar/monaco@2.4.28` provides `createTypeScriptWorkerLanguageService` from `@volar/monaco/worker`, and `registerProviders`, `activateMarkers`, and `activateAutoInsertion` from its main module. The worker factory accepts TypeScript, compiler options, language plugins, service plugins, an environment/virtual filesystem, URI conversion, and Monaco mirror models. This is a direct worker bridge; a WebSocket LSP backend is unnecessary. [Volar worker implementation](https://github.com/volarjs/volar.js/blob/master/packages/monaco/worker.ts).

Volar language plugins synchronously create virtual code. Astro's browser compiler is asynchronous, so a browser port must precompute conversions and return cached snapshots/mappings, then invalidate the language service after updates. A custom TypeScript worker is a smaller first implementation; Volar becomes attractive when adding embedded HTML/CSS services and broader editor features. Its provider bridge still needs integration testing against our Monaco 0.56 worker setup.

## Acceptance checks

1. A component's typed Props drive caller completions and incorrect-prop diagnostics.
2. Unsaved component edits update callers without publishing.
3. Relative imports and configured aliases resolve to the correct project file.
4. Hover and definition spans map accurately through frontmatter and template expressions.
5. Compiler and TypeScript errors have correct source ranges, including Unicode and incomplete syntax.
6. Missing dependency types and index limits are reported without misleading error floods.
7. Branch/repository changes and logout cannot leak stale suggestions or source data.
8. CSP permits self-hosted WASM compilation (`wasm-unsafe-eval` where required) and module workers without permitting arbitrary script evaluation.

## Implemented first version

`src/intelligence/project.ts` indexes the selected immutable GitHub snapshot through the existing authenticated read endpoints. It skips generated directories and symlinks. Open Monaco models overlay snapshot contents, so unsaved component changes affect caller types. The worker is replaced on project/branch/revision changes and disposed on logout. A 401 while indexing returns the UI to the login gate.

`project.worker.ts` uses browser `@astrojs/compiler@4.0.0`, TypeScript 5.9.3, and trace-mapping to provide component prop completions, type diagnostics and hover through the original Astro source. Synthetic footer diagnostics are excluded; copied source positions are mapped back. Relative imports and root tsconfig aliases work, including local extends files and vendored Astro tsconfig presets. No project JavaScript or configuration code is executed. Standard TypeScript libs and Astro 7.3.3 JSX declarations are bundled; private source is not sent to an external language service.

Browser tests verify wrong-prop diagnostics, component prop completions, relative/aliased imports, and clearing a caller error after changing an imported component's unsaved Props. The default Monaco editor and review mode additionally verify shared undo history, draft reopening, downloading, discard, and read-only symbolic links. Exactly one accessible repository now auto-opens on its default branch.

This is a scoped project-aware implementation, not full parity with the official Astro VS Code extension. External npm package types are not installed; complex Astro global APIs, framework files/integrations, content collection generated types, go-to-definition, formatting, and nested tsconfig projects remain future work. Root configuration is read at indexing time; reload the repository after configuration changes. Unresolved package imports may produce missing-type diagnostics. Limits are 200 source files, 100 traversed folders, 3 MB total source and 128 KB per file, reported in the developer console if exceeded (the status label was removed at the user’s request). Astro HTML/types presets are pinned to 7.3.3 rather than dynamically matching the repository's installed version.

Both engines run as same-origin static browser workers/WASM. CSP permits `wasm-unsafe-eval` for compilation but continues to disallow arbitrary inline/eval JavaScript. No paid backend or remote language-server service was introduced. Drafts remain memory-only and GitHub publishing is still separate.
