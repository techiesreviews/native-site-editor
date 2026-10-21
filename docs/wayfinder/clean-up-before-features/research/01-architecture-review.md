# Architecture review, re-checked on today's code

- Ticket: [Re-check the architecture review on today's code](../tickets/01-research-architecture-review.md)
- Read: `dev @ 89ac5e0e` (2026-10-22). Compared with the review's `dev @ edc0f76f` (2026-10-12), extracted side by side; 1,295 commits apart.
- Vocabulary: `mattpocock-skills:codebase-design` (module, interface, seam, depth, locality; Strong / Worth exploring / Speculative).
- Method: read and measure only, with `grep`/`wc`. No application code changed, no tests run. Agent Kit: `scripts/agents/kit doctor` passed 7/7 after linking the shared `node_modules` (the one failed check at first); `kit version` 89ac5e0e.

## What changed since 2026-10-12

- The sturdy-base week (guarded edit, preview protocol, Block move, SourceTree, Variant lookup, Edit component mode) was already on `edc0f76f`: the review read the code after it, not before. It is not a reason any candidate went away.
- Media manager (2026-10-13 to 10-21): 9 → 84 `src/page-builder/media-*.ts` modules (10,659 lines), plus `src/media-batch.ts`, `src/agent-media-actions.ts`.
- Durable Object reduction (2026-10-17 to 10-21): MCP reads and edits now run in the owner tab over one relay dispatch (`src/agent-transport.ts`, `src/agent-tools-*.ts`, `src/agent-records.ts`, `src/agent-owner.ts`; `shared/agent-edit.ts`, `shared/site-files.ts` moved out of the Worker).
- Tech-debt 08 (2026-10-17, `51b52689`) removed 32 thin forwarders from `main.ts`.
- Size: `src/main.ts` 5,833 → 5,650 lines. Non-test TypeScript in `src`, `shared`, `worker`: 65,782 → 90,576 lines. `src/components/native-preview-runtime.js` 3,732 → 4,118.

## `src/main.ts` regions today

Used for the overlap notes below (line numbers at `89ac5e0e`).

| Lines | Region |
| --- | --- |
| 318–696 | `mountWorkspace` |
| 696–1045 | component tools, `editorWorkspace` adapter (863–903), insert and rail typing |
| 1046–1800 | history and versions, code panes, linked styles |
| 1805–3060 | native site runtime: effective sources, preview updates, style/asset/shown-file loading, media text, base sources, `activateNativeSite`, text index, page titles |
| 3060–3330 | status, errors, file reads, login |
| 3332–3599 | setup checklist, `newDraftPaths`, tree state, explorer tabs |
| 3600–3831 | card grids, page creation (`planCreation`, `branchPathProblem`) |
| 3832–4416 | deleting, renaming, moving, duplicating files; `afterFileChanges`, `undoFileChanges` |
| 4417–4835 | agents: context, `makeAgentSiteActions`, agent commands, restore |
| 4836–5155 | `loadSnapshot`, boot guess, `chooseRepository` |
| 5156–5650 | setup wizard, repositories, account, lazy setup adapters |

## The eight candidates

### 1. Workspace session — still real, grown. **Strong** (top pick stands)

**What it is.** "Is the editor still on the same account, repository, branch and load as when this work began?" has no owner. `main.ts` keeps `let generation` (3069) and bumps it in four places (3233, 4848, 5029, 5336); `draftScope()` (1815), `setupScope()` (3338) and `mediaIdentity()` (2525) are three spellings of the same scope. The guarded edit's `Stamp` (`src/guarded-edit.ts:219–225`) and the `WorkspaceHost` interface (`src/editor-workspace.ts:44–50`: `generation()`, `setupScope()`, `draftScope()`) are the right seam, but everything outside guarded edits re-checks by hand.

**Today's size (baseline in brackets).**

- `epoch !== generation` in `main.ts`: 32 lines [30]. Lines 825, 1049, 1265, 1486, 1898, 1910, 1920, 2282, 2637, 2644, 3581, 3667, 3669, 3796, 4176, 4217, 4264, 4352, 4394, 4407, 4800, 4810, 4819, 4881, 4892, 4904, 4944, 5085, 5101, 5358, 5641, 5648.
- Any `generation === epoch` / `epoch !== generation` guard: 66 lines in 6 files [61 in 4]; `src/controllers/media-usage-controller.ts` (new) keeps a load counter of its own (20, 30, 59).
- Hand-written "still current?" predicates (`const current = () =>`, `isCurrent:` …): 58 [33], 17 of them in `main.ts`, plus `agent-menu.ts`, `boot-controller.ts`, `history-controller.ts`, `source-editor.ts`, media place modules.
- `draftScope` 96 lines in 11 files [78 in 6]; `setupScope` 42 in 4 [37 in 3]; `Stamp` 83 in 29 [57 in 16].
- The same-workspace comparison is written at least six ways, and they differ:
  - `src/draft-store.ts:974` compares the account case-insensitively;
  - `src/boot-memory.ts:92` case-insensitively and also requires `full_name`;
  - `src/main.ts:4472` skips the branch when it is empty;
  - `src/main.ts:5540` and `main.ts:2558` compare the account case-sensitively;
  - `src/controllers/save-publish-controller.ts:280` compares the repository by name, `:110` by id;
  - `src/components/agent-menu.ts:330, 471, 647, 684, 717` keep their own pinned-repository checks.
- "Generation" now also names the agent owner's receiving-tab fence (`src/agent-owner.ts:23`, `src/agent-transport.ts:145`, `src/agent-records.ts:321, 335, 582`): same word, different thing.

**Shape.** One Workspace session module owns the load counter, the scope (account, repository id and name, branch, version view) and one `same(a, b)` rule. It hands out `begin()` → a stamp with `holds()`/`changed()`, the one the guarded edit already uses. `WorkspaceHost.generation/setupScope/draftScope` become one `session` port; `mediaIdentity` and `setupScope` become derived keys. Deletion test: today, deleting `Stamp` would push its checks back into 29 files; the session would absorb the other 66 guards and 58 predicates the same way.

**Slice size.** L. Split into three: (a) the module with its memory adapter and suite, no callers; (b) `main.ts` guards and the `editorWorkspace` adapter; (c) controllers, `agent-menu.ts`, media modules, and a guard test that bans `generation` outside the module.

**Files touched.** `src/main.ts` (all regions; most guards sit in 1046–1800, 3600–4416 and 4836–5650), `src/editor-workspace.ts`, `src/guarded-edit.ts`, `src/draft-store.ts`, `src/boot-memory.ts`, `src/controllers/{setup-entry,history,command-palette,media-usage,save-publish,boot}-controller.ts`, `src/setup-actions.ts`, `src/media-batch.ts`, `src/components/agent-menu.ts`, `src/controllers/agent-controller.ts`.

**Overlaps.** Every other `main.ts` candidate; run it first. #2 takes the session as a port. #4 and N1 (agent tab checks at `src/agent-tools-edit.ts:33`, `agent-tools-read.ts:77`, `agent-tools-media.ts:34`) would read the session instead of comparing repo/branch/commit by hand.

**Questions for Lex.**

- *If you switch site or branch while something is still working (a save, images being added, an agent's change), what should happen to that work?* **Recommended:** it stops, nothing lands on the other site, and you see one message, "The site changed meanwhile. Try again." Today most places do this, but the wording and a few edge cases differ.
- *If GitHub shows your user name with different capital letters (Lex vs lex), is it still you?* **Recommended:** yes. Unsaved drafts already treat it that way; a few other checks don't, and could hide your drafts or the setup checklist.

### 2. Native site runtime — still real, same size, one more reading. **Strong**

**What it is.** The open site's state and rules live as about 40 `native*` module variables in `main.ts` (93 module-level `let`s and `Map`/`Set`s in total, unchanged since the review). They cover the effective source (editor model, then draft, then GitHub base), the file graph, base sources, styles, assets, unreadable files and the text index. `deactivateNative()` (`main.ts:2576–2603`) resets 22 of them by hand.

**Today's size.**

- Region `main.ts:1805–3060`, about 1,255 lines. At the baseline it was 1750–3014, about 1,264 lines: no change.
- The effective source is now read three ways:
  - `nativeEffectiveSource` (`main.ts:1971`);
  - `mediaTextSource` (`main.ts:2401`, new with the media manager). It is what the guarded edit reads (`main.ts:874`, `source: path => mediaTextSource(path)`);
  - `SiteFiles` (`shared/site-files.ts:37`), which overlays the tab's drafts on GitHub for agent reads inside the tab (`src/agent-tools-read.ts:86`). It is new in the tab since the Durable Object build.
- "Paths of new drafts" (`baseSha === null && !deleted`) is written 9 ways [7]:
  - plain: `main.ts:2694, 3441, 3457`;
  - also excluding moved files: `controllers/pages-controller.ts:460`, `agent-site.ts:449, 882`;
  - also excluding uploads and opaque files: `main.ts:1323, 4392`;
  - images only: `main.ts:2356`;
  - marked A or R: `shared/site-files.ts:66`.

  In all, `baseSha === null` appears in 41 lines [31].

**Shape.** A `NativeSite` runtime module (no DOM) owning the base sources, drafts overlay, file graph, style/asset/shown-file caches and `reset()`. Its small interface is `source(path)`, `textSource(path)` (the media variant), `files()`, `newDraftPaths({ moved, uploads })`, `shownPaths(route)`, `adoptSaved(result)`. Its ports are the session (#1), draft store, GitHub reads and the mounted editor. The preview adapter stays in `main.ts`. `SiteFiles` becomes a second adapter over the same overlay rule, not a third copy.

**Slice size.** L, about three slices: (a) the overlay rule and new-draft list as a pure module with tests, replacing the 9 copies; (b) move the state and `deactivateNative` into the runtime (main.ts −800 to −1,000 lines); (c) `SiteFiles` and `mediaTextSource` on the same rule.

**Files touched.** `src/main.ts:1805–3060` plus 3440–3480, 4006–4060, `src/file-changes.ts`, `src/controllers/pages-controller.ts`, `src/agent-site.ts`, `shared/site-files.ts`, `src/agent-tools-read.ts`, `src/editor-workspace.ts`, `src/media-batch.ts`.

**Overlaps.** #1 (needs the session; do #1 first). Tech-debt 01 (`main.ts` size): this is the biggest single cut. N1 (agent reads through `SiteFiles`). Tech-debt 02 (byte budget): moving code out of the entry chunk is roughly neutral unless the runtime loads lazily; measure with `kit size`.

**Questions for Lex.**

- *When an agent reads a page while you are typing in it, should it see your latest unsaved typing?* **Recommended:** yes, always exactly what your preview shows. Today the preview and the agent read through different code, so they could differ for a moment. After this they cannot.

### 3. Shared site-operation rules for MCP and the tab — still real, grown. **Strong**

**Today's size.**

- **Page address rule, three versions:**
  - New page from an agent: `worker/mcp.ts:410`, `^[a-z0-9][a-z0-9-]{0,79}$` (lowercase, digits, dashes, at most 80).
  - New page in the tab: `src/native-pages.ts:190`, `^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i`. It allows capitals, dots and underscores, while its own error (`:202`) says "Use letters, digits and -".
  - Change URL: `src/native-page-moves.ts:79–131` has no character rule at all.
  - Titles turn into addresses through `slugify` (`native-pages.ts:160`), which already writes the strict form.
- **"X is a file, so nothing can go in it", 11 code sites [6]:**
  - `main.ts:3725, 3774, 4524`;
  - `controllers/file-operation-checks.ts:56`, `native-page-moves.ts:131`, `shared/agent-edit.ts:120`, `setup-actions.ts:344`;
  - new with media: `page-builder/media-workspace.ts:421, 462, 545, 712`, `page-builder/replace-everywhere.ts:154` ("…cannot contain uploaded files").
- **make_component refusals, still twice:** `shared/agent-edit.ts:189–201` (valid tag, taken, main/body, already a component) and `page-builder/component-model.ts:1099, 1462–1463`. Both now run in the same tab (see N1).
- **Path validity:** `shared/site-files.ts:233` (`writablePathProblem`) runs in the Worker (`worker/mcp.ts:335–621`, 14 calls) and again in the tab (`shared/agent-edit.ts:90–169`). The Files tab uses its own checks (`main.ts:3765` `branchPathProblem`, `file-operation-checks.ts`).

**Shape.** A `shared/site-paths.ts` (or a widened `shared/native-routes.ts`) module: `pageAddressProblem(slug)`, `parentProblem(path, exists)`, `writablePathProblem`, and the make-component refusals as `makeComponentProblem(outline, tag, taken)`. Every caller (Worker, agent prepare, Pages tab, Change URL, Files tab, media) asks it. One wording per refusal.

**Slice size.** M (one slice, maybe two: page address plus refusals, then the "is a file" family).

**Files touched.** `worker/mcp.ts`, `shared/agent-edit.ts`, `shared/site-files.ts`, `src/native-pages.ts`, `src/native-page-moves.ts`, `src/controllers/file-operation-checks.ts`, `src/setup-actions.ts`, `src/page-builder/media-workspace.ts`, `src/page-builder/replace-everywhere.ts`, `src/page-builder/component-model.ts`, `src/main.ts` (3725, 3774, 4524).

**Overlaps.** `main.ts` regions 3600–3831 and 3832–4416 (three lines); N1 (both edit `shared/agent-edit.ts`); #4. Safe beside #1(a) and #2(a), which add files only.

**Questions for Lex.**

- *Should page addresses be strict: lowercase letters, digits and dashes only, at most 80 characters?* **Recommended:** yes, for every new address, whether made in the Pages tab, by Change URL or by an agent. Existing pages keep their addresses until someone changes them. Today the Pages tab accepts `About_Us.v2`, agents can't make it, and Change URL accepts anything.
- *When something can't go in a folder because a file has that name, should every place say it the same way?* **Recommended:** yes, "X is a file, so nothing can go in it." (Lex need not answer; listed so the wording change is no surprise.)

### 4. Agent relay module — rewritten by the Durable Object build, still real in a new shape. **Worth exploring** (leaning Strong)

**What changed.**

- The old `any`-typed protocol over `worker/app.ts` is mostly gone. `any` is left in `worker/agent-operations.ts:22, 32`, `worker/agent-store.ts:26`, `shared/agent-requests.ts:12, 67`, `worker/agent-context.ts:421`, `worker/mcp.ts:43`; the hub `action` is still untyped.
- The agent area is now about 11,200 lines across 40 files (`worker/agent-*`, `worker/app.ts`, `worker/mcp.ts`, `src/agent-*`, `src/components/agent-*`, `shared/agent*`). The baseline subset was about 4,500.

**Today's problem: no operation table.** One agent tool is spelled in 6–7 files:

- the MCP registration and checks in `worker/mcp.ts`;
- the union in `shared/agent.ts:15–30`;
- argument checks in `shared/agent-edit.ts` or `shared/agent-media-args.ts`;
- the admission set in `src/agent-transport.ts:20`;
- the atomic list in `src/agent-site.ts:47`;
- the executor registry in `src/agent-tools-edit.ts:132–135`;
- the executor case in `src/agent-site.ts` `applySiteCommand`.

`create_page` appears in 6 of them, `make_component` and `move_section` in 6, `describe_media` in 7. Adding or changing one tool means editing all of them, and nothing checks that the lists agree.

**Shape.** One operation table in `shared/` (name, args schema, atomic or not, media or text, read or edit). The four lists are derived from it, and the Worker registers MCP tools from it. The relay (`worker/agent-relay.ts`) and transport stay as they are: the build just shipped (`3e562baf`, 2026-10-21) and its fencing is fresh.

**Slice size.** M.

**Files touched.** `shared/agent.ts`, `shared/agent-edit.ts`, `shared/agent-media-args.ts`, `worker/mcp.ts`, `worker/agent-operations.ts`, `worker/agent-store.ts`, `shared/agent-requests.ts`, `src/agent-transport.ts`, `src/agent-site.ts`, `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`.

**Overlaps.** N1 (same files; do them together or back to back), #3 (refusals), `main.ts` 4417–4835 (only if `makeAgentSiteActions` changes; the table itself does not need it).

**Questions for Lex.** None a user would notice. Agents see the same tools and answers.

### 5. One Page Structure model — still real, unchanged. **Worth exploring**

**Today's size.** `src/components/page-structure.ts` 1,356 lines [1,358]; `src/controllers/page-structure-controller.ts` 876 [852]. `row()` (`page-structure.ts:587`) still decides meaning while it paints. It fills `movable`, `inMain`, `outerRows`, `templateRoots`, `framedRows` and `rootAlias` as side effects of drawing a row (587–640), and `rowText` (317) reads `outerRows`/`framedRows` that only exist after painting.

The heading rules are now at least five, and they disagree about which heading names a section:

- the runtime label: any descendant, then the shadow root (`native-preview-runtime.js:1023–1024`);
- the runtime's `ownHeading`: first heading not inside a nested section (`native-preview-runtime.js:1695, 1728–1731`);
- agent `get_page`: any descendant, no shadow root (`src/agent-site.ts:227, 280`);
- the level fix: a direct child, or inside a direct `header`/`hgroup` (`src/page-builder/native-operations.ts:459, 477`);
- "has a heading": a regex on the source (`page-structure-controller.ts:571`).

`firstHeadingText` (`native-pages.ts:136`, first `<h1>` only) is the page-title fallback, a different question.

**Shape.** A pure Page Structure model (`structureModel(items, mode)` → rows with movable/outer/framed/template flags and text targets) tested without DOM. The view paints it. One `sectionHeading` rule in `src/page-builder/rules/` over `RuleView`, bundled into the runtime as the sturdy-base rules are.

**Slice size.** M (model plus view switch); the heading rule is S on its own and could go first.

**Files touched.** `src/components/page-structure.ts`, `src/controllers/page-structure-controller.ts`, `src/components/native-preview-runtime.js`, `src/agent-site.ts`, `src/page-builder/native-operations.ts`, new `src/page-builder/rules/section-heading.ts`.

**Overlaps.** No `main.ts`. #6 (both add a rule and touch the runtime). #4/N1 only through `agent-site.ts` (a different function).

**Questions for Lex.**

- *Which heading names a section in Page Structure, in what agents read, and in "put headings in order"?* **Recommended:** the section's own first heading, not one inside a card or a nested section; for a component, the first heading of its template. Some section names in Page Structure or in agent answers may change to match.

### 6. Optional-slot rule in `rules/` over RuleView — still real, unchanged. **Worth exploring**

**Today's size.** Three copies of "hide an empty optional part":

- the preview runtime (DOM): `applyEmptyRules` with `slotHasContent`/`slotConditionUnmet`/`ownText` (`native-preview-runtime.js:2630–2672`);
- the editor's source reading: `shownSlots` (`src/page-builder/component-model.ts:500–530`), whose header comment (5–17) describes the shared rule in prose;
- the starter's loader, `hideEmpty`. It stays a copy per ADR 0001 (the site carries its own loader), now in `~/Projects/native-site-editor-starter/components/components.js:146`, with `fixtures/native-starter` frozen.

The runtime has been a bundle since sturdy-base slice 20, so it can now import a rule from `src/page-builder/rules/` like the card and item rules do.

**Shape.** `rules/empty-parts.ts` over `RuleView` (`rules/tree.ts`), used by the runtime's DOM view and the component model's source view; a parity test runs the starter's `hideEmpty` on the fixtures against it.

**Slice size.** S–M.

**Files touched.** `src/components/native-preview-runtime.js`, `src/page-builder/component-model.ts`, new `src/page-builder/rules/empty-parts.ts`, a parity test over `fixtures/native-starter`.

**Overlaps.** #5 (runtime, rules folder); none with `main.ts`.

**Questions for Lex.**

- *When the live site and the editor's preview disagree about hiding an empty optional part, which wins?* **Recommended:** the live site, because "what you edit is what ships" (ADR 0001). The editor follows the starter's loader, and a test fails if they ever disagree.

### 7. Strict outline as a SourceTree adapter — unchanged. **Speculative: park**

`src/page-builder/native-operations.ts` (609 lines) and `src/page-builder/source-tree.ts` (316) are byte-for-byte the same length as at the baseline; nothing new varies across the seam. With only one caller family (insert, move, tree-drop in `block-insert.ts`, `block-move.ts`, `block-move-rules.ts`, `tree-drop.ts`) there is one adapter, so the seam would be hypothetical.

**Question for Lex.** *Park it?* **Recommended:** yes. Revisit only if a bug shows the outline and the cards reading a page differently.

### 8. Delete pass-throughs — mostly fixed. **Housekeeping**

Tech-debt 08 (`51b52689`) removed 32 forwarders from `main.ts`. What is left:

- `src/controllers/cards-controller.ts` (37 lines) still only forwards to `createCards`. Deleting it moves complexity nowhere: `main.ts` would hold `createCards(ports)` and the preview handlers directly.
- One-line forwarders in `main.ts`: `updatePreview` (3016 → `updateNativePreview`), `buildAgentSiteContext` (4454 → `agentSiteHost.context`), `nativeEditableSource` (751), `openExplorer` (3062).
- The lazy setup adapters (5622–5650) stay on purpose (each awaits an import and re-checks the generation; they fold into #1).

**Slice size.** S. **Files:** `src/controllers/cards-controller.ts` (+ its test), `src/main.ts` 3600–3831 and the four lines above. **Overlaps:** #2 (`updatePreview`, `nativeEditableSource` sit in its region; let #2 take them). **Questions for Lex:** none.

## New candidates

### N1. Agent edits are prepared twice in the same tab — new since the Durable Object build. **Worth exploring**

`src/agent-tools-edit.ts` first runs `prepareAgentEdit` (`shared/agent-edit.ts:83`, 254 lines). That check reads a snapshot `EditorContext` through `SiteFiles` (outline hash, refusals, parent-is-file, write checks). Then the command runs `applySiteCommand` (`src/agent-site.ts`, 1,026 lines), which opens the page, re-reads the outline and refuses again against the live editor (for example `agent-site.ts:714–720` after `agent-edit.ts:189–201`).

The first layer was the Worker's pre-check before tickets 15–16 moved it into the tab. Now both layers run in the tab, over two views of the same files. `worker/mcp.ts` still runs `writablePathProblem` before forwarding as well (three layers for a path).

**Shape.** One tab-side command path: the table from #4 names each operation's checks once, and they run against the live workspace (#2) under one session stamp (#1). The Worker keeps only shape checks (schema, size).

**Size.** M–L. **Files:** `shared/agent-edit.ts`, `shared/site-files.ts`, `src/agent-tools-edit.ts`, `src/agent-site.ts`, `worker/mcp.ts`. **Overlaps:** #3, #4 (do them together or right after), #2 (`SiteFiles`). **Questions for Lex:** none visible; an agent's refusal wording may change slightly.

### Not new candidates, noted

- **Media manager.** 84 small modules, mostly focused and well named in the code map. `media-workspace.ts` (1,135 lines) is the one large one. Its folder checks join #3; its scope checks (`mediaIdentity`, `media-files-adding-runs.ts`) join #1. The media batch (`src/media-batch.ts`) is its own atomic step beside the guarded edit's commit (`src/guarded-edit/commit.ts`). It holds a `Stamp`, so it already sits on the guarded-edit seam; merging the two commit paths is Speculative and not worth a slice now.
- **`mountWorkspace`** (`main.ts:318–696`, about 380 lines) and the controller port wiring are tech-debt 01's territory, not a deepening candidate.

## Recommended order

One candidate at a time, each merged and checked before the next (Lex, 2026-10-16).

1. **#1 Workspace session** (Strong, L, 3 slices). Every other `main.ts` change gets simpler once there is one stamp.
2. **#2 Native site runtime** (Strong, L, 3 slices). Takes #1's session; absorbs #8's `main.ts` one-liners; biggest cut to `main.ts` size (tech-debt 01).
3. **#3 Shared site-operation rules** (Strong, M). Few `main.ts` lines. If the plan allows two at once, it is the safest to run beside #2, since they share three `main.ts` lines in other regions.
4. **#4 Agent operation table, then N1 one agent command path** (Worth exploring, M + M–L), back to back on the same files, after #3 has moved the refusals. Wait at least until the Durable Object rollout's production checks are done.
5. **#6 Optional-slot rule** (Worth exploring, S–M). No `main.ts`.
6. **#5 Page Structure model** (Worth exploring, M); its heading rule could come first as an S slice.
7. **#8 cards-controller** (S), whenever a gap appears.
8. **#7** parked.

## Behaviour questions for Lex (for ticket 05)

| # | Question | Recommended answer |
| --- | --- | --- |
| 1 | If you switch site or branch while something is still working, what happens to that work? | It stops, nothing lands on the other site, one message: "The site changed meanwhile. Try again." |
| 1 | Is "Lex" the same GitHub account as "lex"? | Yes, everywhere. |
| 2 | Should an agent always see your latest unsaved typing? | Yes, exactly what your preview shows. |
| 3 | Strict page addresses (lowercase letters, digits, dashes, at most 80) for every new address, in the Pages tab, Change URL and agents? | Yes; existing pages keep theirs. |
| 5 | Which heading names a section? | The section's own first heading (not one inside a card or nested section); a component's from its template. |
| 6 | When the live site and the editor disagree about hiding an empty optional part, which wins? | The live site; a test keeps the editor in step. |
| 7 | Park "strict outline as a SourceTree adapter"? | Yes. |
