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

Both Make defects are now closed: leaf `0c71ed3` plus root `36b6303` passed Astra review, 458 root units and 56 combined browser checks. The reviewed checkpoint was pushed as `e32ad1f` and deployed preview-only after fresh starter screenshots.

## Media review — `e878467`

Astra held integration for these reproduced P2 defects:

1. `media-references.ts` misses valid `image-set("/images/a.png" 1x)` and escaped `u\72l(/images/a.png)`; Chromium accepts both. Usage is empty, rename misses references, and Delete unused can offer a used image. Parse string image candidates and escaped identifiers; verify usage/rename/unused refusal.
2. The shared HTML source parser accepts `</scriptish>` as the end of script raw text. A fake image string after that prefix is then rewritten. Require a real closing-name delimiter in shared parser and the media style boundary matcher.
3. Optimization reads image A, then captures the current version B at Add time after the asset changes. Its final guard accepts B while importing encoded A. Bind a version receipt to blob/preview acquisition and carry it through the import request; refuse changed versions.
4. Recovered dirty host picker compares only the opening image tag. Deleting one of two identical images lets the next occupy its source index and pass the guard. Bind the original complete source and context, checking again after file restoration awaits.

The batch snapshot/guard/stage/guard/synchronous-commit ordering, metadata preservation, escaping and worker cancellation passed review. Atomic host adapter, original-scope rollback/byte ownership, one Undo and mutation browser verification are still required.


## Wave 2 host follow-up review — 2026-10-03T11:03Z

Independent GPT-6-Astra/medium review ran through local Codex CLI because managed slots stayed occupied by completed agents. Result: `.scratch/t3-continuation/review-wave2-cli-result.md`, log `.scratch/t3-continuation/review-wave2-cli.log`. Style host `decf9f1` approved, including guards, repeated edits, shared responsive controls and custom420px. Edit-bar identical-snapshot cache approved. Site host `fd9c8e3`, raw parser `86c9111`, media follow-up `3c16eaa` held for corrections:

1. P1: `changeNativeUrl` computes old edits, awaits `_redirects`, then captures operation guards too late. Carry original scope/epoch/full input snapshots through each await; no stale source overwrite or old move into new workspace.
2. P2: site image/favicon upload can leave origin draft/bytes after scope switch, then refresh current workspace. Original-scope owned receipt/cleanup and no current refresh are required. Root atomic media adapter remains unimplemented.
3. P2: raw-text closing delimiter uses JS whitespace (`\\s`) including NBSP/VT. Accept HTML whitespace only (`[\\t\\n\\f\\r />]`) in shared parser and media style matcher.
4. P2: escaped CSS URL function identifier consumes one whitespace code unit and misses CRLF as one escape terminator. Preserve source offsets; include usage/rename/unused refusal regressions.
5. P2: Effects post-operation `openAfter` can become stale, then caller mutates current stylesheet sets and selects old node. Revalidate original scope/epoch and retain selection only if it has not changed.

Assigned root host/parser owner `grunt_workflow`; that worker now additionally owns only media-references/tests leaf corrections in sol-media. Original dirty shared media files remain excluded. Do not describe all held slices as approved until follow-up review.


## Collections leaf review — 2026-10-03T11:09Z

Independent Astra/medium CLI read all eight files of `2eb563f`, held approval. Result `.scratch/t3-continuation/review-collections-cli-result.md`; source probes confirmed five defects, custom-field path was confirmed from implementation:

1. P1: bindings in script attributes remain allowed (`script[src={image}]` can create executable remote scripts). Forbid script bindings including empty collections.
2. P1: URL safety omits object[data], accepting data:text/html. Validate all relevant native URL contexts or forbid active-resource bindings.
3. P2: absent field named constructor reads inherited Object.prototype constructor and crashes substitution. Own-property reads only for substitution/conditions/sort.
4. P2: authoring template closing tag with extra attributes is accepted; validate complete template shell, not only inner markup.
5. P2: New custom field name accepts built-in title, replacing the page title; reject reserved names at this entry.
6. P2: date fallback selects first time element rather than first time[datetime].

Assigned original collections worker. Host automatic rebake/history still pending. That worker also exclusively owns code-editor redoable history-action extension and tests in its worktree; root main host remains exclusively with workflow worker. No leaf integration until fixes are independently reviewed.


## Native elements and media host final review — 2026-10-03T11:39Z

- Astra held elements e745e58 for six reproduced cases: complete HTML attribute entity decoding for URLs, fake href/sandbox/form attributes inside quotes, refresh-meta entity sanitization/index mismatch, transparent phrasing/interactive browser repairs, indentation changing textarea/pre contents, and native:* editor catalogue keys emitted as tags. Grunt corrected all as6220276 (28 focused/551 full units/types); independent final review now approves those corrections combined with the root shared attribute/parser fixes. Whole-document template/SVG restriction and URL-list rejection remain documented limits. Host insertion/slash/palette/Move integration is not complete.
- Astra approves collections4fe4c5f quoted fake datetime fix, and generichistory roota6fc64e/e4cc9eb plus Add1a3748b. Collections auto rebake/host lifecycle remains pending.
- Media hosta24c041 held for P1 newly mounted affected model after snapshot (receipt captured only initially mounted files; store may change while model remains old), plus P2 pure upload/metadata changing page during awaits loses history registration. Initial/Undo/Redo need complete model mounted/cache identity guards; bind history host before commit and handle registration false with exact-owned rollback. Root owner is fixing with a read-only model-state capture API and regression tests. Evidence585 units,17 media/history and41 Add/canvas/selector/palette browsers pass, but do not override reproduced review defects. Result `.scratch/t3-continuation/review-media-final-result.md`; reviewer session77742 finished and closed.


## Final candidate review — 2026-10-03T11:50Z

Astra independently approves settings67b8811/23a1f51. Mediaef41313 fixes previous newly mounted model and origin history host findings, but remains held for one P2: unconditional captureModels after host.refresh launders unrelated synchronous model changes. Probe observes unrelatedModelVersion2, undoAccepted true, remainingDrafts0. Preserve guards of models not changed by an owned source transition; only advance verified own transitions/cache eviction. Assigned exclusive root transaction/tests ownership to grunt_workflow; no release pending correction. Evidence589 units,19 media/history and18 settings browser passes does not override this finding. Reviewer CLI8782 finished/closed; result `.scratch/t3-continuation/review-release-result.md`.


## Narrow fixes checkpoint — 2026-10-03T11:57Z

Media proof P2 corrected asb32b18e; fifteen engine units and nineteen realMonaco/history browsers pass. Final narrow independent review active CLI83801. Realstarter browser found img-src policy blocked Blob objectURL thumbnails;5d81764 minimally adds blob: to production headers and test harness image directive only, with nine actual decode/media/transaction browser checks passing. No release approval claimed yet.


## Final narrow approval — 2026-10-03T11:58Z

Astra independently approves b32b18e/5d81764. Earlier probe now rejects Undo and preserves two drafts; Apply/Undo/Redo unrelated model changes retain old guards. Own source receipts advance before refresh and own cached eviction is guarded. Minimal Blob image policy corrections verified. Result `.scratch/t3-continuation/review-final-fix-result.md`; session83801 closed. Exact releasedf08701f types/build/593units pass. New12:01 annotated UI moves and component resize work are later local slices, not covered by this release approval.


## Latest annotation slices approved — 2026-10-03T12:09Z

Independent Astra approves2ab6e7a component pane andddf8f42 navigation placement. No new blocker. Final18 navigation/settings browser log supersedes intermediate locator failures; component meaningful browser passed by worker report. Result `.scratch/t3-continuation/review-annotations-result.md`, CLI39821 closed. These local commits are not pushed/deployed. Style resize/persistent Images pane remain pending; two setup-checklist tests still target the intentionally removed entry and require updated entry expectations. Safe source ownership handback recorded at top of main handoff.


## Resumed Style and CSS reviews — 2026-10-03T12:40Z

Style0be720e held: P1css-write.ts118 selector normalization merges quoted/escaped whitespace and can write another rule; P2main.ts453 Add class rebuilds existing attribute rather than preserving raw quote/entity/whitespace bytes. Assignedworkflow with counterexampleunits/raw source browser checks. CSS02dbc81 held: P2nested type-pseudo selector completion; P2comment/string masked whitespace completion; P2final multi-definition target revalidation. Assignedcomponents_current with lexer span/cancellation/identity regressions. Exact results `.scratch/t3-continuation/review-style-classes-result.md` and `review-css-intelligence-result.md`; both pinned Astra/mediumCLI sessionsfinished andclosed. Passing narrow tests before review do not clear these reproduced defects. Do not release held features.
## Resumed refinements — 2026-10-03T13:04Z

- `7cdc803` CSS intelligence leaf independently approved; all three earlier lexical/async target holds closed. Host adapter still being implemented by workflow worker.
- `3888746` independently approved: empty class values and all eight directional spacing search matches fixed, strict source/Undo and search/focus/fold regressions passed. This closes the remaining `46de812` and `52cb0c8` review holds. Review result `.scratch/t3-continuation/review-style-final-small-result.md`.
- Media `4e15c7d` held for stale detail form after external Undo/refresh; fixed `30f3fb0` independently approved. Refresh invalidates forms immediately, reloads current metadata, closes removed images and rejects delayed detail responses/detached Save. 48 units and 17 browser checks passed. Root cherries `8f6b5f0` / `13a6cba`; third Images tab host remains pending. Review result `.scratch/t3-continuation/review-media-final-result.md`.
- Isolated root `3888746` types and 606 full units passed. Actual-starter screenshots captured and displayed in destination thread using test browser after explicit T3 unavailable-host error; original starter unchanged. Screenshot paths and scope in style-consistency-review.md. This validates the reviewed Style checkpoint, not the dirty variable host or future grid/focal/element integrations.

## Claude review steering — 2026-10-03T13:28Z

User explicitly selected Claude Opus5.5 CLI for code/UX/design review. Pin actually verified (`modelUsage` includes claude-opus-5-5), lex-coding updated. Reviews48950/31898 completed with no permission denials; extracted result Markdown alongside JSON under .scratch/t3-continuation/claude-{style-review,elements-fix-review}*.

- `a9e1b7a` host/menu held: definition navigation fails to refresh linked CSS title/chips; no-workspace right-click suppresses native menu without replacement; external render removes focused variable menu without restoring source control. Shared-class scope copy is absent despite native shared style behavior. Workflow owns fixes after current Images mutation completes. Additional UI polish includes guarded Show in code, distinguish Add class/search, remove duplicate search clear affordance, readable variable provenance and keyboard behavior.
- Widget81957a1/a492252 leaf code approved within scope; integration not reviewed. UX fixes assigned original widget CLI owner: explicit custom-track replacement/count, visible invalid-gap errors, retry same value after rejected async writes, honest computed/out-of-range labels and trusted SVG preview support needed for actual starter assets. CLI10322 active in sol-style-widgets.
- Elementf38f183 held for P1: JavaScript whitespace in attribute scanner (`\s`) includes NBSP/VT/FEFF and reintroduces false selfclose/wrong preview path. Also require real HTML tag-name boundary despite copied shared parser dependency. Components worker will finish code-visible mutation then fix in sol-elements-compat; add units/real-browser cases. Root element compatibility remains unintegrated.

These are actionable findings; no release of held features. User also reported ghost/card placeholder clicks blocked by overlapping sections. Planner recovered missing item-grid geometry rescheduling on iframe scroll and overlay stacking interaction (card grid z19, section insertion z20); new Add refinement CLI owns narrowly bounded fixes/tests. Mixed collection-source union and user-requested Add-code-toggle removal are implementation scope, not invented review findings. Effects edit-bar removal is queued in completion-checklist.md.


### Claude Images host review — 2026-10-03T13:44Z
9a84cb1 HELD medium/P2: any external draft refresh rebuilds Images details and erases unsaved alt/tags and focus, including hidden tab. Fix assigned workflow after B checkpoint. Real geometry/control visibility regression required because top-layer popover bypasses document.scrollWidth. Lower followups duplicateoperationrefresh and Files/Images height parity. Result claude-images-host-review-result.md; exactmodelverified, no denials/errors. New clear actualstarter Images/variables screenshots displayed13:49Z (localcheckpoint, no releaseapproval). Batch independent leafreview CLI10122 now pending.
