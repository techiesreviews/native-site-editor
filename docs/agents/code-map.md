# Code map

Start with the concern, then read its entry symbol. Domain words: [CONTEXT.md](../../CONTEXT.md).
Host state, transactions and DOM mounting live in main.ts; controllers receive live ports.
Historical searches: `applyNativeOperation` is gone; use guarded edits and native source transforms below.
For historical src/components.ts searches, start at the Component tools row.

## Where things live

Each file is followed by its declared entry symbols. Styles, fixtures, scripts and anonymous test suites use the path itself as the entry.

### Editor UI and editing preview

| Concern | Files and entry symbols |
| --- | --- |
| Workspace mounting and lazy panels | `src/main.ts` — `mountWorkspace`, `lazyModule`; `src/app-store.ts` — `createAppStore` |
| Source editor, drafts and Undo/Redo | `src/components/source-editor.ts` — `mountSourceEditor`; `src/draft-store.ts` — `createDraftStore`; `src/drafts.ts` — `draftStore` |
| Monaco loading and code panes | `src/controllers/code-panes-controller.ts` — `createCodePanesController`; `src/components/code-editor.ts` — `mountCodeEditor` |
| Pages explorer and page operations | `src/controllers/pages-controller.ts` — `createPagesController`; `src/components/pages-tree.ts` — `createPagesTree`; `src/native-page-moves.ts` — `planPageMove` |
| Files explorer and file operations | `src/controllers/files-tree-controller.ts` — `createFilesTreeController`; `src/controllers/file-operations-controller.ts` — `createFileOperationsController`; `src/file-changes.ts` — `listChanges` |
| Save to GitHub and change status UI | `src/controllers/save-publish-controller.ts` — `createSavePublishController`; `src/deploy-status.ts` — `setDeployStatus` |
| History and restoring saved versions | `src/controllers/history-controller.ts` — `createHistoryController`; `src/components/commit-history.ts` — `createCommitHistory` |
| Repository opening and first paint | `src/controllers/boot-controller.ts` — `createBootController`; `src/repository-loading.ts` — `RepositoryIndex`; `src/native-boot.ts` — `nativeShownFiles`; `src/main.ts` — `activateNativeSite` |
| Setup wizard and Get started | `src/controllers/setup-entry-controller.ts` — `createSetupEntryController`; `src/components/setup-wizard.ts` — `createSetupWizard`; `src/setup-wizard.ts` — `readWizard` |
| Setup checklist and starting point | `src/controllers/setup-checklist-controller.ts` — `createSetupChecklistController`; `shared/starting-point.ts` — `blankSiteFiles`; `src/setup-actions.ts` — `createSetupActions` |
| Settings dialog actions | `src/native-settings.ts` — `createNativeSettings` |
| On-demand palette catalog | `src/page-builder/palette-catalog.ts` — `nativePaletteCommands` |
| Command palette | `src/controllers/command-palette-controller.ts` — `createCommandPaletteController` |
| Editor colours and surfaces | `src/style.css`; `src/theme.css`; `src/utilities.css` |
| Effective sources, routes and preview updates | `src/main.ts` — `nativeSources`, `nativeEffectiveSource`, `updateNativePreviewSources` |
| Preview host, selection and edit bar | `src/components/native-preview.ts` — `createNativePreview`; `src/controllers/preview-selection-controller.ts` — `createPreviewSelectionController` |
| Frame rendering, typing and host messages | `src/components/native-preview-runtime.js` — `apply`, `emit`, `renderPage` |
| Frame protocol validation and freshness | `src/components/preview-protocol.ts` — `FrameMessage`, `HostMessage`, `readFrameMessage`, `FRESHNESS`; `src/components/preview-wire.ts` — `FRAME_SOURCE`, `HOST_SOURCE` |
| Frame message transport and request/reply | `src/components/preview-link.ts` — `createPreviewLink`, `iframeFramePort`; `src/components/preview-frame-state.ts` — `createPreviewFrameState` |
| Edit bar controls and Page Structure | `src/controllers/page-structure-controller.ts` — `createPageStructureController`, `renderNativeEditBar`; `src/components/edit-bar.ts` — `createEditBar`, `EditBarControl`; `src/components/page-structure.ts` — `createPageStructure` |
| Agent connection, requests and pins | `src/controllers/agent-controller.ts` — `createAgentController`; `src/agent-site-host.ts` — `createAgentSiteHost`; `src/agent-site.ts` — `buildAgentContext`, `applySiteCommand`; `src/components/agent-pins.ts` — `createAgentPins` |

### Shared rules and guarded edits

| Concern | Files and entry symbols |
| --- | --- |
| Native site conventions and page addresses | `shared/native-project.ts` — `resolveNativeProject`; `shared/native-routes.ts` — `deriveNativeRoutes` |
| Source spelling and element locations | `shared/html-source.ts` — `startTags`; `src/native-source-location.ts` — `locateNativeElementRange` |
| Shared source/DOM tree rules | `src/page-builder/rules/tree.ts` — `RuleView`, `domView`; `src/page-builder/rules/movable.ts` — `movableBlock`, `sealed` |
| Card, items-slot and repeated-item rules | `src/page-builder/rules/cards.ts` — `isItemsSlot`; `src/page-builder/rules/items.ts` — `itemKind`, `repeatedRun` |
| Text, page band and template block boundaries | `src/page-builder/rules/text-level.ts` — `TEXT_LINE_TAGS`, `INLINE_FORMATTING`; `src/page-builder/rules/page-bands.ts` — `isPageHeaderFooter`; `src/page-builder/rules/template-blocks.ts` — `TEMPLATE_BLOCK_TAGS` |
| Canvas gesture decisions | `src/page-builder/rules/canvas-gesture.ts` — `canvasGesture` |
| Variants, tones and CSS imports | `shared/variants.ts` — `componentVariants`, `siteVariants`; `shared/variant-lookup.ts` — `variantLookup`; `shared/tone.ts` — `brandSurface`; `shared/css-imports.ts` — `expandStyleImports` |
| Protected GitHub paths | `shared/protected-paths.ts` — `touchesGithubConfig`, `splitProtectedEdits` |
| Agent command and request contracts | `shared/agent.ts` — `AgentCommand`, `AgentRequest`; `shared/types.ts` — `EditorContext`, `Snapshot` |
| Guarded read proofs and edit plans | `src/guarded-edit.ts` — `createGuardedEdits`, `Reads`, `Planned`; `src/main.ts` — `guardedEdits` |
| Atomic draft commit and Undo/Redo receipts | `src/guarded-edit/commit.ts` — `createCommit`; `src/editor-workspace.ts` — `createEditorWorkspace` |

### Page builder and media manager

| Concern | Files and entry symbols |
| --- | --- |
| Strict source tree and source transforms | `src/page-builder/source-tree.ts` — `parseSource`, `readSource`; `src/page-builder/native-operations.ts` — `nativeMarkupInsertEdit`, `nativeOutline` |
| Block insertion and Add panel | `src/controllers/block-insert-controller.ts` — `createBlockInsertController`; `src/page-builder/block-insert.ts` — `clickTarget`, `blockMarkup`; `src/page-builder/add-panel.ts` — `createAddPanel` |
| Block move, canvas drag and tree drop | `src/page-builder/block-move.ts` — `createBlockMoves`; `src/page-builder/block-drag.ts` — `createBlockDrag`; `src/page-builder/block-drag-session.ts` — `createBlockDragSession`; `src/page-builder/tree-drop.ts` — `createStructureDrop` |
| Component tools and Edit component mode | `src/page-builder/components.ts` — `createComponentTools`; `src/page-builder/component-mode.ts` — `createComponentMode`; `src/page-builder/edit-component-mode.ts` — `createEditComponentMode` |
| Component slots, make, rename and removal plans | `src/page-builder/component-model.ts` — `templateSlots`, `makeComponentPlan`; `src/page-builder/component-plans.ts` — `slotChipPlan`, `makeComponentStep`, `componentRenameStep`, `templateRemovalPlan` |
| Component loader installation | `src/page-builder/component-loader.ts` — `componentLoaderPlan`; `src/main.ts` — `nativeComponentLoaderPlan` |
| Cards and linked pages | `src/controllers/cards-controller.ts` — `createCardsController`; `src/page-builder/cards.ts` — `createCards`; `src/page-builder/card-source.ts` — `gridAt` |
| Page details, site settings and navigation | `src/page-builder/site-head.ts` — `withPageField`; `src/page-builder/site-identity.ts` — `readSiteIdentity`; `src/page-builder/site-navigation.ts` — `readNavigation`, `editNavigation`; `src/main.ts` — `openNativeSiteSettings` |
| Linked style rules and cascade | `src/styles-index.ts` — `findStyleRulesInSources`; `src/style-cascade.ts` — `resolveSelectedRules`; `src/main.ts` — `linkNativeStyles` |
| Source editor CSS and variant suggestions | `src/page-builder/css-intelligence.ts` — `cssVariableCompletion`; `src/page-builder/variant-intelligence.ts` — `variantSuggestions`; `src/page-builder/variant-fields.ts` — `variantFields` |
| Media manager and draft batches | `src/controllers/media-controller.ts` — `createMediaController`; `src/page-builder/media-workspace.ts` — `createMediaWorkspace`; `src/main.ts` — `applyMediaBatch` |
| Media records, migration and serialization | `shared/media-records.ts` — `parseMediaRecords`, `serializeMediaRecords`, `renameMediaRecord`, `removeMediaRecords` |
| Media descriptions, Decorative and by-agent marks | `src/page-builder/media-descriptions.ts` — `placeDescriptionState`, `descriptionPlaceEdits`, `setMediaPlaceDecorative`, `confirmMediaDescription` |
| Media uploads, optimise and responsive copies | `src/uploads.ts` — `addUpload`; `src/page-builder/guarded-upload.ts` — `addGuardedUpload`; `src/page-builder/media-optimise.ts` — `optimiseMedia` |

### Worker, test seams and agent scripts

| Concern | Files and entry symbols |
| --- | --- |
| Worker request routing and durable sessions | `worker/app.ts` — `handle`; `worker/index.ts` — `SessionStore` |
| GitHub reads, blobs and saved history | `worker/github.ts` — `GitHub`; `worker/blobs.ts` — `uploadBlob`; `worker/history.ts` — `history`, `restore` |
| Save to GitHub, host publishing and change status | `worker/publish.ts` — `publish`; `worker/hosts.ts` — `publishHosts`; `worker/change-status.ts` — `changeStatus`; `shared/hosting.ts` — `pipelineFiles` |
| Owner setup and agent OAuth | `worker/owner-setup.ts` — `configuredApp`; `worker/oauth.ts` — `handleOAuth`; `worker/oauth-registration.ts` — `admitRegistration` |
| Agent MCP tools, grants and requests | `worker/mcp.ts` — `createSiteServer`, `handleMcp`; `worker/agent-context.ts` — `createGrant`; `worker/agent-operations.ts` — `agentOperation`; `worker/agent-requests.ts` — `requestOperation`; `worker/agent-store.ts` — `hubOperation` |
| Starting point fetch and first commit | `worker/starter.ts` — `starterProvider`; `worker/first-commit.ts` — `commitStartingPoint` |
| Native-save server: real Worker, fake GitHub and sessions | `tests/native-save/server.ts` — `githubFetch`, `buildInitialGit`, `env`; `tests/native-save/fixture-contract.ts` — `fixtureKind` |
| Native-save draft and save helpers | `tests/native-save/drafts.ts` — `storedDrafts`, `effectiveSource`; `tests/native-save/publish.ts` — `showPublish` |
| Native-save site fixtures | `fixtures/native-starter/`; `fixtures/native-routing/`; `fixtures/native-conventions/`; `fixtures/native-cards/`; `fixtures/native-variants/`; `fixtures/cascade/` |
| Guarded edit, frame, cards and source-tree fakes | `tests/fakes/memory-workspace.ts` — `createMemoryWorkspace`; `tests/fakes/fake-frame.ts` — `createFakeFrame`; `tests/fakes/cards-fixture.ts` — `cardsFixture`; `tests/fakes/source-tree-contract.ts` — `contractCases` |
| Frame transport and shared-rule guards | `tests/frame-guard.test.ts` |
| Block move orchestration guard | `tests/block-move-guard.test.ts` |
| Edit component mode ownership guard | `tests/component-mode-guard.test.ts` |
| Card source-tree read guard | `tests/card-tree-guard.test.ts` |
| Focused ports, exclusive timing and suite shards | `scripts/agents/port.sh`; `scripts/agents/timing.sh`; `scripts/agents/full-suite.sh`; `scripts/agents/suite-summary.mjs` |
| Cold-load measurement, worktrees and read-only reviews | `scripts/agents/cold.sh`; `scripts/agents/worktree.sh`; `scripts/agents/review.sh` |

## src/main.ts sections

Ranges are approximate navigation hints, measured in this worktree; search the symbols after edits.

| Section, in source order | Approximate lines | Key functions / wiring |
| --- | --- | --- |
| Imports, host handles, lazy loading, source pane | 1–269 | lazyModule, openCodeEditor, nativeHistorySession |
| Workspace DOM and command palette | 270–655 | mountWorkspace, paletteController |
| Component tools and section insertion | 656–799 | mountComponentTools, nativeElementAddPoint, nativeComponentLoaderPlan, insertNativeComponent |
| Guarded edit adapter, block move / drag / insert | 800–946 | guardedEdits, blockMoves, dragPageBlock, finishRailTyping |
| History and saved-version viewing | 947–1100 | openFileVersion, viewVersion, restoreVersion |
| Linked styles, CSS rule chips and preview selection | 1101–1494 | syncLinkedStyles, openSecondary, linkNativeStyles, previewSelection |
| Variant reads and CSS workspace | 1495–1562 | readVariantFiles, nativeCssWorkspace |
| Page Structure and edit-bar controller ports | 1563–1715 | pageStructureController, renderNativeEditBar, applyNativeTextEdit |
| Native state, draft scope and page metadata | 1716–1822 | nativeModeActive, draftScope, nativePageMeta, writeNativePageMeta |
| Site, page and navigation settings | 1823–2003 | openNativePageSettings, openNativeSiteSettings, openNativeNavigation |
| Routes, effective sources and preview updates | 2004–2130 | refreshNativeRoutes, nativeSources, nativeEffectiveSource, updateNativePreviewSources |
| Shown source files and stylesheet loading | 2131–2310 | readNativeShownFiles, readNativeStyleFiles, loadNativeShownFiles |
| Media reads, uploads and media manager ports | 2311–2548 | loadNativeAssets, uploadFilesTo, applyMediaBatch, mediaController |
| Site activation, base sources and component styles | 2549–2820 | adoptNativeBaseSources, deactivateNative, activateNativeSite |
| Deferred text index and first-paint/title gates | 2821–3013 | startNativeTextIndex, noteNativePainted, indexNativeTextFiles, ensureNativeTextIndex |
| Current page, notices, API reads and sign-in | 3014–3300 | setCurrentPage, errorMessage, api, readFile, renderLogin |
| Start your site and Setup checklist | 3301–3543 | startSitePanel, setupState, writeSiteSettings, writeStartingPoint |
| Files/Pages/media explorer, page and card ports | 3544–3818 | treeState, mountExplorerTabs, cardsController, pagesController |
| File and folder creation | 3819–3958 | planCreation, branchPathProblem, createFromRequest |
| File operations, site resync and save ports | 3959–4269 | fileOperationsController, afterFileChanges, undoFileChanges, savePublish |
| Opening files and mounting source | 4270–4516 | openEntry, mountSource, openComponentLinkedStyle, updateAgentContext |
| Agent context and commands | 4517–4695 | agentContext, agentSiteActions, applyAgentSiteCommand, agentActing |
| New, uploaded and deleted drafts; snapshot loading | 4696–5014 | openNewDraft, showUpload, applyAgentCommand, restoreFile, loadSnapshot |
| Speculative boot reads and repository choice | 5015–5199 | startBootGuess, takeBootGuess, chooseRepository |
| Setup wizard and partial starting points | 5200–5450 | wizardConnection, setupEntry, finishWizard |
| Get started, repository lists and account switching | 5451–5758 | showGetStarted, createSite, loadRepositories, switchAccount, disconnect |
| Draft baseline, agent/boot ports and startup | 5759–5833 | agentController, boot, startBootGuess |

## Main entry points

Frequently used top-level functions and constants in src/main.ts (30). Descriptions stay within ten words.

| Symbol | Purpose |
| --- | --- |
| `appStore` | Holds reactive repository, snapshot, file and selection state. |
| `lazyModule` | Caches lazy imports; clears failed loads for retry. |
| `mountWorkspace` | Mounts editor DOM and wires workspace controls. |
| `mountComponentTools` | Supplies live host ports to component tools. |
| `guardedEdits` | Runs proved edits as one undoable transaction. |
| `blockMoves` | Coordinates guarded block moves across pages and templates. |
| `pageStructureController` | Owns Page Structure, edit-bar models and text edits. |
| `renderNativeEditBar` | Delegates selection controls to the Page Structure controller. |
| `draftScope` | Identifies the current account, repository and branch. |
| `setupScope` | Produces the current account/repository/branch scope key. |
| `nativeModeActive` | Reports whether a native site is active. |
| `nativeBaseSources` | Caches branch text before drafts are overlaid. |
| `nativeSources` | Builds site sources from mounted models, drafts and branch text. |
| `nativeEffectiveSource` | Reads mounted models, then drafts, then branch text. |
| `nativeFiles` | Lists branch files with draft creations and deletions applied. |
| `updateNativePreviewSources` | Updates preview sources; loads needed media, styles and templates. |
| `activateNativeSite` | Resolves native conventions and starts the editing preview. |
| `ensureNativeTextIndex` | Waits for the complete native text index. |
| `restoreFile` | Opens a path from drafts or the current snapshot. |
| `loadSnapshot` | Loads a branch snapshot and opens its workspace. |
| `findEntry` | Resolves a repository tree entry, fetching when needed. |
| `readFile` | Reads and caches repository blob text. |
| `api` | Reads a typed API response through the receipt helper. |
| `status` | Updates the status line and remembers its last message. |
| `errorMessage` | Converts failures into visible editor notices. |
| `announce` | Writes an accessibility announcement. |
| `afterFileChanges` | Refreshes trees, native routes, preview and agent context. |
| `updateAgentContext` | Tells the agent controller that shared context changed. |
| `pagesController` | Owns page operations and explorer tab policy. |
| `savePublish` | Coordinates saving drafts, review and publishing controls. |

## How to find things fast

Agent script arguments and test fixture groups: [agent-scripts.md](agent-scripts.md), [local-testing.md](local-testing.md).

- Frame message: `rg -n 'link\.on\("|type ===|case "' src/components/native-preview.ts src/components/native-preview-runtime.js`; validate its shape in preview-protocol.ts.
- New edit-bar button: `rg -n 'renderNativeEditBar|kind: "button"|onPress' src/controllers/page-structure-controller.ts src/components/edit-bar.ts`; the controller builds controls, createEditBar renders them.
- Source writes: `rg -n 'edits\.(run|now)|guardedEdits\.(run|now)' src/controllers src/page-builder src/main.ts`; follow the plan into guarded-edit.ts and guarded-edit/commit.ts.
- Main declaration: `rg -n '^(async )?function (nativeSources|nativeEffectiveSource|lazyModule)\b|^const guardedEdits\b' src/main.ts`; read one bounded range around the hit.
- Guard for a concern: `rg -n 'test\(|type Rule|Allowlist' tests/*-guard.test.ts`; test-running recipes live in local-testing.md.

## Staleness

Update this map when moving or renaming an entry. tests/code-map.test.ts checks every backticked path and declared symbol in Where things live and Main entry points, paired in reading order per row. Main entry points always names declarations in src/main.ts. Line ranges are deliberately unchecked.
