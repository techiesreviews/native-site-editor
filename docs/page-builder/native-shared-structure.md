# Native sharing in Structure

The optional `PageStructureHandlers.nativeSharedRoot(path, item)` hook supplies
host-proven actions for a whole ordinary native section, header, or footer.
Return undefined for read-only, unloaded, ambiguous, or otherwise held roots.
Structure also omits these actions on unknown ownership, stale
painted pages, legacy component/slot rows, and elements with other root tags.

Return `{ state: "linked", label, recordId, edit, disconnect }` for an explicitly
proven shared copy. Its root row shows the friendly label and component diamond,
with Edit component and Disconnect this instance at the far right. Clicking the
root or a child still selects the page instance. No slot rail or synthetic slot
rows are added.

Return `{ state: "available", context, actions }` to offer Save shared. Context
and actions follow `native-shared-authoring.ts`. An explicit click opens the
metadata form below that root within the existing tree group and unfolds it.
Form fields survive unchanged updates. Cancel or successful submission restores
focus to the root. A new context key, changed page, disappeared anchor, or stale
paint cancels the old form and notifies the host; pending results cannot affect a
new form. Host callbacks retain source/write authority and must invalidate their
pending write context on cancellation.

`nativeFieldsRevision()` should include shared identity, effective sources and
repository/session scope. Without this revision hook Structure checks native
sharing on every update. The host must change context keys whenever selection,
source authority, available metadata choices, or scope changes. No local cache
establishes source authority. Existing component slot handlers remain separate;
without native sharing handlers the existing Structure behavior is preserved.

Verification: `npx playwright test -c playwright.native-shared-structure.config.ts`
uses the actual Structure component, native form and editor CSS in a standalone
280px sidebar. It covers root actions, instance selection, child refusal,
inline disclosure, unchanged updates, focus restoration, context cancellation,
stale paint and old pending results. Screenshots live in
`.scratch/native-shared-structure/linked-row.png` and `inline-authoring.png`.
Focused existing compact Structure browser tests also pass. These checks do not
prove main editor integration, repository Save/Update operations, or actual Undo.
Independent Claude review remains pending.
