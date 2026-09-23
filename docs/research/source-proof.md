# Source proof: a visual heading edit that preserves ordinary Astro source

Proof date: 2026-09-18. Ticket: [Prove a visual heading edit preserves an ordinary Astro project](../../.scratch/astro-editor-feasibility/issues/06-source-proof.md). Builds on the [preview proof](preview-proof.md).

## Verdict

**Feasible for literal text.** A click on a heading in the branch preview maps to the exact byte range of that text in its `.astro` file, the editor changes only those bytes, and everything else is rejected with a reason. The mapping is produced by the Astro compiler's own parser during the preview build and self-verified against the source bytes, so the compiler's position caveats did not surface for this starter. The live site is built without any of this and the project builds unchanged after deleting the editor's files.

What is **not** proven: editing text that comes from expressions, props, loops, content collections or framework components; attribute and CSS edits; and text containing `< > { } &`, which is refused rather than escaped for now.

## How it works

Preview builds only (`.astro-editor/astro.preview.config.mjs` = the project's config + one integration, `.astro-editor/annotate.mjs`):

1. A Vite `load` hook reads each `.astro` file and parses it with `@astrojs/compiler-rs` (the parser Astro 7 itself uses). Astro's own transform runs first among `enforce: "pre"` plugins, so annotation happens at load rather than transform time.
2. For every HTML element whose only meaningful child is one text node, and where `source.slice(start, end)` equals the parsed text, the start tag gets `data-ase="<file>:<start>:<end>"`. Elements containing `{expressions}` get `data-ase-reason="expression"`; text mixed with child elements gets `"mixed"`; unverifiable positions get `"unverified"`. Components (capitalised tags) are skipped, so framework islands are unmapped.
3. A small script is injected into every page. Only when the page is embedded (`window.parent !== window`) it outlines mapped elements, prevents link/button navigation, and `postMessage`s `{source: "astro-site-editor", type: "select" | "reject", loc, tag, text}` to the parent.

Editor (`src/components/preview-panel.ts`, `src/components/code-editor.ts`, `src/main.ts`):

4. The panel accepts messages only from the branch's preview origin and only while the preview's stamped revision equals the branch head. It opens the mapped file if needed and selects the range in Monaco after checking that the current draft's bytes at `[start, end)` equal the preview's text.
5. The element becomes `contenteditable` in place (since 2026-09-18 evening; the first version used an Apply bar). Every keystroke is sent as an `input` message with the previous and new text; the editor re-verifies the bytes and replaces exactly that range in Monaco, grouped into one undo step until Enter/blur (`commit`). Escape reverts. `& < > { }` are stored as entities so offsets stay in source units. The result is an ordinary browser draft. Publishing is the existing flow: commit → GitHub Actions → new preview about 76 s later.

Rejections shown to the user: expression-backed text, mixed content, unmapped elements (e.g. the Preact island's button), preview not at branch head, source bytes no longer matching (stale mapping), and text with `< > { } &`.

## Evidence

- **Real overlay, deployed preview** (`.scratch/preview-proof/overlay-check.mjs` against `main-astro-editor-starter.lexvd.workers.dev` at `4843c52`): clicking the home `h1` posted `src/pages/index.astro:247:282` with the exact text; the nav link posted `src/layouts/Layout.astro:408:413` (`About`) and did not navigate; the island's button posted `reject/unmapped`. `source.slice(247, 282)` in the repository is that heading.
- **Editor flow** (`tests/browser/visual-edit.spec.ts`, mocked API and a stand-in preview page using the same contract): expression text rejected with explanation; heading click opens `src/pages/index.astro` and selects exactly `A little space on the web.`; Apply with `<b>` refused; Apply with plain text changes only the `h1` line, leaves `<p>{title}</p>` untouched and marks the draft; a mapping whose bytes no longer match is refused.
- **Fidelity unchanged**: annotated preview vs. plain live build at `4843c52`, 6/6 route×viewport screenshots with 0 differing pixels; the island hydrates on both. Annotation adds attributes and one script, no layout.
- **Removable**: `git archive` of the starter with `.astro-editor/` and `.github/` deleted, `npm ci && npm run build` → 2 pages built, output contains no editor markers.
- **External edits**: the editor refuses edits while the preview revision differs from the branch head (shown in the panel), and refuses stale ranges after refresh. Overlapping drafts are still caught by the existing publish conflict check.

Not exercised live: the full click → Apply → Publish → rebuilt preview loop under a real GitHub session (needs Lex's login); each half was exercised separately.

## Limits and follow-ups

- **Scope of "literal"**: one text node per element. Headings with inline `<em>` or line breaks are "mixed". Attribute values (`alt`, `href`) and CSS are not mapped yet; the same parse gives attribute positions, so attributes are a natural next step.
- **Escaping**: new text is stored with `&amp; &lt; &gt; &#123; &#125;`; literals containing other entities (e.g. `&nbsp;`) stay read-only because they would not round-trip.
- **Whitespace**: the range is the raw text node including surrounding whitespace inside the tag; the edit bar shows it verbatim. Trimming would need care to keep the byte contract.
- **Components**: text inside `.astro` components is mapped to the component file, so editing a nav label in `Layout.astro` changes every page. The editor does not yet warn about that fan-out.
- **Markdown/MDX content** is untouched by this mapping.
- **The preview is a build**, so an applied edit is visible in Monaco immediately but in the preview only after publish + ~76 s. This is the draft-preview gap from the preview proof and belongs to ticket 07.
- **Security**: messages are origin-checked, but the alias origin is public by name, so anyone could load the preview; they cannot reach the editor session. The editor CSP still allows `https://*.workers.dev`.
