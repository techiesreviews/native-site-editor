# Native Grid and Columns insertion planning

`planNativeLayoutInsert({sources, point, kind, cssPath, files?})` returns one
operation with `edits: Map<path, fullText>` and
`expectedSources: Map<path, originalText | undefined>`, plus a unique `className`
and `selection: {path, node}`. Failure returns `{error}` and no writes. The
caller applies the operation through the atomic text/history companion seam;
this leaf does not change Add, main, preview, editor models or drafts.

Grid and Columns produce portable HTML with a shared class and plain CSS, with
no inline layout or editor attributes. Grid uses responsive grid tracks;
Columns uses wrapping flex with zero-specificity `:where(.class > div)` child rules. New rules are
unlayered and use no `!important`; the Style writer can locate and edit the
class rule; ordinary unlayered child classes override the flex default.
Unlayered defaults still outrank layered declarations, regardless of specificity;
this leaf does not promise layered overrides. Existing CSS bytes,
comments, layers and line endings stay before the appended rules.

Insertion uses the existing conservative native HTML-boundary planner. A page
must have an explicit complete head. An effective direct local stylesheet link is reused with entity-decoded hrefs.
Existing conditional, alternate, disabled, named, query or indirect import loads
of the chosen file cause refusal instead of a second link that changes cascade
order. CSS import chains and inline style imports use the existing import parser
and resolver; unloaded local roots and out-of-repository relative URLs prevent
a safe reachability proof and cause refusal. Existing CSS modifications also
refuse unknown external roots/imports. A proven new CSS file may coexist with
external font links because no existing sheet bytes or load order are changed. Base href also causes refusal. Integrity-protected references, including conservative template/noscript scans,
on loaded HTML/HTM pages prevent modifying that sheet. Existing CSS changes
require a complete file graph and all HTML/HTM sources loaded first. Inert template and
noscript links do not count as active. A fresh ordinary relative link is added
only when no existing reachability exists, verified by the import resolver.
`cssPath` must be a safe repository-local `.css` path; unsafe URL or HTML syntax
is refused. HTML insertion, link addition and stylesheet text form one operation.

Sources must be actual fresh loaded text. An existing CSS target missing from
sources is refused. Creating a CSS target requires `files`, the complete existing
file graph, to prove vacancy; an opaque/unloaded existing target is never treated
as empty text. The returned `expectedFiles` is a copied sorted graph: the host
must compare it again before applying, in addition to exact source guards and
its scope/revision receipt. Host creation guards must also enforce vacancy after
any async preparation. All provided sources are guarded because class allocation
uses their HTML entities and CSS escapes, conservatively including comments.
Class allocation is unique across the supplied workspace snapshot; supply all
relevant page/template/CSS sources, not only the selected page.

Pure regressions cover source/class collision, escaped class names, stylesheet
link resolution, new CSS vacancy proof, opaque targets, malformed HTML/CSS,
layer/CRLF preservation and native Style editing of generated rules. Browser
layout, Add integration and compound Undo remain host integration checks.

Relative links assume the native route's trailing-slash folder URL. The focused
suite includes self-contained Chromium checks with routed fixture sources: a
screen stylesheet followed by a blue theme remains blue when planning refuses,
and inert head links receive exactly one real active sheet after insertion.
No application server or host editor integration is involved.

Any active link to the chosen CSS path is checked before filtering `rel`.
Preload/modulepreload and scripted onload links cause refusal, including the
published loadCSS pattern that turns a preload into a stylesheet. A Chromium
regression runs that real callback, verifies blue theme order, and proves the
planner refuses a duplicate. Complete-source and full-file guards remain
required through any host async preparation and apply.
