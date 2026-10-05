# Native header/footer master preview bridge

`createNativePagePartController(host).previewInput()` returns the explicit
`kind: "page-part"` variant with `rootTag: "header" | "footer"`. Pass it as
`createNativePreview(...).update({ masterEdit: input })`. The controller context
also supplies the variant and root tag for `createMasterBanner(...).show(context)`.
An undefined input ends the preview session.

The composer replaces one exact linked copy on its original page. The runtime
keeps the actual header/footer element and maps its root to `[0]` in the editor
master file. Selection includes the painted master source and host session;
typing and Code selection share the existing guarded section-master bridge.
Outside elements remain selectable and cannot take typing while a master is open.
The section payload and its banner label/title retain their existing contract.

This is editor preview code. Public pages remain literal HTML and CSS; preview
composition does not write a page, inject public markers, or require public JavaScript.
Save/Link and Update copies remain controller/model operations behind the host's
atomic transaction and bounded history.

Verification: `npx playwright test -c playwright.native-page-part-preview.config.ts`
runs real standalone header/footer bridge tests and existing section bridge tests.
The standalone harness proves preview selection, typing, Code refresh/selection,
outside typing locks, stale-message refusal, Done restoration, root/path scope,
and banner compatibility. It does not prove main editor integration, repository
save, Update copies transactions, or actual editor Undo/Redo. Those require the
host integration and its browser checks. Independent Claude review remains pending.
