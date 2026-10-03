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
quoted `@import`, and decodes CSS escapes. Inline style attributes retain raw offsets
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

## Checks

`tests/media-workspace.test.ts` covers rename/delete/import grouping, one Undo,
partial byte/draft failures, guards after asynchronous staging, preserving concurrent
edits, and missing-host refusal. Metadata, markup, reference parsing and optimisation
helpers have focused unit coverage. Browser tests in
`tests/native-save/native-media-library.spec.ts` cover browsing/usage, a real
optimisation Worker, and host integration for rename/delete/Undo. The mutation
browser cases require the host's new atomic adapter. Use `ASE_TEST_PORT=5296` or
`5297` to isolate media browser runs.
