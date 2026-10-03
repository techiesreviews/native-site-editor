# Settings modal layout

Page, Site and Navigation settings share a two-pane modal: a quiet category sidebar
and one active content pane. The desktop shell is 900 × 640 pixels, capped to the
viewport. The content pane scrolls independently; the header and Apply/Cancel
footer remain visible. Inputs use the editor's existing light/dark tokens and
visible focus indicators, with readable 14-pixel control text and subtle field-row
separators. Description fields are multiline, while titles and addresses retain
full-width controls within their rows.

Page settings categories are General, Search and Social. Site settings categories
are General, Social and Pages; Pages contains the affected-page list and 404 action.
Navigation separates existing Links from Add link. Adding a destination returns to
Links, with external-link editing focused as before. Existing Phosphor icons mark
categories, Close and navigation reorder controls.

Category switches hide existing DOM panels rather than recreating their inputs.
Unsaved values, linked social fields, image previews and all hidden controls remain
part of the same Apply action. Apply remains explicit, creates drafts and retains
the existing handler API, source checks, asynchronous upload guards, URL-change
flow and navigation semantics. Cancel and Escape discard only the dialog edits.
Close restores focus to the original opener or its repository-menu control when
the opener belongs to a closed popover.

The category navigation uses tabs, selected states, associated tab panels and
roving focus. Arrow keys, Home and End select categories. At widths below 640 pixels,
categories become horizontal and controls stack. The 390-pixel layout keeps the
modal, fields and fixed footer inside the viewport without horizontal overflow.

## Reference and validation

The visual reference is ChatGPT settings from Mobbin: [General](https://mobbin.com/screens/b5fd14e2-3d66-4caa-b1f2-e860d5e47c21)
and [Notifications](https://mobbin.com/screens/3d7dab94-08ef-46ef-b0cc-0a5f2621f7c7).
The supplied screenshots were inspected locally. The layout adopts their category
sidebar, calm content rows and bounded modal shell, using this editor's own tokens
and task-specific controls. These are ChatGPT references; no Cursor screenshot was
used.

The existing `native-site-settings.spec.ts` assertions remain, with category clicks
added where a control now belongs to another pane. They cover page/site/navigation
writes, linked values, share preview, named entities, Undo, 404 actions, source/scope
races and URL-map behavior. `native-settings-layout.spec.ts` adds value preservation
across categories, hidden-field Apply, fixed footer positioning, keyboard category
selection, focus restoration, Cancel without writes and all three modal families
at 390 pixels. Screenshot artifacts are written under `.scratch/settings-layout/`.
