# Page settings after Fields removal

Page settings › Fields and its Date/custom-field controller were removed in P1.4.
General, Search and Social remain available and write ordinary HTML metadata with
the existing guarded Apply and Undo/Redo operation. There is no page-field form,
custom-field migration action, or sidecar page-field authoring API.

Collections remain until P1.5. Collection recovery controls move to General. They read page values from HTML metadata and keep
card-specific values in collection recipe overrides. Grid editing and collection
baking retain their existing source, route, identity and repository guards.

Legacy `pages[*].fields` in `.editor/page-builder.json` is ignored on read and
stripped on the next sidecar write, without a version bump. Other supported data,
including `reusableSections`, `pages[*].sections`, `pages[*].pageParts` and
`collections`, remains intact. Legacy HTML `field:` metadata remains source and
can still supply collection values; P1.4 does not migrate or delete those tags.

Existing sidecar `pages[path].date` remains a collection fallback when HTML supplies
no date; P1.4 strips only `pages[*].fields`, not other supported page data.
