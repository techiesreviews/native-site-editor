# Recovered page-builder reviews — 2026-10-03

These findings were recovered from source-session logs, then palette findings were independently reviewed by Astra medium in the destination thread. They are not a new specification. Original worktree snapshots are preserved under `.scratch/t3-continuation/originals/`.

## Components — eight findings

Source: `/home/ubulex/.codex/sessions/2026/10/03/rollout-2026-10-03T10-46-30-01a100f1-8583-7e61-8f00-dc6932c16b12.jsonl`, with related reviews beginning `10-46-58` and `10-47-10`. Line numbers refer to reviewed source before fixes.

1. P1: `component-model.ts:666–670`, attribute editing corrupts single-quoted or unquoted attributes. `title='old'` to `O'Reilly` breaks quotation; a value containing spaces can inject additional attributes into an unquoted attribute.
2. `components.ts:951–954`, Make component can apply stale offsets after asynchronous path lookup. Its expected text is sampled from the newer source, so it does not detect the original selection changing.
3. `components.ts:657–658`, an image upload started for instance A can update instance B if selection changes while uploading.
4. `component-model.ts:938–942`, generated slot names collide for `title,title,title-2`, yielding two `title-2` slots.
5. `component-model.ts:832–838`, detach double-escapes source attribute entities: `A &amp; B` becomes `A &amp;amp; B`.
6. `component-model.ts:803,820`, detach changes text spacing: `Hello <em>world</em>!` becomes `Hello <em>world</em> !`.
7. `component-model.ts:696`, usage counts include literal tag strings inside script or textarea raw text.
8. `components.ts:432`, Used on cannot select an instance rendered through a nested component when the page has no literal instance tag.

## Canvas — seven findings

Source: `/home/ubulex/.codex/sessions/2026/10/03/rollout-2026-10-03T10-50-24-01a100f5-1524-7132-b57d-0b6e592a1014.jsonl`, with related reviews beginning `10-50-51` and `10-51-00`.

1. `canvas-source.ts:45`, a cursor on a parent's closing tag selects an implicitly closed child, e.g. the `<p>` in `<div><p>Hi</div>`.
2. `code-editor.ts:33`, dragging a text selection leaves a pending cursor timer that later changes canvas selection.
3. `native-preview.ts:695`, clear selection leaves a code-link timer that can restore the old selection.
4. `native-preview-runtime.js:2221`, parent-selection shortcuts intercept Ctrl/Cmd+Up in native inputs and textareas.
5. `canvas-bar.ts:177`, width-arrow adjustment reads the frame's intermediate animated width, then blur restores the wrong width.
6. `native-preview-runtime.js:2149`, long hover labels on a 390 px canvas cause horizontal overflow.
7. `native-preview-runtime.js:2266`, code navigation to the already-selected element returns before checking whether it must scroll into view.

## Palette — six confirmed findings

Source reviews begin `10-51-34`, `10-52-02`, and `10-52-11` under the same Codex session directory. Destination reviewer `review_palette` independently reproduced findings 1–5 and confirmed finding 6 statically.

1. P1: `command-palette.ts:308`, a command keeps stale source-edit closures while the palette remains open. An agent/source edit followed by Duplicate inserts a section inside paragraph text. A zero-length insertion has an empty expected string, so the existing check cannot reject stale offsets. Revalidate source revisions or rebuild commands against current source before execution.
2. P2: `command-palette.ts:127`, Go to includes mutating component commands. Ctrl+P, search `feature`, Enter chooses Add Feature block before Open. Go to must exclude mutations.
3. P2: `command-palette.ts:344–347`, delayed dialog close focus restoration steals focus from the field a command opens. New page was reproduced; Address and Ask agent share the path. Distinguish cancellation from execution.
4. P2: `native-preview-runtime.js:1622–1624`, keyboard shortcut detection does not recognize editing inside component shadow DOM. Typing `?` opens shortcut help; undo and Shift+Enter have the same risk. Check editing state and deepest composed target.
5. P2: `command-palette.ts:315–329`, IME composition ArrowDown, Page, and Tab are intercepted. Only Enter checks composition. Guard the handler before navigation.
6. P2: `main.ts:353–356`, login/session expiry removes the dialog without disposing global listeners, allowing shortcuts to call `showModal()` on a detached dialog. Dispose at unmount/login and ensure one listener after remount.

Existing palette validation: unit 6/6 passed; browser 4/5 passed on port 5226. The component-add test typed before palette readiness and failed with focus still on Heading level. This needs investigation, not a timeout increase. Its trace remains in the palette worktree's `.scratch/native-save/results/`.

## Destination review of components fix `7555457`

Astra medium reviewed the recovered fixes and held integration for four remaining P2 defects:

- `component-model.ts:843`: unconditional `out.trim()` still removes whitespace at slot boundaries. `<x-card> world </x-card>` with `<p>Hello<slot></slot>!</p>` detaches to `Helloworld!`; preserve inline and preformatted whitespace.
- `component-model.ts:858–861`: the limited entity decoder does not recognize `&eacute;`; class merging then escapes it again. `class="caf&eacute;"` becomes `class="caf&amp;eacute;"`. Preserve arbitrary valid named/numeric entities.
- `components.ts:683,728–735`: upload target capture checks only path, node, and tag. Deleting A while uploading lets same-tag B move into that node and receive A's image. Verify source revision or original instance identity before replacing it.
- `components.ts:434,458–461`: Used on still chooses holders using regular expressions, so a comment/script/textarea fake tag before a real nested holder prevents selection. Find real parsed elements and their offsets, including nested template dependencies.

The two attribute quote fixes, Make component source guard, generated slot uniqueness, ordinary raw-text usage count, normal nested usage, and the selection-before-structure repair passed review. Worker `grunt_components_current` is addressing the residuals before integration.

## Final disposition at 2026-10-03T10:00Z

- Canvas fixes are reviewed and merged in `dev@7df18dd`; palette fixes are reviewed and merged in `76f9a35`. Palette needed a further P1 fix: rebuilding search results after a source change refreshed the revision but retained stale control closures. `697f4ad` binds every control to its original source/path/generation/selection. `915e2e3` completes shadow-root typing behavior with browser coverage. Integrated units 431/431 and palette/canvas/selector browser checks 36/36 pass.
- Components `5480f` fixed all four residuals. A final follow-up found lost comment/default-slot whitespace; `21db1ee` preserves default text/comments while removing other slot elements, and prevents named slots from absorbing default whitespace. Chrome assignedNodes and exact detach probes both agree. Astra approved `21db1ee`; integration into dev is underway, not yet verified on root.
- Regression evidence includes safe single-quoted/unquoted attribute rewriting in components and ordinary edit-bar attributes, stale Make/upload guards, unique slots, arbitrary class entities, inline/pre whitespace, parsed usage/holder detection, and selection arriving before structure.

## Wave 2 site review — `434c5bc` plus recovered dirty wiring

Astra reproduced these findings before integration:

1. P1, `main.ts` operation adapter: Site settings precomputes whole-file edits, then `applyNativeOperation` awaits branch reads and only checks generation. A concurrent Monaco edit inserted immediately after Apply disappears when the settings batch finishes. Pass all expected input sources into the operation, compare after asynchronous reads and before any mutation, and reject the whole batch on mismatch. Navigation, effects and page settings need the same protection.
2. P2, `site-head.ts:decodeText`: the limited decoder turns unchanged `Caf&eacute; &copy;` into `Caf&amp;eacute; &amp;copy;` on upsert; navigation reordering has the same corruption. Decode full HTML entities with correct text/attribute semantics, and preserve unchanged raw source.
3. P2, social field linkage: each panel opening creates a new controller and preference map. Unchecking Use page title, applying and reopening returns the checkbox to checked when values are equal. Share preferences across controllers within the same repository/session, and clear them when scope changes.

The site browser Effects failure additionally requires suppressing edit-bar rebuilding for repeated unchanged text-selection reports. The current leaf commit does not include the four shared wiring files and is not a complete integrated feature.

## Wave 2 style review — `62d6aee`

Astra reproduced two P2 findings in the leaf modules:

1. A focused Display select changed block→flex→grid writes only flex. Its expected context is refreshed only on focus, so a successful first edit leaves the same control stale for the next edit. Refresh that control's snapshot after its own successful write, while continuing to reject unrelated external edits; cover select/preset changes without blur.
2. Editing `.card { color: red !important; color: blue; }` produces a normal `color: green`, losing the effective declaration's priority. Preserve `!important` based on the effective declaration, including both duplicate orders.

The same style worker is fixing these before integration. Host context/source guards and the shared canvas breakpoint connection remain required, as documented in `docs/page-builder/style.md`.

## Additional Make component review — 2026-10-03T10:16Z

Two further defects were confirmed while checking the final host boundary:

- P2, `components.ts:offerMake/makeComponent`: the dialog previews one source/plan but recomputes it from the current source after confirmation. Astra changed the hero to an unreviewed replacement while the modal was open; confirmation made a component from that replacement. Capture the original full source and repository revision, reject changes after the modal and file-creation awaits, and use the reviewed plan.
- P1, `main.ts:mountComponentTools.createFiles/removeFiles`: creation captures scope A, awaits a path lookup, and may save after switching to B because it lacks generation/scope checks. Subsequent cleanup uses current scope B and can remove its same-path draft. This control flow was statically confirmed. Use a creation receipt bound to the original scope and exact draft identities, verify after every asynchronous lookup, and refuse lookup failures. Cleanup must only reverse files created by that operation.

Assigned components leaf contract/tests to `grunt_components_current`, root host adapter/regression to the exclusive `grunt_workflow` integrator. No push is authorized until these fixes are reviewed and verified.
