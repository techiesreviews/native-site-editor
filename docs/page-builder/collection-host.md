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
rewrites parsed `data-each` folder tokens only for explicit validated folder moves, calls
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

Collection scope relocation requires explicit planner-only
`origin.folders: [{from: "work/", to: "portfolio/"}]` filesystem prefixes.
Ordinary page moves and URL changes never infer a folder rename, even when the
old scope has only one record and the destination is empty. A Files-tab folder
rename/move must provide this intent and exact moves for every before-file under
the old prefix, including opaque assets. Partial mapping rejects the plan.
Destination prefixes must be wholly vacant; ancestor/descendant destinations
and overlapping intents are refused. Valid intent rewrites the corresponding
root and nested collection tokens, preserving mixed unrelated scopes, with or
without a folder index. The metadata is removed from the returned host operation.
Opaque file moves/deletes remain in the operation without becoming text edits,
and full file guards protect destination vacancy when assets are unloaded.

All bake errors still abort the origin. Parser failures name their exact page;
errors returned by the bake API name the complete listing-input page set rather
than guessing one culprit or rebaking generated output. The host must surface
that error and must not filter out any operation edits before atomic apply.

Filesystem folder intent accepts Unicode and spaces when the prefixes are safe
relative paths. Its existence, full-member mapping and destination-vacancy
checks remain independent of URL syntax. Only an actual collection-token
relocation is checked through existing `collectionFolders`; a destination such
as `_archive/` is allowed for unrelated assets but refused with an explicit
collection URL grammar error when a listing would need that scope. A source
prefix with no files reports the missing source folder, not destination vacancy.

An optional `candidateIdentity` supplies the identity for the single candidate
bake, defaulting to the original `identity` for existing callers. For a site-name
change, the host reads this identity from the actual post-origin candidate source
with its existing identity reader; this planner does not parse configuration.
Candidate titles can therefore lose the new site-name suffix in generated
listings while their full source titles remain unchanged. The bake identity is
copied. `expectedIdentity` and `nativeCollectionPlanIsCurrent` still compare the
BEFORE identity, along with the original sources, routes, file set and revision.
