# Heading bar integration checks

These tests exercise the actual application and production code panel using a real preview build of `fixtures/astro-starter`. A temporary copy holds build outputs and source mutations; the checked-in Astro site is not edited by the tests. GitHub/session endpoints are intercepted, so no real account or publication is used.

`publish-state.spec.ts` checks the Publish trigger across clean drafts, Undo/Redo, CSS-only changes, pending requests and successful publication. `commit-history.spec.ts` checks open-file history, fixed-head pagination, current-file version labeling, restore confirmation/cancel, draft protection, rejected requests and successful source refresh while another file's draft survives. The worker's GitHub request boundary is covered separately in `tests/history.test.ts`.

```sh
npm ci --prefix fixtures/astro-starter
npx playwright test -c playwright.heading-bar.config.ts
```

The dedicated configuration starts Vite on port 5180. The ordinary Astro build runs separately from the annotated preview build. Source assertions inspect the files submitted through the existing publishing UI; the intercepted destination fails intentionally so drafts remain available.

Scope covers the H1–H6 control, selected-text bold/italic in literal headings (including nested attribute-free `strong`/`em`), paragraph selected-text bold/italic, visual Undo/Redo buttons, and whole-element text sizes using Lex’s `--text-xs` through `--text-4xl` variables. Checks cover exact source, caret and backward selection, overlap, Undo/Redo, reload, source conflicts, unsupported expressions and layout. Passing these tests does not establish prepared-component Auto levels, visual heading styles, arbitrary rich-text elements, structural editing, live publishing or multiplayer.

Size checks also use the project’s actual framework stylesheet: the supplied fluid clamp at desktop/mobile widths and a changed variable shared by two headings. Ordinary-build rendering verifies that class-based typography also works without the editor integration.

Headings and paragraphs use one text-editing path and one preset manifest. History checks use the header buttons without requiring code-panel focus, including continued typing after Undo, size-menu state, custom-size restoration, file switching and browser reload. Mixed paragraphs retain their supported child links; dynamic styling disables only size.

Class typography checks cover shared class rules, readable generated page classes, preserved declarations, Default, exact Astro/CSS publication payloads, CSS-pane remounting, and newer edits during a delayed Undo. History shortcuts cover canvas, contextual controls, header and native-input exclusions. A shared literal attribute parser serves both source planning and the distributed preview integration. Class-only changes must enable Publish.

`button-link.spec.ts` covers the contextual Link panel, direct button labels, destination validation, cancellation, selection changes, unsupported spread attributes, narrow-screen bounds, Undo/Redo and reload. `link-heading-recovery.spec.ts` combines a changed heading length with link editing, reload and a later heading edit to verify that source mappings stay aligned. These checks cover existing literal anchors; button insertion and variants remain separate work.
