# Atomic collection host planning

`planNativeCollectionOperation({sources, files, routes, revision, identity, origin})`
is pure. `origin` has the host NativeOperation fields: moves, deletes, creates,
full-source edits, expected sources, open/focus, and done/undone messages. The
result is `{operation, expectedRevision, expectedFiles, expectedIdentity,
expectedRoutes, afterRoutes, collections}` or `{error}`. Nothing is written on failure.

`files` must contain every existing file, including unloaded assets. `sources`
contains only actual loaded text, never invented binary placeholders. Route
entries must match `deriveNativeRoutes(files)`; all routed pages must be loaded
before baking. Include loaded nonpage text touched by the origin. The coordinator applies the origin to an isolated candidate graph,
rewrites parsed `data-each` folder tokens for proven whole-route-folder moves, calls
existing `planBake` once, and combines final listing text with origin changes.
It does not recursively bake generated output. Existing route, collection,
field, binding, URL and malformed-template checks remain active.

The returned operation is structurally compatible with the existing atomic
NativeOperation seam. Created listings are baked in `creates.content`; moved
files have edits addressed by their destination, compared against the actual
old source. Other listing edits use full final source text. Conflicting moves,
occupied creation/move targets, nonexistent edits/deletes, stale origin guards,
and bake errors reject the entire operation. Vacant full-source edits may create
new files (including a first `_redirects`); editing an existing unloaded file
requires its actual source first. Simultaneous swaps/chained moves
are conservatively refused. Origin code still owns URL metadata, href links,
redirects and media changes; this module only rewrites collection scope tokens.

Before applying, call `nativeCollectionPlanIsCurrent(plan, currentSnapshot)`
with fresh sources, full files, routes, identity and revision, immediately before the atomic host
operation. Expected sources contain BEFORE values for every before/after route
input and every origin target, including unchanged/unselected pages, old move
paths and `undefined` for vacant created/moved destinations. Never compare them
against the candidate graph. Identity and the complete file set are compared independently of the revision.
Routes are re-derived from those files. The revision must identify repository
and branch changes; the exact route graph guard catches additions/removals
that an unchanged source check cannot. The host must preserve these guards
through any asynchronous preparation and commit all drafts/history together.

The leaf provides planning and readonly verification only. It does not wire
main, mutate editor models/drafts, or provide host Undo/Redo. Integration should
keep the returned plan immutable and pass its single operation through the
existing transaction/history companion seam. Unit coverage exercises multiple
listings, create/move/rename/delete, metadata/template edits, route graph and
vacant-target staleness, exact source provenance and whole-plan failures.

Collection scope relocation requires every before-route under a token to move
to one shared destination folder plus its original suffix. This works without a
folder index, including nested/mixed scopes. An index-only move with descendants
left behind keeps the old scope; moving a folder page to a `.html` route never
turns a collection token into a file URL. Opaque file moves/deletes remain in the
operation without becoming text edits, and full file guards protect destination
vacancy even when assets are unloaded.

All bake errors still abort the origin. Parser failures name their exact page;
errors returned by the bake API name the complete listing-input page set rather
than guessing one culprit or rebaking generated output. The host must surface
that error and must not filter out any operation edits before atomic apply.
