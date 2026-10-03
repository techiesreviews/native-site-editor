# Atomic collection host planning

`planNativeCollectionOperation({sources, routes, revision, identity, origin})`
is pure. `origin` has the host NativeOperation fields: moves, deletes, creates,
full-source edits, expected sources, open/focus, and done/undone messages. The
result is `{operation, expectedRevision, expectedRoutes, afterRoutes,
collections}` or `{error}`. Nothing is written on failure.

The input sources must contain the complete current native route graph; route
entries must match `deriveNativeRoutes`. Include nonpage files touched by the
origin. The coordinator applies the origin to an isolated candidate graph,
rewrites parsed `data-each` folder tokens for actual grouped route moves, calls
existing `planBake` once, and combines final listing text with origin changes.
It does not recursively bake generated output. Existing route, collection,
field, binding, URL and malformed-template checks remain active.

The returned operation is structurally compatible with the existing atomic
NativeOperation seam. Created listings are baked in `creates.content`; moved
files have edits addressed by their destination, compared against the actual
old source. Other listing edits use full final source text. Conflicting moves,
occupied creation/move targets, nonexistent edits/deletes, stale origin guards,
and bake errors reject the entire operation. Simultaneous swaps/chained moves
are conservatively refused. Origin code still owns URL metadata, href links,
redirects and media changes; this module only rewrites collection scope tokens.

Before applying, call `nativeCollectionPlanIsCurrent(plan, currentSnapshot)`
with fresh sources, routes and revision, immediately before the atomic host
operation. Expected sources contain BEFORE values for every before/after route
input and every origin target, including unchanged/unselected pages, old move
paths and `undefined` for vacant created/moved destinations. Never compare them
against the candidate graph. The revision must identify repository, branch and
site identity changes; the exact route graph guard catches additions/removals
that an unchanged source check cannot. The host must preserve these guards
through any asynchronous preparation and commit all drafts/history together.

The leaf provides planning and readonly verification only. It does not wire
main, mutate editor models/drafts, or provide host Undo/Redo. Integration should
keep the returned plan immutable and pass its single operation through the
existing transaction/history companion seam. Unit coverage exercises multiple
listings, create/move/rename/delete, metadata/template edits, route graph and
vacant-target staleness, exact source provenance and whole-plan failures.
