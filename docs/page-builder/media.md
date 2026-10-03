# Media library and optimisation

The Images panel browses repository files, searches filenames/default alt text/tags,
filters folders and tags, reports page usage, and offers metadata, rename, deletion
and optimisation. Image insertion produces ordinary `<img>` markup with escaped
alt text, intrinsic dimensions, lazy loading, async decoding and responsive sources
when available. Existing classes, source keys, slots and styles survive replacing
an image. No editor runtime enters the site's HTML, CSS or Web Components.

Metadata is an editor-only `.editor/media.json` map keyed by image path. Existing
page alt text is independent of the metadata's insertion default. Unknown metadata
fields survive updates. Malformed metadata is refused rather than overwritten.

## Atomic host contract

The library prepares one `MediaWorkspaceBatch` for a user action. Rename includes
binary moves, all reference edits and metadata key moves. Delete includes binary
removal and metadata removal. Import includes every primary image/responsive family,
copied metadata and requested reference replacements in one batch. The adapter
never calls the legacy per-file `write`, `rename`, `remove` or draft/upload APIs.

The host must provide `MediaWorkspaceContext.applyBatch` and `assetVersion` before
mutating features can be enabled. Missing methods fail closed. Both are temporarily
optional in TypeScript so the existing host can migrate without an unsafe fallback.

Each batch contains:

- `expectedPaths`: the effective repository path list captured before asynchronous reads.
- `expectedSources`: original HTML/CSS and metadata values, including absent metadata.
- `expectedAssets`: effective binary revisions captured before asynchronous reads.
  Reference replacements from optimisation use the earlier blob/preview receipt,
  not the current revision at Add time.
- `edits`: all prepared text drafts, including `.editor/media.json`.
- `moves`, `deletes` and `uploads`: binary file mutations and output blobs.
- `label`: one user-visible history action.

The host must validate the captured repository/account/branch/generation, path list,
all expected sources and binary revisions immediately before the draft transaction.
A model's effective source takes priority over drafts and branch baselines. Any
source/path/revision change during asynchronous reading, blob hashing or byte staging
rejects the entire batch while preserving the other edit. No partial metadata,
reference changes or binary changes may become visible.

`applyMediaWorkspaceBatch` provides this sequencing through a host transaction:
validate, asynchronously snapshot, validate, asynchronously stage upload bytes,
validate, then synchronously commit drafts/models/paths and register exactly one
Undo action. The synchronous commit must contain no awaits. A host using another
operation engine must enforce equivalent final guards after its final await.

Snapshot/rollback and Undo must be bound to the originating draft scope. Switching
repositories before Undo cannot direct old paths or bytes into the new repository.
Rollback before commit must remove only staged bytes owned by this operation and
must preserve source changes made by others during preparation. Rollback after a
failed synchronous commit restores the operation's own source/draft/path mutations.
Upload byte keys are content-addressed and may already exist or be shared: never
remove pre-existing bytes or bytes referenced by another draft. A byte snapshot
must record ownership/reference information, not only a list of upload paths.

The host owns updating paths, native routes, assets, source models, preview and change
status after a successful transaction. Refresh must not perform a second mutation
that can split an otherwise successful batch. Successful Undo restores binary
moves/deletions/upload families, metadata and all reference drafts together.

## References and usage

Usage follows HTML references, linked CSS/imports and nested custom components,
including each component's conventionally paired CSS file. Cycles are visited once
per page. An unread source refuses rename/deletion/reference changes; it is never
reported as unused. Delete unused rescans usage before preparing deletion.

HTML scanning skips comments and raw-text script content. URL and alt attributes use
the full HTML5 character-reference decoder supplied by the site-control commit
`e3cfcd7` (`src/page-builder/html-entities.ts`). This media commit does not duplicate
ownership of that module. Srcset scanning handles data-URL commas and descriptors.
CSS scanning skips comments and ordinary string lookalikes, recognises `url()` and
quoted `@import` and `image-set()` image strings, and decodes CSS identifiers and
URL escapes (including escaped `url` function names). Inline style attributes retain raw offsets
through HTML entity decoding. Rewrites preserve query/fragment values and escape
according to HTML attribute and CSS string context. Descriptive meta content is not
an image reference; social-image metadata is.

## Optimisation

Optimisation runs in a Vite-emitted, same-origin module Worker with OffscreenCanvas.
No blob worker script or package is introduced. Resizing preserves aspect ratio and
never upscales. WebP/JPEG/PNG encoding accepts validated width/quality options.
Responsive widths are 480/960/1600 pixels below the primary width. Transparent WebP
may use a smaller PNG; responsive output formats match the primary output.
Re-encoding strips image metadata. SVG/GIF keep their bytes. Explicit Keep original
also retains undecodable files such as HEIC; the host must make retained formats
visible in the library if it accepts them, while clearly allowing unavailable previews.

Closing/changing the optimisation panel or changing encoding options aborts the
Worker and invalidates prepared results. Late work cannot reactivate Add using stale
options. Encoding itself does not mutate repository state. Adding all prepared
families is one host transaction; originals remain when optimised copies replace
references.

The workspace's library items expose `version` from the host's `assetVersion`.
The picker captures that revision before reading a thumbnail/detail/bulk blob and
keeps it with the cached preview bytes. Existing-image optimisation carries the
same receipt through preparation into `MediaImportRequest.expectedAssetVersion`.
An import with `replaceFrom` rejects a missing receipt or a changed current binary
revision. Its final batch retains the preview receipt so the host's final guard
also rejects replacement during byte staging. Uploads of newly selected local files
do not require a repository binary receipt. The host must return a stable nonempty
revision that changes for every effective binary replacement or draft state change.

## Checks

`tests/media-workspace.test.ts` covers rename/delete/import grouping, one Undo,
partial byte/draft failures, guards after asynchronous staging, preserving concurrent
edits, and missing-host refusal. Metadata, markup, reference parsing and optimisation
helpers have focused unit coverage. Browser tests in
`tests/native-save/native-media-library.spec.ts` cover browsing/usage, a real
optimisation Worker, and host integration for rename/delete/Undo. The mutation
browser cases require the host's new atomic adapter. Use `ASE_TEST_PORT=5296` or
`5297` to isolate media browser runs.

## Persistent explorer pane API

`mountMediaLibrary(container, options?)` from `media-picker.ts` mounts a real
`section` with an Images region directly into a host element. It returns
`{ element, ready, refresh, dispose }`. Await `ready` for the initial load; call
`refresh()` after external draft/history changes, including Undo. The host owns
its dimensions and visibility. Set the host's `hidden` property when switching
explorer tabs; this preserves selection, filters, details and repository drafts.
Dispose before replacing/removing a host, then mount again when needed. Remount
reads effective drafts from the adapter rather than resetting repository state.

The common implementation lives in `media-library-view.ts`. It serves search,
folders, tags, usage, metadata, selection, uploads, optimisation, rename and delete
for both surfaces. `openMediaPicker({ onPick, accept, files })` remains the modal
selection API and `closeMediaPicker()` closes only that modal. The pane has no
dialog, backdrop, Close button or focus trap. Its narrow layout uses the editor's
existing tokens and puts details in the pane's available width.

By default mounting captures the configured adapter. An isolated host can provide
`options.adapter` explicitly. `configureMediaPicker(nextAdapter)` disposes all
existing panes and the active modal before installing the new adapter. Repository
switching therefore requires mounting a new pane; detached old controls cannot
mutate the newly configured repository. An in-flight transaction still relies on
the host's original-scope final guards described above. Disposing aborts optimisation,
invalidates pending loads/details, disconnects thumbnail observers, revokes generated
Blob URLs and removes the view and its event handlers. It never clears drafts.

The root explorer's third-tab wiring is deliberately left to the host owner;
this leaf module does not modify `main.ts`. The isolated native-save browser
harness in `native-media-pane.spec.ts` mounts the API with the real editor adapter
and verifies non-dialog rendering, filtering/details, draft persistence through
hide/remount, atomic rename/Undo, adapter invalidation, late-load disposal and
pending-worker cancellation. Run on free port 5366 or 5367, for example:

```sh
ASE_TEST_PORT=5366 npm run test:browser -- tests/native-save/native-media-pane.spec.ts tests/native-save/native-media-library.spec.ts tests/native-save/native-media-transaction.spec.ts
```
