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


## Optional existing-record choice

A host can pass `savedRecords?: readonly { id: string; label: string }[]` in the context and
provide `actions.link?(recordId, contextKey): Promise<NativeSharedSubmitResult>`. The list must
already be filtered for the selected ordinary section/header/footer. The host owns catalog,
source, file graph, portability and write-authority checks; this leaf never finds links by tag
or class and never writes repository files. Change the context key when the offered records or
selection/source authority changes.

With both options present, a quiet native select defaults to `New shared section/header/footer`
and offers `Use <friendly label> here`. Choosing a record hides the new-record fields and path;
`Use here` is a separate explicit confirmation. Switching back preserves the typed new draft.
Enter on the select does not submit, pending work disables confirmation and selection, and host
errors retain the choice. Cancel/Escape and a new context detach old callbacks/results; a late
result cannot close or alter the new form. Linking success uses the existing `close(key, "saved")`
reason. Without the optional callback/list, the previous new-only form remains.

The UI epoch protects this form only. Cancellation does not stop an already-started host write:
the host must check the current key/session/model and source/graph pins at its write boundary.
This leaf proof is not MAIN wiring or completion of the six-route sharing workflow.
