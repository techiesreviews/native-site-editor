# Collections in Page settings

`mountCollectionsPanel(host, deps, {settings: true})` stages Date and custom fields.
Title belongs to General, Description to Search and Image to Social in the parent
settings dialog. This mode omits their duplicate controls, section headings and
its own Apply button. `pageFieldsDirty()` reports pending field input;
`pageFieldSource(candidateSource)` overlays only changed Date/custom values onto
the supplied candidate source, using existing field helpers for validation and
escaping. Invalid/reserved names and stale snapshots throw without writing.
The default standalone mode retains its own guarded Apply. Grid editing uses
that default controller mode; `openGrid` in settings mode refuses with an action
message and never calls `deps.apply`.

The parent must capture the same before-source/session proof for all settings,
apply metadata to that candidate, then call `pageFieldSource` before the single
collection bake and atomic host operation. This leaf does not write drafts or
history in settings mode. Main integration and the single Apply/Undo transaction
remain pending; these browser tests use a DOM controller harness, not Monaco.

Grid source folders, sort, exact filter, limit and matching-page count stay in the
common form. Raw card HTML, binding instructions and the long output preview live
inside a keyboard-operable Advanced disclosure, closed initially. Edit card design
in source remains an explicit action. Existing conversion/bake helpers are unchanged.

Dirty refreshes preserve input and caret, retaining the original sources, routes,
identity, page and revision proof. Stale changes refuse submission and require
reopening rather than silently rebasing. After asynchronous Apply, only the exact
submitted form is reset; typing performed while it waits remains visible and is
not included in that earlier operation. Cancel/reopening intentionally discards
local form input. The host still verifies all expected sources immediately before
its atomic write and owns Undo/Redo.

Untouched settings Fields return the supplied candidate verbatim, without checking
an unrelated old Fields snapshot; the parent still guards General/Search/Social
and the whole atomic operation. Once Fields are dirty, their captured proof is
required. Settings mode omits navigation actions that could abandon other staged
settings. New custom names must be unique; edit an existing row to change its value.

On successful parent Apply, the host may destroy/remount the Fields controller
only if the captured submitted form and all its input values still match. Capture
those values when starting Apply, before awaiting the host operation. If the user
typed newer values during that wait, retain the controller and those values;
its old proof refuses another write until the dialog is deliberately reopened.
`update()` is a refresh, not a success-reset hook, and does not discard dirty input.
The standalone submit path already compares its exact submitted form stamp before
resetting. Stale refresh announcements are suppressed during that apply wait.
