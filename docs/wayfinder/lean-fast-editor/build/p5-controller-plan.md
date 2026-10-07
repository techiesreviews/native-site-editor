# Phase 5 controller extraction plan

Ticket 08's end state is `src/main.ts` reduced to wiring, under roughly 500 lines.
This is an incremental plan, not a claim that the whole split is finished.
Extract one controller per branch/PR. Serialize all changes to `src/main.ts`.

## Preserve the completed work

Phases 1–4 are complete at `963f569`. The Monaco-free draft store is already
wired through `source-editor.ts`; `code-editor.ts` is its deferred Monaco view.
Do not introduce another draft/history implementation. Keep the existing boot
request ordering, generation/source guards, lazy component imports and chunk
recovery. The rejected asynchronous HTML entity table stays synchronous.

## Ordered slices

1. **Shared app store:** `src/app-store.ts`, `src/main.ts`, package manifest and
   lockfile. Signals for repository, branch, snapshot, selection and open file;
   a subscription bridge to the existing draft text store. This is the
   foundation for the controller branches.
2. **Agent controller:** `src/controllers/agent-controller.ts`, `src/main.ts`.
   Own menu loading, hub polling, retry, consent/wake listeners and teardown.
   Keep the UI module lazy. Preserve account and DOM identity checks after
   awaits; polling every 30 seconds and one early retry after 3 seconds.
   Preserve the captured menu's identity when sending an agent request.
3. **Setup checklist:** `src/controllers/setup-checklist-controller.ts`,
   `src/main.ts`. Own mount, progress/memory, agent spotlight, completion timer
   and disposal. Inject workspace identity, site/draft reads and UI actions.
   Preserve the timer's scope check and lazy checklist/spotlight imports.
4. **Setup entry:** `src/controllers/setup-entry-controller.ts`, `src/main.ts`.
   Move wizard/Get Started presentation and return polling separately from
   repository creation transactions. Keep those transaction helpers in the
   host for the first slice.
5. **History panel:** `src/controllers/history-controller.ts`, `src/main.ts`.
   Own panel loading/opening/position/restore callbacks. Inject captured
   workspace proofs, draft checks and version navigation. Leave the broader
   `VersionView` transaction in the host initially.
6. **Command palette:** `src/controllers/command-palette-controller.ts`,
   `src/main.ts`. Own mount/dispose; reuse `EditorPaletteDeps` and the existing
   lazy command UI. Preserve the first key's query and cancellation behavior.
7. **Media:** extract picker lifecycle/context while retaining existing media
   transactions, upload guards and the lazy picker module.
8. **Code panes:** extract load gate, mount and resize orchestration. Keep
   `source-editor.ts` Monaco-free and `code-editor.ts` the Monaco view.
9. **Boot:** extract session/repository/branch/snapshot orchestration without
   redoing Phase 4's performance changes. Keep generation invalidation.
10. **Preview and selection:** extract bridge, preview readiness and selection
    dispatch, with domain edit handlers injected and source proofs preserved.
11. **Pages:** extract tree and create/rename/duplicate/delete/URL/move UI;
    retain existing native operation planners and transaction helpers.
12. **Structure and shared sections:** separate controllers/PRs. Preserve
    master/session/revision guards and all-or-nothing update histories.
13. **Cards:** move UI orchestration over existing card operations.
14. **Multi-file operations:** move orchestration while keeping pure planners
    and receipt/history helpers in their existing modules.
15. **Save/publish:** move UI, reconciliation and status orchestration. Preserve
    dirty/unpersisted and repository/branch guards and recovery behavior.
16. **Monaco contribution trim:** independently owned last slice, ticket 06.
    Its recovered candidate can be prepared and validated alongside the
    controller work; land it in the order approved by review.

## Acceptance and review

Each branch: `npm run check`, unit tests, touched browser specs, `@smoke`, byte
budget. Run browsers serially: Claude's prior thread records memory exhaustion
with parallel full suites. Run the full native-save suite once on an integration
candidate before merging. Preserve assertions rather than hiding failures.

For each lazy controller, run `native-lazy-panels.spec.ts`. Agent checks also
include MCP, onboarding and request races; setup checks include checklist and
wizard; history includes history action and draft-store history; palette
includes element actions and panel collapse. Select exact filenames when
claiming each slice rather than inventing a hand-maintained test inventory.

Review precedes merging and preview deployment. Preparation branches are not
production releases. Follow ticket 15's preview and timing checks after an
approved merge. The remaining split requires further slices after the first
review batch.
