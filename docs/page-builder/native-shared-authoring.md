# Inline shared-item metadata

`createNativeSharedAuthoring({ submit, close })` owns a small inline form, suitable
for an existing Structure row. Mount its `element`, then call `show(context)`
with `kind: "section" | "header" | "footer"`, an exact opaque `key`, friendly
`initialName`, reviewable `proposedId`, classes already on the root element, and
existing loaded stylesheets applied to its page. Call `focus()` after an explicit
sharing action. No dialog or popover is created.

Name and ID use the editor's direct inline fields. A single class or stylesheet
is read-only text; multiple offered values use native select controls. The master
source path follows the ID. Save validates the metadata and calls
`submit(metadata, key)` once. Return `{ success: true }` or `{ error: "Readable
reason" }`; exceptions also surface as readable errors. Errors preserve typed
fields. Enter submits from text fields; Enter in a native choice never submits.
Escape and Cancel close with `close(key, "cancel")`; successful saving closes
with `close(key, "saved")`.

The host must check that exact key before writing, including after awaits, and
invalidate its own pending write context when a cancel or selection change occurs.
The form supplies metadata only: it has no source authority and never writes a
page, stylesheet, master, or editor JSON. Route metadata through the existing
pure planners/controller and atomic transaction. Public pages remain static HTML
and CSS.

A new context key replaces the fields and detaches old pending results. Calling
`show` again with the same key preserves current typing; callers must change the
key whenever the offered values or source/selection context change. `show(undefined)`
hides and invalidates the form; `destroy()` detaches it and pending results.

Verification: `npx playwright test -c playwright.native-shared-authoring.config.ts`
uses the actual component and CSS, with a small standalone host. It covers native
keyboard behavior, labels, validation, single-choice display, duplicate-submit
refusal, host errors, pending cancellation, and old-context result refusal.
This does not prove main editor placement, repository writes, or editor Undo/Redo.
Independent Claude review remains pending.
