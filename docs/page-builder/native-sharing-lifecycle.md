# Native sharing metadata on page move and delete

`planNativeSharingLifecycle` is a pure preparation helper. Give it the original editor JSON,
the current full file graph, loaded source bytes, and explicit native HTML page move mappings
or deletions. A folder move supplies each page mapping; the helper never guesses a prefix.

The only edit it returns is `.editor/page-builder.json`. It moves entries tagged
`native-section` in `pages[path].sections` and `native-page-part` in `pages[path].pageParts`,
or removes those entries for deleted pages. Link targets, basis HTML, customised-copy state,
unknown fields, reusable records, true collections and unrelated page metadata stay intact.
An occupied destination link key refuses, including a foreign entry. An opaque `pageParts`
namespace with no recognized entries stays opaque; it cannot receive a moved link.

The destination public file must be absent before a move. Existing destination metadata is
merged only in the two recognized namespaces; its fields remain. Duplicate files are independent:
a duplicate is not a move mapping, and this helper creates no links for it. With no recognized
links to change, `operation` is undefined and no JSON file is created or rewritten.

The plan exposes sorted `expectedFiles` and exact `expectedSources` for the original JSON,
every source page and each absent destination. The host must compare these immediately before
applying its combined transaction, and also guard repository/session and selection identity.
The helper validates recognized links and their catalog records, but does not read master HTML,
rebuild copies, resolve customised locators or rewrite public URLs. Public HTML and CSS are
untouched; asset and route rewrites remain the host's separate responsibility.

The host must compose this JSON edit with collection/asset/route metadata edits from the **same
original JSON**, preserving both results. Applying two independently planned JSON writers would
lose metadata and is unsupported. The combined file move/delete and JSON edit need one existing
guarded Undo/Redo transaction. This model has unit proof through the current history receipt;
it is not wired into Files or a claim of completed browser workflows.
