# Feature list

Every editor feature a user can notice, in plain words: how to try it and what good looks like. The
acts-like-a-user check tries entries from here (factory slices [42](../wayfinder/software-factory/build/tickets/42-kit-ux-scripted.md)
and [45](../wayfinder/software-factory/build/tickets/45-feature-tries.md)),
and every visible slice keeps the entries it touches current (kitchen station 7, [kitchen.md](kitchen.md)).
Rule ids (S1, B10, U4…) are in the [UX rulebook](ux-rulebook.md); domain words are in [CONTEXT.md](../../CONTEXT.md).

Only what is built is listed; planned work (the project overview, local folders, synced sessions) joins
when it lands. Try features on the real starter with `scripts/agents/kit shots <screen>` (its `--help`
lists the screens and the steps a scripted try can take).

Each entry, checked by `tests/features-list.test.ts`:

```
### F-<area>-<nn> <feature name>
- Try: <steps a user takes, in plain words>
- Good: <what a user should see and feel; rulebook rules by id where they apply>
- Files: <globs of the source files that make it, under src/, shared/ or worker/>
- Phone: yes | no
- Spec: <path of the browser spec that pins it, or "none">
- Steps: <path of the scripted try, or "none yet", or "none yet (<why>)">
```

`Phone: yes` means a phone user can do it, so the 390 px try covers it (U4); `no` is for
keyboard-only, hover-only or desktop-only features. `Spec` names the browser spec in `tests/native-save/`
or `tests/native-preview/` that already pins the feature. `Steps` names its `kit shots --steps` file,
`scripts/agents/shots/features/<feature id>.json`, which the acts-like-a-user check runs; slices 42 and 45
write them. A new feature takes the next number in its area; a removed one leaves
its number unused.

## Sign-in and setup

### F-setup-01 Sign in with GitHub
- Try: Open the editor signed out and press Continue with GitHub.
- Good: A short loading state, then one button and no choice; back from GitHub the editor opens without asking again, and a browser that signed in before continues by itself once.
- Files: `src/setup-host.ts`, `src/auto-signin.ts`, `src/components/onboarding.css`
- Phone: yes
- Spec: `tests/native-save/native-onboarding.spec.ts`
- Steps: none yet (the fake GitHub server is always signed in)

### F-setup-02 Setup wizard for a new account
- Try: Sign in with an account that has no repositories and follow Connect GitHub, Create your site and Your site is ready.
- Good: Three steps (Step 2 of 3 on a narrow screen), a trip to GitHub explained with screenshots only when the App is missing, and a calm finish (confetti, or a fade under reduced motion, U8).
- Files: `src/components/setup-wizard.ts`, `src/setup-wizard.ts`, `src/components/github-trip.ts`, `src/components/confetti.ts`
- Phone: yes
- Spec: `tests/native-save/native-setup-wizard.spec.ts`
- Steps: none yet (needs an account with no repositories)

### F-setup-03 Create a site from the Starter site or a Blank page
- Try: In Get started or the wizard, name a new site and pick the Starter site; then try a Blank page in an empty repository.
- Good: The repository is made, the starter shows at once and is saved as the first commit; a taken name is an inline error and the form stays.
- Files: `src/components/start-site.ts`, `src/setup-actions.ts`, `shared/starting-point.ts`, `worker/starter.ts`, `worker/first-commit.ts`
- Phone: yes
- Spec: `tests/native-save/native-static-starter-create.spec.ts`
- Steps: none yet (needs Get started or the wizard on an account with no site)

### F-setup-04 Get started screen
- Try: Leave setup on a signed-in account with no site.
- Good: Get started offers creating a repository, choosing repositories on GitHub, or an agent prompt, in plain words (S7).
- Files: `src/components/get-started.ts`, `src/controllers/setup-entry-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-setup-wizard.spec.ts`
- Steps: none yet (needs an account with no site)

### F-setup-05 Build it with an agent
- Try: On Get started press Build it with an agent and paste the copied prompt into an agent.
- Good: The prompt connects the agent to this site and starts with get_site; the button confirms the copy on itself (S4).
- Files: `src/agent-prompts.ts`, `src/components/get-started.ts`
- Phone: yes
- Spec: `tests/native-save/native-onboarding.spec.ts`
- Steps: none yet (needs Get started on an account with no site)

### F-setup-06 Setup checklist
- Try: Start a site in an empty repository and follow Start your site, Save to GitHub, Name your site and Connect an agent.
- Good: The checklist follows what is done, works from the keyboard, fits a narrow window and stays hidden once dismissed.
- Files: `src/components/setup-checklist.ts`, `src/controllers/setup-checklist-controller.ts`, `src/setup-checklist.ts`
- Phone: yes
- Spec: `tests/native-save/native-setup-checklist.spec.ts`
- Steps: none yet (needs a site started in an empty repository)

### F-setup-07 Connect an agent spotlight
- Try: In the checklist press Connect an agent, then Show me.
- Good: The project menu is lit with Connect to MCP; Escape, Got it or a click outside closes it and gives focus back (U7).
- Files: `src/components/spotlight.ts`, `src/components/spotlight-layout.ts`
- Phone: yes
- Spec: `tests/native-save/native-setup-checklist.spec.ts`
- Steps: none yet (opens from the setup checklist, which needs an empty repository)

### F-setup-08 Organisation repositories
- Try: With an account in an organisation, create a site and pick the organisation as owner.
- Good: The personal account stays the default; an organisation that forbids creating repositories falls back to GitHub; the agent prompt names the chosen owner.
- Files: `src/components/repository-name-field.ts`, `src/repository-list.ts`
- Phone: yes
- Spec: `tests/native-save/native-org-repositories.spec.ts`
- Steps: none yet (the fake account has no organisation)

### F-setup-09 Sign out
- Try: Open the project menu and press Sign out.
- Good: Back to the sign-in screen; the next visit does not continue to GitHub by itself and forgets the remembered site.
- Files: `src/components/repository-menu.ts`, `src/repository-list.ts`, `src/boot-memory.ts`
- Phone: yes
- Spec: `tests/native-save/native-boot-memory.spec.ts`
- Steps: `scripts/agents/shots/features/F-setup-09.json`

## Repositories and branches

### F-repo-01 Open a repository
- Try: Open the project menu at the top left and choose a repository.
- Good: A native site opens straight into the preview on its home page; a repository without index.html offers the Starter site and leaves its README alone.
- Files: `src/components/repository-menu.ts`, `src/workspace-boot.ts`, `src/controllers/boot-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-onboarding.spec.ts`
- Steps: `scripts/agents/shots/features/F-repo-01.json`

### F-repo-02 Find a repository
- Try: With six or more repositories, type part of a name in Find a repository in the project menu.
- Good: The list narrows as you type, grouped by owner with the personal account first.
- Files: `src/components/repository-menu.ts`
- Phone: yes
- Spec: none
- Steps: `scripts/agents/shots/features/F-repo-02.json`

### F-repo-03 Add repositories on GitHub
- Try: Press Add repositories in the project menu, choose repositories on GitHub's access page and come back.
- Good: The list refreshes by itself with the new repositories; nothing else changes.
- Files: `src/components/repository-menu.ts`, `src/repository-list.ts`
- Phone: yes
- Spec: none
- Steps: `scripts/agents/shots/features/F-repo-03.json`

### F-repo-04 Switch GitHub account
- Try: Hover GitHub accounts in the project menu and press Switch on another account.
- Good: The menu lists that account's repositories, its personal repositories first.
- Files: `src/components/repository-menu.ts`, `src/repository-list.ts`
- Phone: yes
- Spec: none
- Steps: none yet (the fake GitHub server has one account, so there is no Switch)

### F-repo-05 Switch branch
- Try: Open the project menu, open Branches and pick another branch, by pointer or keyboard.
- Good: The new branch's page shows with none of the old page in between; work held on the old branch finishes there.
- Files: `src/components/repository-menu.ts`, `src/components/flyout.ts`, `src/workspace-session.ts`
- Phone: yes
- Spec: `tests/native-save/native-branch-menu.spec.ts`
- Steps: `scripts/agents/shots/features/F-repo-05.json`

### F-repo-06 Refresh from GitHub
- Try: In Branches press Refresh from GitHub after a commit made on GitHub.
- Good: The branch is read again on the same page; a GitHub that never answers offers Try again rather than a blank screen.
- Files: `src/components/repository-menu.ts`, `src/github-reads.ts`, `src/read-retry.ts`
- Phone: yes
- Spec: `tests/native-save/native-github-silent.spec.ts`
- Steps: `scripts/agents/shots/features/F-repo-06.json`

### F-repo-07 Fast reopen
- Try: Reload the editor on a site you had open.
- Good: The remembered page paints at once and is checked against GitHub; a file that moved on GitHub shows its fresh content.
- Files: `src/boot-memory.ts`, `src/boot-reads.ts`, `src/native-boot.ts`
- Phone: yes
- Spec: `tests/native-save/native-boot-memory.spec.ts`
- Steps: none yet (needs a reload)

### F-repo-08 Work held across a switch
- Try: Start a save or drop files, then switch branch or repository before it ends.
- Good: The work lands on the branch it began on; the menu counts it on that row, and its click opens it there.
- Files: `src/finished-elsewhere.ts`, `src/background-page.ts`, `src/background-site.ts`
- Phone: yes
- Spec: `tests/native-save/native-switch-mid-work.spec.ts`
- Steps: none yet (needs work in flight and a second branch)

## Pages and files

### F-pages-01 Pages tab
- Try: Open the explorer on Pages.
- Good: The site by its address, each page by its title with its subpages under it; calm 32 px rows, 44 px with one ⋯ on touch (L3, L9).
- Files: `src/components/pages-tree.ts`, `src/components/pages-tree.css`, `src/controllers/pages-controller.ts`, `src/controllers/pages-state.ts`
- Phone: yes
- Spec: `tests/native-save/native-pages-look.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-01.json`

### F-pages-02 Open a page
- Try: Click a page in Pages, or follow a link in the preview.
- Good: The preview shows it and the top bar names it; a page that is not readable text says so by name, not a blank preview.
- Files: `src/site-preview.ts`, `src/site-loading.ts`, `src/components/page-picker.ts`
- Phone: yes
- Spec: `tests/native-save/native-routing.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-02.json`

### F-pages-03 New page and subpage
- Try: Press + New in Pages for a page, then Add subpage from a page's ⋯.
- Good: Each is made in place as a folder of its own, routes at once, and one Undo takes it back.
- Files: `src/native-create.ts`, `src/native-pages.ts`, `src/pages-and-files-explorer.ts`
- Phone: yes
- Spec: `tests/native-save/native-create.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-03.json`

### F-pages-04 Rename and duplicate a page
- Try: Rename a page's title in its row, then Duplicate it from ⋯.
- Good: The title changes in place with the field taking the whole row; the copy appears beside it.
- Files: `src/components/pages-tree.ts`, `src/controllers/file-operations-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-file-ops.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-04.json`

### F-pages-05 Change URL
- Try: Choose Change URL from a page's ⋯ and type a new address.
- Good: The page, its subpages and every link to them move; the confirmation names the new URL and offers a redirect from the old one; one Undo (B9, B10).
- Files: `src/components/url-change.ts`, `src/native-page-moves.ts`, `shared/site-rules.ts`
- Phone: yes
- Spec: `tests/native-save/native-page-urls.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-05.json`

### F-pages-06 Move a page under another
- Try: Drag a page onto another, or use Move to… from the keyboard.
- Good: Onto a row makes a subpage, onto the line between rows moves it to that level; links follow.
- Files: `src/components/pages-tree.ts`, `src/native-page-moves.ts`
- Phone: no
- Spec: `tests/native-save/native-page-urls.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-06.json`

### F-pages-07 Delete a page
- Try: Delete a page that has subpages and a card linking to it.
- Good: The dialog offers Delete all or Delete only this page; the card goes with its page; one Undo brings everything back (B10).
- Files: `src/controllers/file-operations-controller.ts`, `src/components/confirm-dialog.ts`
- Phone: yes
- Spec: `tests/native-save/native-delete-card-race.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-07.json`

### F-pages-08 Files tab
- Try: Open the explorer on Files.
- Good: A sentence-case header, rows one height with names lined up and icons by kind; the open file is tinted (L3, L9).
- Files: `src/controllers/files-tree-controller.ts`, `src/components/files-tree.css`, `src/components/file-type-icons.ts`
- Phone: yes
- Spec: `tests/native-save/native-files-tab.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-08.json`

### F-pages-09 New file or folder
- Try: Press + New in Files and make a stylesheet and a folder.
- Good: A plain file or folder only (no Page there); a new folder holds a .gitkeep.
- Files: `src/components/create-dialog.ts`, `src/native-create.ts`
- Phone: yes
- Spec: `tests/native-save/native-create.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-09.json`

### F-pages-10 Rename, move and delete files
- Try: F2 on a file row, drag a file onto a folder, delete one from ⋯ and Restore it.
- Good: Links to a renamed file follow; a deleted file stays struck through with Restore until saved; a used image is refused with the page that uses it (B9).
- Files: `src/controllers/file-operations-controller.ts`, `src/controllers/file-operation-checks.ts`, `src/components/file-row-actions.ts`, `src/page-builder/asset-references.ts`
- Phone: yes
- Spec: `tests/native-save/native-file-ops.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-10.json`

### F-pages-11 Upload files into a folder
- Try: Choose Upload files… on a folder, or drop files onto it.
- Good: Each file shows its progress in place and can be cancelled; a big PDF gets a Large download note.
- Files: `src/page-builder/media-files-adding.ts`, `src/page-builder/media-files-adding-runs.ts`, `src/uploads.ts`
- Phone: yes
- Spec: `tests/native-save/native-upload.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-11.json`

### F-pages-12 Page settings
- Try: Open Page settings and type a title and a description.
- Good: The head and the sharing tags follow as typed, one Undo step each; the first heading is the title's placeholder (B11).
- Files: `src/native-settings.ts`, `src/page-builder/site-head.ts`, `src/components/site-settings.ts`
- Phone: yes
- Spec: `tests/native-save/native-page-details.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-12.json`

### F-pages-13 Sharing preview and social image
- Try: In Page settings look at the share card, choose a social image and move its frame.
- Good: A live share card; the sharing copy is one centred JPEG; an animated picture says it cannot be framed.
- Files: `src/page-builder/social-sharing.ts`, `src/page-builder/social-image.ts`, `src/page-builder/social-image-popup.ts`, `src/components/settings-preview.ts`
- Phone: yes
- Spec: `tests/native-save/native-social-image.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-13.json`

### F-pages-14 Site settings
- Try: Press the gear and set the site's name, address, favicon and default social image; open the 404 page.
- Good: Categories keep every value until Apply or Cancel; a sub-folder address moves every link and picture with one Undo; it fits 390 px.
- Files: `src/components/site-settings.ts`, `src/page-builder/site-identity.ts`, `src/page-builder/site-address-rewrite.ts`
- Phone: yes
- Spec: `tests/native-save/native-site-settings.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-14.json`

### F-pages-15 Navigation
- Try: Open Navigation and rename, reorder and add pages and an outside link.
- Good: The shared header changes on every page; a new top-level page can join it in the same Undo step.
- Files: `src/page-builder/site-navigation.ts`, `src/native-settings.ts`
- Phone: yes
- Spec: `tests/native-save/native-site-settings.spec.ts`
- Steps: `scripts/agents/shots/features/F-pages-15.json`

### F-pages-16 Resize and hide the explorer
- Try: Drag the sidebar handle, click it to hide and show, and reload.
- Good: It grows on hover, hides and comes back at its old width, and remembers both after a reload.
- Files: `src/components/sidebar-resize.ts`, `src/components/resize-handle.ts`
- Phone: no
- Spec: `tests/native-save/native-resize-toggle.spec.ts`
- Steps: none yet (needs a drag or a click on the resize handle, which steps cannot grab)

## Page editing on the canvas

### F-canvas-01 Click to type
- Try: Click once inside a heading, a paragraph and a link, and type.
- Good: The caret lands where clicked and the text changes in place; Escape ends typing and selects the block (B1).
- Files: `src/components/native-preview-runtime.js`, `src/components/click-timing.ts`, `src/page-builder/rules/canvas-gesture.ts`
- Phone: yes
- Spec: `tests/native-save/native-click-to-type.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-canvas-02 Select an element
- Try: Click an image or the edge of a block; press Ctrl+Up to climb.
- Good: Hover labels the element, a click selects it with its edit bar, the breadcrumb shows its ancestors (B1).
- Files: `src/controllers/preview-selection-controller.ts`, `src/components/canvas-bar.ts`, `src/components/canvas-path.ts`
- Phone: yes
- Spec: `tests/native-save/native-canvas.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-02.json`

### F-canvas-03 Block rail
- Try: Click Section, Div, Heading, Paragraph, Image or Button in the rail beside Page structure.
- Good: The block goes after the selection, arrives selected and not typing, one Undo step each; on a phone the rail is a row above the page (B1, B10).
- Files: `src/components/block-rail.ts`, `src/components/block-rail.css`, `src/controllers/block-insert-controller.ts`, `src/page-builder/block-insert.ts`
- Phone: yes
- Spec: `tests/native-save/native-blocks.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-03.json`

### F-canvas-04 Drag a block in from the rail
- Try: Drag a Paragraph from the rail into a card of a grid; hold Alt to step up a level; Escape to cancel.
- Good: It lands in the gap under the pointer; an empty Div shows its drop area; a Section snaps between bands (B3, U2).
- Files: `src/page-builder/block-drag.ts`, `src/page-builder/block-drag-session.ts`, `src/page-builder/insert-drag.ts`, `src/page-builder/drop-target.ts`
- Phone: no
- Spec: `tests/native-save/native-block-drag.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-canvas-05 Move anything by dragging
- Try: Press and drag a heading out of its section, a card sideways, an image out of a Div.
- Good: What is under the pointer moves, anywhere valid HTML allows; a refusal says why by the pointer and only names the element (B3, U1, U2).
- Files: `src/page-builder/block-move.ts`, `src/page-builder/block-move-rules.ts`, `src/page-builder/rules/movable.ts`, `src/page-builder/drop-indicator.ts`
- Phone: no
- Spec: `tests/native-save/native-move-anywhere.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-canvas-06 Move with the keyboard
- Try: Select a section and press Alt+Up and Alt+Down; a card with Alt+Left and Alt+Right.
- Good: It moves one place per press, stops at the ends and stays selected; each press is one Undo step (B10).
- Files: `src/page-builder/block-move.ts`, `src/page-builder/section-snap.ts`
- Phone: no
- Spec: `tests/native-save/native-move-keys.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-06.json`

### F-canvas-07 Delete the selected element
- Try: Select a paragraph and press Delete.
- Good: It goes, the next sibling is selected, and one Undo brings it back; main, the page header and footer are protected (B2, B10).
- Files: `src/page-builder/remove.ts`, `src/controllers/page-structure-controller.ts`
- Phone: no
- Spec: `tests/native-save/native-delete-key.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-07.json`

### F-canvas-08 Add panel
- Try: Press Add (or a + between sections) and click or drag a section or component.
- Good: Live thumbnails of whole sections; a click adds after the selected section, the panel closes after adding (B12).
- Files: `src/page-builder/add-panel.ts`, `src/page-builder/add-catalog.ts`, `src/page-builder/thumbnail.ts`, `src/components/insert-controls.ts`
- Phone: yes
- Spec: `tests/native-save/native-add-panel.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-08.json`

### F-canvas-09 Add a list item or card
- Try: Hover a list or grid and press the Add after its last item.
- Good: A copy with placeholder text appears and is selected, one Undo step; the controls never cover each other (U5).
- Files: `src/page-builder/cards.ts`, `src/components/card-grid-controls.ts`, `src/components/card-ghost-view.ts`
- Phone: yes
- Spec: `tests/native-save/native-cards.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-canvas-10 Link a card to a page
- Try: Add card, then pick a page in Link to a page…, or type a new address to create one.
- Good: The card takes the page's title, text and image; a short flat list (S6, B8); one Undo per step.
- Files: `src/components/card-link-picker.ts`, `src/page-builder/card-fill.ts`, `src/page-builder/card-slot.ts`
- Phone: yes
- Spec: `tests/native-save/native-add-card.spec.ts`
- Steps: none yet (needs Add card, shown on a hovered grid inside the page frame)

### F-canvas-11 Card looks
- Try: Open Add card ▾ and pick another look for a blank card.
- Good: The looks show rendered; the swap keeps an edited image aside and each swap is one Undo step.
- Files: `src/components/card-look-gallery.ts`, `src/page-builder/card-looks.ts`, `src/page-builder/card-swap.ts`
- Phone: yes
- Spec: `tests/native-save/native-add-card.spec.ts`
- Steps: none yet (needs Add card, shown on a hovered grid inside the page frame)

### F-canvas-12 Frame width and breakpoints
- Try: Press the desktop, tablet and phone buttons above the page, drag the frame's side, type a width.
- Good: The frame resizes, the width shows in px, and the session remembers it.
- Files: `src/components/canvas-bar.ts`, `src/page-builder/breakpoints.ts`
- Phone: yes
- Spec: `tests/native-save/native-canvas.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-12.json`

### F-canvas-13 Follow links in the preview
- Try: Ctrl/⌘+click a link in the page.
- Good: The linked page opens in the same frame; a link to a fragment scrolls to it; the header marks the page on show.
- Files: `src/components/native-preview.ts`, `src/site-preview.ts`
- Phone: no
- Spec: `tests/native-save/native-preview-links.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-canvas-14 Live preview of every change
- Try: Edit text, CSS in the code pane and a component template.
- Good: The page updates in place with the scroll kept and no reload; every instance of a component follows (U3).
- Files: `src/components/native-preview.ts`, `src/components/native-preview-runtime.js`, `src/components/preview-link.ts`
- Phone: yes
- Spec: `tests/native-preview/native-preview.spec.ts`
- Steps: `scripts/agents/shots/features/F-canvas-14.json`

## Edit bar

### F-bar-01 Edit bar on the selection
- Try: Select a heading, a section and a component part.
- Good: The bar sits by the element with its name as a label and never covers the text being edited; groups wrap whole on narrow frames (L4, U5).
- Files: `src/components/edit-bar.ts`, `src/components/edit-bar.css`, `src/components/edit-bar-placement.ts`, `src/controllers/page-structure-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-edit-bar.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-01.json`

### F-bar-02 Heading level, Bold and Italic
- Try: Select a heading and change its level; select a word and press B, then Ctrl+I.
- Good: The level changes in page and source; only the selected word is wrapped; B again unwraps it.
- Files: `src/controllers/page-structure-controller.ts`, `src/components/edit-bar.ts`
- Phone: yes
- Spec: `tests/native-save/native-edit-bar.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-02.json`

### F-bar-03 Text size
- Try: Select text and open Text size.
- Good: Offers the site's own size classes or variables, written as the site writes them.
- Files: `src/native-text-size.ts`, `src/controllers/page-structure-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-text-size.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-03.json`

### F-bar-04 Link and Address
- Try: Select a word, press Link (or Ctrl+K), type an address or pick a page; open Open in new tab.
- Good: The address applies as typed with page suggestions that fit the field; Remove link unwraps; one Undo step per opening (B11).
- Files: `src/components/field-suggestions.ts`, `src/page-builder/page-choices.ts`, `src/controllers/page-structure-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-link.spec.ts`
- Steps: none yet (needs text selected inside the page frame)

### F-bar-05 Button variant and size
- Try: Select a button and pick a Variant and a Size.
- Good: Only the site's own variants show; Default removes the attribute; an empty button asks what it does.
- Files: `src/page-builder/block-fields.ts`, `src/page-builder/variant-fields.ts`, `shared/variants.ts`
- Phone: yes
- Spec: `tests/native-save/native-block-bars.spec.ts`
- Steps: none yet (the starter defines no button variants or sizes)

### F-bar-06 Div Layout
- Try: Select a Div and pick another Layout.
- Good: The classes swap and back, the selection stays, one Undo per pick.
- Files: `src/page-builder/block-fields.ts`, `src/controllers/page-structure-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-block-bars.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-06.json`

### F-bar-07 Tone
- Try: Select a band (a section, the header or the footer) and pick Brand, Light or No tone.
- Good: The band recolours and everything in it stays readable; cards and nested sections offer no Tone (B5, L12).
- Files: `shared/tone.ts`, `src/page-builder/variant-fields.ts`
- Phone: yes
- Spec: `tests/native-save/native-tone.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-07.json`

### F-bar-08 Component variants
- Try: Select a component instance with variants and open Variants.
- Good: Picking writes its attribute, the default removes it; a value styled only on wide screens says so.
- Files: `src/page-builder/variant-fields.ts`, `shared/variant-lookup.ts`
- Phone: yes
- Spec: `tests/native-save/native-variants.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-08.json`

### F-bar-09 Duplicate, move and remove from the bar
- Try: Select a section and use Move up, Move down, Duplicate and Remove; drag it by its name.
- Good: Only sections show move controls; the copy is selected; each is one Undo step (B5, B10).
- Files: `src/controllers/page-structure-controller.ts`, `src/page-builder/block-move.ts`, `src/page-builder/remove.ts`
- Phone: yes
- Spec: `tests/native-save/native-section-drag.spec.ts`
- Steps: `scripts/agents/shots/features/F-bar-09.json`

### F-bar-10 Native fields for forms and embeds
- Try: Select a form, an input and an embed.
- Good: Method, name, title and a safe address are plain fields; other attributes stay as written.
- Files: `src/page-builder/native-element-fields.ts`, `src/page-builder/native-elements.ts`
- Phone: yes
- Spec: `tests/native-save/native-fields-host.spec.ts`
- Steps: none yet (the starter has no form or embed)

### F-bar-11 Right-click element menu
- Try: Right-click a section in the page.
- Good: A menu of the actions that fit it (Make component on containers only); Escape, a press or a scroll closes it (B4, B5).
- Files: `src/components/element-menu.ts`, `src/page-builder-host.ts`
- Phone: no
- Spec: `tests/native-save/native-make-component-menus.spec.ts`
- Steps: none yet (needs a right-click inside the page frame)

## Page Structure

### F-structure-01 Page structure tree
- Try: Open Page structure beside the page.
- Good: Every element in source order as one tidy list; a row selects its element and brings it into view; the tree follows the page (L9).
- Files: `src/components/page-structure.ts`, `src/components/page-structure.css`, `src/native-structure.ts`
- Phone: yes
- Spec: `tests/native-save/native-page-structure.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-01.json`

### F-structure-02 Edit text in a row
- Try: Click a row once, then again; or press Enter on it.
- Good: The text edits in place in the row, Shift+Enter adds a line break, Enter commits back to the row (B4).
- Files: `src/components/structure-editing.ts`, `src/components/page-structure.ts`
- Phone: yes
- Spec: `tests/native-save/native-structure-inplace.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-02.json`

### F-structure-03 Drag rows
- Try: Drag a row to a new depth; drag a Section between bands; hold a rail block over a folded row.
- Good: The drop line shows the depth the pointer gives; folded rows spring open and fold back after (B3).
- Files: `src/page-builder/tree-drop.ts`, `src/components/structure-follow.ts`
- Phone: no
- Spec: `tests/native-save/native-structure-drag.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-03.json`

### F-structure-04 Row menu and keys
- Try: Open a row's ⋯ or right-click it; press Delete and Alt+Down on a focused row.
- Good: The same actions as on the page; rows carry no delete icons (B2, B4).
- Files: `src/components/row-menu.ts`, `src/components/row-actions.ts`, `src/components/page-structure.ts`
- Phone: yes
- Spec: `tests/native-save/native-move-host.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-04.json`

### F-structure-05 One-press accessibility fixes
- Try: Open a page with a skipped heading level or an unlabelled section.
- Good: Its row offers one press that fixes it.
- Files: `src/components/page-structure.ts`, `src/controllers/page-structure-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-structure.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-05.json`

### F-structure-06 Slot fields
- Try: Select a component instance and edit its slots in Page structure: text, a link, an image, an optional part.
- Good: Fields open on request, keep the caret, hide and show optional slots with the eye; unchanged values write nothing.
- Files: `src/components/structure-editing.ts`, `src/components/slot-ghosts.ts`
- Phone: yes
- Spec: `tests/native-save/native-structure-slots.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-06.json`

### F-structure-07 Attributes
- Try: Open Attributes on a row and edit, add and remove one.
- Good: Opens inline, keeps class, id and custom values editable, refuses unsafe names.
- Files: `src/components/structure-editing.ts`
- Phone: yes
- Spec: `tests/native-save/native-structure-compact.spec.ts`
- Steps: `scripts/agents/shots/features/F-structure-07.json`

### F-structure-08 Resize and fold Page structure
- Try: Drag the Page structure edge, fold it and reload.
- Good: It resizes and folds, and remembers both while slot fields stay usable.
- Files: `src/page-builder/component-panel-resize.ts`, `src/components/resize-handle.ts`
- Phone: no
- Spec: `tests/native-save/native-component-resize.spec.ts`
- Steps: none yet (needs a drag on the resize handle, which steps cannot grab)

## Components and Edit component mode

### F-component-01 Make component
- Try: Right-click a section (or use its ⋯ in Page structure) and choose Make component.
- Good: It becomes a component at once, named from its heading, with its styles carried over; Edit component mode opens; one Undo; offered on containers and the page's header and footer only (B4, B5, B6).
- Files: `src/page-builder/component-model.ts`, `src/page-builder/component-plans.ts`, `src/page-builder/component-css.ts`, `src/page-builder/component-loader.ts`
- Phone: yes
- Spec: `tests/native-save/native-make-component.spec.ts`
- Steps: `scripts/agents/shots/features/F-component-01.json`

### F-component-02 New component
- Try: In the Add panel choose New component and type a name.
- Good: The files are drafted, a section is placed and Edit component mode opens; names are checked as typed; one Undo.
- Files: `src/page-builder/blank-component.ts`, `src/page-builder/component-names.ts`, `src/page-builder/add-panel.ts`
- Phone: yes
- Spec: `tests/native-save/native-new-component.spec.ts`
- Steps: `scripts/agents/shots/features/F-component-02.json`

### F-component-03 Edit component mode
- Try: Select an instance and press its pencil (or Edit component).
- Good: The instance is framed in place, its template edits for every page, the page around is not clickable, Done leaves without reload (B11).
- Files: `src/page-builder/edit-component-mode.ts`, `src/page-builder/edit-component-mode.css`, `src/page-builder/component-mode.ts`, `src/page-builder/edit-mode-bar-fit.ts`
- Phone: yes
- Spec: `tests/native-save/native-edit-component-mode-actual.spec.ts`
- Steps: `scripts/agents/shots/features/F-component-03.json`

### F-component-04 Slot chip
- Try: In Edit component mode toggle a part's slot chip and double-click it to rename the slot.
- Good: The template and every page change in one Undo step, without a frame reload.
- Files: `src/components/slot-chip.ts`, `src/page-builder/slot-menu.ts`
- Phone: yes
- Spec: `tests/native-save/native-slot-chip-apply-actual.spec.ts`
- Steps: `scripts/agents/shots/features/F-component-04.json`

### F-component-05 Rename a component
- Try: In Edit component mode rename the component from its bar and press Done.
- Good: Files, CSS and every page's instances follow (B9).
- Files: `src/page-builder/component-rename.ts`, `src/page-builder/component-names.ts`
- Phone: yes
- Spec: `tests/native-save/native-rename-component-actual.spec.ts`
- Steps: none yet (renaming needs F2 on the component's name in its bar, which steps cannot focus)

### F-component-06 Nested components
- Try: In Edit component mode open a card component inside the section.
- Good: It opens in place behind a breadcrumb that returns; Esc keeps the chain.
- Files: `src/page-builder/edit-component-mode.ts`, `src/page-builder/native-component-selection.ts`
- Phone: yes
- Spec: `tests/native-save/native-edit-component-drill-actual.spec.ts`
- Steps: none yet (the starter has no component inside another component)

### F-component-07 Fixed parts
- Try: Click a fixed (non-slot) part of an instance on a page.
- Good: It selects the instance with its normal bar and stays locked, with no hint line (S1).
- Files: `src/page-builder/components.ts`, `src/page-builder/rules/movable.ts`
- Phone: yes
- Spec: `tests/native-save/native-locked-fixed-parts-actual.spec.ts`
- Steps: none yet (needs a click, key or drag inside the page frame)

### F-component-08 Detach and Used on
- Try: On an instance use Detach; on a nested one use Used on.
- Good: Detach replaces it with the markup it shows; Used on opens the page instance.
- Files: `src/page-builder/components.ts`
- Phone: yes
- Spec: `tests/native-save/native-components.spec.ts`
- Steps: `scripts/agents/shots/features/F-component-08.json`

### F-component-09 Component loader added when needed
- Try: Make a component on a Blank page site.
- Good: The loader is added to every page in the same step, with no note to read (B6, B10).
- Files: `src/page-builder/component-loader.ts`, `src/page-builder/starter-loader.ts`
- Phone: yes
- Spec: `tests/native-save/native-component-loader.spec.ts`
- Steps: none yet (needs a Blank page site; the starter already loads components)

### F-component-10 Build inside the template
- Try: In Edit component mode click a Paragraph from the rail into the items slot and drag a Heading in.
- Good: They land in the template; a Section is refused with its reason (B3).
- Files: `src/page-builder/edit-component-mode.ts`, `src/page-builder/block-insert.ts`
- Phone: yes
- Spec: `tests/native-save/native-edit-component-blocks-actual.spec.ts`
- Steps: none yet (in Edit component mode a rail block's name also matches Page structure row buttons, and rail drags onto rows land by the pointer's x)

## Media and the image popup

### F-media-01 Media tab
- Try: Open the Media tab between Pages and Files.
- Good: Square tiles of just the picture, names on hover or focus, the One bar of search, Filter, + and More with 16 px above the grid (L5, L7, S2).
- Files: `src/page-builder/media-library-view.ts`, `src/page-builder/media-library-shell.ts`, `src/page-builder/media-library-grid.ts`, `src/page-builder/media-picker.css`
- Phone: yes
- Spec: `tests/native-save/native-media-tab.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-01.json`

### F-media-02 Search and Filter
- Try: Type in the search, then pick a kind in Filter.
- Good: The grid narrows after a short pause with focus kept; Filter reads as a muted label and its value (L6); no results offer all media.
- Files: `src/page-builder/media-library-filter.ts`, `src/page-builder/media-library-input.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-search-pause.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-02.json`

### F-media-03 Add media
- Try: Press + or drop pictures, a video and a PDF onto Media.
- Good: Each file is prepared in the browser with progress in the tray; the new file leads the grid, scrolled to and ringed (B12, U4).
- Files: `src/page-builder/media-library-adding.ts`, `src/page-builder/media-prepare.ts`, `src/page-builder/media-adding-rules.ts`, `src/page-builder/media-adding-summary.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-newest.spec.ts`
- Steps: none yet (needs files chosen or dropped from the computer)

### F-media-04 Adding settings
- Try: Open Adding settings from More and pick Smaller files and Keep original.
- Good: One card of choices per kind with a ✓; remembered for the site; each change is one Undo.
- Files: `src/page-builder/media-adding-settings.ts`, `src/page-builder/media-settings.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-adding.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-04.json`

### F-media-05 File details
- Try: Open a picture's details and edit its name, description and tags.
- Good: A calm stage beside a narrow inspector; Save details is one Undo step; on a phone it is its own screen with Back (L8).
- Files: `src/page-builder/media-library-details.ts`, `src/page-builder/media-file-details.ts`, `src/page-builder/media-detail.css`
- Phone: yes
- Spec: `tests/native-save/native-media-screen.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-05.json`

### F-media-06 Usage
- Try: Hover or tap a tile's usage, then a page name.
- Good: Used on N pages or No uses found; a page name opens that page.
- Files: `src/page-builder/media-library-usage.ts`, `src/page-builder/media-usage.ts`, `src/page-builder/media-usage-text.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-screen.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-06.json`

### F-media-07 Rename a media file
- Try: Rename a used picture in File details with Keep the old address working ticked.
- Good: Pages still show it and the old address forwards; a taken name is said before saving (B9).
- Files: `src/page-builder/media-rename.ts`, `src/page-builder/media-names.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-rename.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-07.json`

### F-media-08 Replace everywhere
- Try: In File details choose Replace everywhere and pick another picture.
- Good: Every page shows the new picture under the old address, in one Undo; the old one goes to Recently removed.
- Files: `src/page-builder/media-library-replace.ts`, `src/page-builder/media-replace-rules.ts`, `src/page-builder/replace-everywhere.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-rename.spec.ts`
- Steps: none yet (the starter has one PNG, so Replace everywhere offers nothing else to choose)

### F-media-09 Collections
- Try: Select two files, make a New collection, view it and take one out.
- Good: The file stays under All; Manage collections renames and deletes; one Undo each.
- Files: `src/page-builder/media-library-collections.ts`, `src/page-builder/media-collections.ts`, `src/page-builder/media-collection-choices.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-collections.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-09.json`

### F-media-10 Selection bar
- Try: Select several tiles.
- Good: One slim row with every action in view and Remove last, in red; on a phone removal sits last in ⋯ (L4, L10).
- Files: `src/page-builder/media-library-shell.ts`, `src/page-builder/media-collection-choices.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-tiles.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-10.json`

### F-media-11 Remove and Recently removed
- Try: Remove a used file, then restore it from Recently removed.
- Good: The warning names the pages that use it; Recently removed restores it with one click, even after saving.
- Files: `src/page-builder/media-library-delete.ts`, `src/page-builder/media-library-recently-removed.ts`, `src/page-builder/media-recently-removed.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-cleanup.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-11.json`

### F-media-12 Clean up
- Try: Open More and choose Clean up (n).
- Good: The count lives in the menu only; the review shows unused files to remove, undone with one Undo (S2, S3).
- Files: `src/page-builder/media-library-clean-up.ts`, `src/page-builder/media-clean-up.ts`, `src/page-builder/media-clean-up-review.ts`, `src/page-builder/media-clean-up-menu.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-cleanup.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-12.json`

### F-media-13 Improve images
- Try: Open More and choose Improve images.
- Good: Heavy pictures are listed and turned into lighter copies; untick, Cancel mid-run and Undo all work.
- Files: `src/page-builder/media-library-improve.ts`, `src/page-builder/improve-images.ts`, `src/page-builder/improve-heavy.ts`, `src/page-builder/improve-images-run.ts`
- Phone: yes
- Spec: `tests/native-save/native-improve-images.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-13.json`

### F-media-14 Optimise before adding
- Try: Drop a large photo and choose Review… to open Optimise.
- Good: The preview shows the result and size; reviewed files wait until Use; Cancel stops the work.
- Files: `src/page-builder/media-library-optimise.ts`, `src/page-builder/media-library-optimise-rules.ts`, `src/page-builder/media-optimise.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-library.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-14.json`

### F-media-15 To check
- Try: After an agent describes a picture, open To check.
- Good: Descriptions marked by agent wait for Looks right or an edit.
- Files: `src/page-builder/media-library-to-check.ts`, `src/page-builder/media-descriptions.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-screen.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-15.json`

### F-media-16 Media picker
- Try: Double-click a placeholder image, search, choose a picture and press Use.
- Good: The picker shows files that fit; the file just added is chosen so Use is one tap; full-screen on a phone with Cancel and Use in one row.
- Files: `src/page-builder/media-picker.ts`, `src/page-builder/media-place.ts`, `src/page-builder/media-picker-close.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-picker.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-16.json`

### F-media-17 Image popup: shape and focus point
- Try: Double-click a picture on the page, pick Square and move the focus dot.
- Good: Changes apply at once; Close or Escape keeps them as one Undo step; a bottom sheet with 44 px targets on a phone (B11, U4).
- Files: `src/page-builder/image-popup.ts`, `src/page-builder/image-popup-view.ts`, `src/page-builder/image-popup-rules.ts`, `src/page-builder/shape-menu.ts`
- Phone: yes
- Spec: `tests/native-save/native-image-popup.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-17.json`

### F-media-18 Image popup: trim, zoom and turn
- Try: In the popup choose Free, zoom in, turn, and open the large editor.
- Good: A trimmed copy is made for this place only; zooming and moving never flicker or show the page (U3).
- Files: `src/page-builder/image-popup-trim.ts`, `src/page-builder/image-large-editor.ts`, `src/page-builder/trimmed-copies.ts`, `src/page-builder/place-trim.ts`
- Phone: yes
- Spec: `tests/native-save/native-image-popup.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-18.json`

### F-media-19 Image popup: Replace
- Try: In the popup press Replace and choose another picture.
- Good: The popup closes and the picture is placed at once, keeping the shape; one Undo restores the original.
- Files: `src/page-builder/image-popup.ts`, `src/page-builder/media-place-swap.ts`
- Phone: yes
- Spec: `tests/native-save/native-image-popup.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-19.json`

### F-media-20 Image placeholder first
- Try: Click Image in the rail.
- Good: A visible placeholder arrives with no picker; Replace picks the real file afterwards (B7).
- Files: `src/page-builder/block-insert.ts`, `src/page-builder/media-insert.ts`
- Phone: yes
- Spec: `tests/native-save/native-blocks.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-20.json`

### F-media-21 Add a video, audio or PDF to a page
- Try: In Add → Media place a video, an audio file and a PDF.
- Good: The video shows its still and player, audio its length, the PDF a card; the canvas keeps them still (B7).
- Files: `src/page-builder/media-insert.ts`, `src/page-builder/player-markup.ts`, `src/page-builder/pdf-preview.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-video.spec.ts`
- Steps: none yet (the starter has no video, audio or PDF)

### F-media-22 Online video
- Try: Paste a YouTube or Vimeo address in Add → Media.
- Good: Its still and play button are placed; Media lists it with its mark; the service loads only on play.
- Files: `src/page-builder/online-video.ts`, `src/page-builder/online-video-add.ts`, `src/page-builder/online-video-place.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-video.spec.ts`
- Steps: none yet (needs an address pasted into Add, Media, which steps cannot reach)

### F-media-23 Play on the canvas
- Try: Select a video or audio and press Play in the edit bar, then Stop.
- Good: It plays in place and Stop gives back its still, writing nothing.
- Files: `src/page-builder/media-play.ts`
- Phone: yes
- Spec: `tests/native-save/native-placed-media.spec.ts`
- Steps: none yet (the starter has no video or audio to play)

### F-media-24 Looping and background video
- Try: Put a video in a picture spot; pick a section background from Media.
- Good: The spot loops silently with a pause button; the background saves as the section's first child; one Undo each.
- Files: `src/page-builder/media-video-place.ts`, `src/page-builder/looping-video.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-video.spec.ts`
- Steps: none yet (the starter has no video)

### F-media-25 Video details: still and subtitles
- Try: In a video's details pick a moment as its still and add an .srt file.
- Good: The still changes and a subtitle track is added.
- Files: `src/page-builder/media-library-video.ts`, `src/page-builder/video-details.ts`, `src/page-builder/video-moment.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-video.spec.ts`
- Steps: none yet (the starter has no video)

### F-media-26 Media popup for audio, downloads and online video
- Try: Select an audio, a download card or an online video and press Media in the bar.
- Good: The popup offers Title and Replace for that kind.
- Files: `src/page-builder/media-spot-popup.ts`, `src/page-builder/media-popup-frame.ts`, `src/page-builder/media-spot-rules.ts`
- Phone: yes
- Spec: `tests/native-save/native-media-button.spec.ts`
- Steps: none yet (the starter has no audio, download or online video)

### F-media-27 Descriptions and Decorative
- Try: Place a picture with no description, then give it one in File details; mark another Decorative.
- Good: The page shows the description; Decorative clears and locks it; a missing one shows as Not described yet.
- Files: `src/page-builder/media-descriptions.ts`, `src/page-builder/media-metadata.ts`
- Phone: yes
- Spec: `tests/native-save/native-image-alt-refusal.spec.ts`
- Steps: `scripts/agents/shots/features/F-media-27.json`

## Code panes

### F-code-01 Code editor
- Try: Select an element; the code pane opens its file with the caret after its start tag.
- Good: Full editing, syntax colours in light and dark, the head and sections folded at first.
- Files: `src/components/code-editor.ts`, `src/components/monaco.ts`, `src/controllers/code-panes-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-editor-features.spec.ts`
- Steps: `scripts/agents/shots/features/F-code-01.json`

### F-code-02 Linked styles pane
- Try: Select a heading and look at the second pane.
- Good: The stylesheet rule that styles it opens beside the page, with chips for the rules that apply.
- Files: `src/controllers/linked-styles-controller.ts`, `src/style-cascade.ts`, `src/styles-index.ts`
- Phone: yes
- Spec: `tests/native-save/native-selector.spec.ts`
- Steps: `scripts/agents/shots/features/F-code-02.json`

### F-code-03 CSS help
- Try: Type a bare value in CSS and hover a variable.
- Good: Suggestions offer var(); hover shows where it is set; go to definition opens it.
- Files: `src/page-builder/css-intelligence.ts`
- Phone: no
- Spec: `tests/native-save/native-css-intelligence.spec.ts`
- Steps: none yet (needs typing and hovering inside the code editor)

### F-code-04 Variant suggestions in HTML
- Try: Type a component's tag attributes in the HTML pane.
- Good: Its variant attributes and values are offered.
- Files: `src/page-builder/variant-intelligence.ts`
- Phone: no
- Spec: `tests/native-save/native-code-variants.spec.ts`
- Steps: none yet (needs typing inside the code editor)

### F-code-05 Hide and resize code
- Try: Drag the code edge down to hide it, press its grip to restore; use Hide code from the palette.
- Good: Code hides completely and comes back at its old height with the cursor and Undo kept.
- Files: `src/components/code-resize.ts`, `src/components/resize-handle.ts`
- Phone: yes
- Spec: `tests/native-save/native-code-visible.spec.ts`
- Steps: `scripts/agents/shots/features/F-code-05.json`

### F-code-06 Drop a file path into code
- Try: Drag a Files row into the code pane.
- Good: Its plain path is inserted where dropped; let go elsewhere, the explorer comes back.
- Files: `src/monaco-drop-adapter.ts`
- Phone: no
- Spec: `tests/native-save/native-monaco-features.spec.ts`
- Steps: none yet (needs a drop inside the code editor)

### F-code-07 Fast first paint before code loads
- Try: Open a site and type in the page before the code editor has loaded.
- Good: The page paints first; edits are drafts at once, in order, and Save works.
- Files: `src/lazy-loaders.ts`, `src/lazy-module.ts`
- Phone: yes
- Spec: `tests/native-save/native-monaco-deferred.spec.ts`
- Steps: none yet (needs typing in the page before the code editor loads)

## Versions and history

### F-history-01 Undo and Redo
- Try: Make edits in the page, Page structure and code, then press Undo and Redo in the top bar.
- Good: One user action is one step and Undo restores all of it; the preview and Save stay in step (B10).
- Files: `src/draft-store.ts`, `src/guarded-edit/commit.ts`, `src/editor-workspace.ts`
- Phone: yes
- Spec: `tests/native-save/native-guarded-history.spec.ts`
- Steps: `scripts/agents/shots/features/F-history-01.json`

### F-history-02 History panel
- Try: Press History and choose a commit.
- Good: That version shows in the preview beside the current one, until Back to latest; nothing can be added meanwhile.
- Files: `src/version-view.ts`, `src/controllers/history-controller.ts`, `src/components/commit-history.ts`
- Phone: yes
- Spec: `tests/native-save/native-history.spec.ts`
- Steps: none yet (the starter has one commit, so there is no other version to show)

### F-history-03 Restore this version
- Try: In History press Restore this version.
- Good: It asks, then restores in a new commit.
- Files: `src/version-view.ts`, `worker/history.ts`
- Phone: yes
- Spec: `tests/native-save/native-history.spec.ts`
- Steps: none yet (the starter has one commit, so there is no older version)

### F-history-04 Whole-site history
- Try: In History choose Whole site and unfold a commit.
- Good: Every commit lists its files; a file opens as it was then.
- Files: `src/components/commit-history.ts`
- Phone: yes
- Spec: `tests/native-save/native-history.spec.ts`
- Steps: `scripts/agents/shots/features/F-history-04.json`

### F-history-05 Drafts survive a reload
- Try: Edit, reload the tab.
- Good: Every unsaved change is still there, even past 5 MB.
- Files: `src/drafts.ts`, `src/draft-store.ts`, `src/browser-storage.ts`
- Phone: yes
- Spec: `tests/native-save/native-draft-storage.spec.ts`
- Steps: none yet (needs a reload)

### F-history-06 Undo for work on another page
- Try: Let an agent or a held upload finish on a page not shown, then open that page.
- Good: Its change is that page's newest Undo, never the shown page's.
- Files: `src/guarded-edit/parked.ts`, `src/background-page.ts`
- Phone: yes
- Spec: `tests/native-save/native-invisible-multiplayer.spec.ts`
- Steps: none yet (needs an agent or a held upload on another page)

## Publish and discard

### F-publish-01 Publish menu
- Try: Open Publish in the top bar.
- Good: The changes to publish by count, a side-by-side comparison of each, and Publish as one commit (L10).
- Files: `src/components/publish-menu.ts`, `src/components/publish-menu.css`, `src/controllers/save-publish-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-save.spec.ts`
- Steps: `scripts/agents/shots/features/F-publish-01.json`

### F-publish-02 Save to GitHub
- Try: Edit, then Publish.
- Good: One commit with every changed file; the preview and scroll stay; a later edit is a fresh draft.
- Files: `src/controllers/save-publish-controller.ts`, `worker/publish.ts`
- Phone: yes
- Spec: `tests/native-save/native-save.spec.ts`
- Steps: `scripts/agents/shots/features/F-publish-02.json`

### F-publish-03 Change status
- Try: Publish on a site with a deploy workflow.
- Good: The button reads Saved, then Deploying…, then Published with View live site in its menu; Deploy failed links to its run; the state shows on the button itself (S4).
- Files: `src/deploy-status.ts`, `src/components/site-actions.ts`, `worker/change-status.ts`
- Phone: yes
- Spec: `tests/native-save/native-change-status.spec.ts`
- Steps: none yet (the fake GitHub server runs no deploy workflow)

### F-publish-04 Conflicts with GitHub
- Try: Change a file on GitHub that has a draft here, then Publish.
- Good: The draft is kept with the preview; a file deleted on GitHub offers Discard draft or Keep as new file.
- Files: `src/controllers/save-publish-controller.ts`, `src/file-changes.ts`
- Phone: yes
- Spec: `tests/native-save/native-deleted-upstream.spec.ts`
- Steps: none yet (needs a change made on GitHub during the try)

### F-publish-05 Discard changes
- Try: In the Publish menu choose Discard changes.
- Good: Last, in red, behind a confirmation; every draft goes; the menu works from the keyboard and returns focus (L10, U7).
- Files: `src/components/publish-menu.ts`, `src/components/confirm-dialog.ts`
- Phone: yes
- Spec: `tests/native-save/native-discard.spec.ts`
- Steps: `scripts/agents/shots/features/F-publish-05.json`

### F-publish-06 Discard one file
- Try: In the Publish menu discard one file's change, or Move back a moved one.
- Good: Only that file returns to the saved version.
- Files: `src/components/publish-menu.ts`, `src/draft-store.ts`
- Phone: yes
- Spec: `tests/native-save/native-discard.spec.ts`
- Steps: `scripts/agents/shots/features/F-publish-06.json`

## Agents menu and agent connection

### F-agent-01 Connect to MCP
- Try: Open the project menu and press Connect to MCP, then paste the prompt into an agent.
- Good: Three actions only (Connect to MCP, Wait for MCP, Disconnect MCP); the label confirms the copy and the dot shows the state, with no toast or explainer (S1, S4).
- Files: `src/components/agent-menu.ts`, `src/components/agent-menu.css`, `src/agent-menu-host.ts`, `src/controllers/agent-controller.ts`
- Phone: yes
- Spec: `tests/native-save/native-mcp-menu.spec.ts`
- Steps: `scripts/agents/shots/features/F-agent-01.json`

### F-agent-02 Wait for MCP and Disconnect MCP
- Try: With an agent connected, open the project menu and press Wait for MCP; later Disconnect MCP.
- Good: The agent waits for requests; Disconnect ends every agent on the connection at once.
- Files: `src/components/agent-menu.ts`, `src/agent-watch.ts`
- Phone: yes
- Spec: `tests/native-save/native-mcp-menu.spec.ts`
- Steps: `scripts/agents/shots/features/F-agent-02.json`

### F-agent-03 Agent edits as drafts
- Try: Ask a connected agent to edit a page, add a section and create a page.
- Good: Each change shows live as an unsaved draft, one Undo per agent action (B4, B10).
- Files: `src/agent-tools.ts`, `src/agent-tools-edit.ts`, `src/agent-site.ts`, `src/agent-site-host.ts`
- Phone: yes
- Spec: `tests/native-save/native-mcp.spec.ts`
- Steps: none yet (needs a connected agent)

### F-agent-04 Ask agent and pins
- Try: Select an element, press Ask agent and type a request; answer its question on the pin.
- Good: A numbered pin shows waiting, working, a question (orange) or done (grey); history stays in this browser.
- Files: `src/components/agent-pins.ts`, `src/components/agent-pins.css`, `src/components/agent-pin-geometry.ts`, `src/agent-records.ts`
- Phone: yes
- Spec: `tests/native-save/native-mcp.spec.ts`
- Steps: none yet (needs a connected agent)

### F-agent-05 Agent presence
- Try: Watch while an agent works on a section.
- Good: The section is outlined with the agent's name chip and a dot in Page structure.
- Files: `src/agent-presence.ts`
- Phone: yes
- Spec: `tests/native-save/native-agent-presence.spec.ts`
- Steps: none yet (needs a connected agent)

### F-agent-06 Agents stay on across tabs and reloads
- Try: Reload, open a second tab, close the first.
- Good: Agents come back on with no new prompt; another tab takes over by itself; Disconnect in one tab turns all off.
- Files: `src/agent-owner.ts`, `src/agent-resume.ts`, `src/agent-transport.ts`
- Phone: yes
- Spec: `tests/native-save/native-agent-lifecycle.spec.ts`
- Steps: none yet (needs a reload and a second tab)

### F-agent-07 Agent media work
- Try: Ask an agent to place, describe and trim a picture and add subtitles to a video.
- Good: Each change is one Undo; its descriptions wait in To check.
- Files: `src/agent-tools-media.ts`, `src/agent-media-actions.ts`, `src/agent-media.ts`
- Phone: yes
- Spec: `tests/native-save/native-mcp-media.spec.ts`
- Steps: none yet (needs a connected agent)

### F-agent-08 Agent edits held while you type
- Try: Type in a heading while an agent edits near it.
- Good: Your typing is never overwritten; the agent's change waits and lands after.
- Files: `src/agent-site.ts`, `src/working-part.ts`
- Phone: yes
- Spec: `tests/native-save/native-agent-waits.spec.ts`
- Steps: none yet (needs a connected agent)

### F-agent-09 Download unsaved changes when storage fails
- Try: Fill the browser's storage while an agent edits.
- Good: The edit is refused with a plain error and the menu offers Download unsaved changes.
- Files: `src/agent-recovery.ts`, `src/agent-recovery-export.ts`
- Phone: yes
- Spec: `tests/native-save/native-agent-recovery.spec.ts`
- Steps: none yet (needs a connected agent and full browser storage)

## Command palette

### F-palette-01 Go to a page or file
- Try: Press Ctrl+K and type a page name or URL; press Ctrl+P for a file.
- Good: It opens; Escape closes back to where focus was.
- Files: `src/components/command-palette.ts`, `src/controllers/command-palette-controller.ts`, `src/page-builder/palette-search.ts`
- Phone: no
- Spec: `tests/native-save/native-palette.spec.ts`
- Steps: `scripts/agents/shots/features/F-palette-01.json`

### F-palette-02 Actions on the selection
- Try: Select a section, open the palette and run Duplicate or add a component.
- Good: The action works as from the bar, one Undo step (B4).
- Files: `src/page-builder/palette.ts`, `src/page-builder/palette-catalog.ts`, `src/page-builder/commands.ts`
- Phone: no
- Spec: `tests/native-save/native-palette-elements.spec.ts`
- Steps: `scripts/agents/shots/features/F-palette-02.json`

### F-palette-03 New page from the palette
- Try: Run New page from the palette.
- Good: A new page is made in the Pages tree, as from + New, with focus kept.
- Files: `src/page-builder/palette-catalog.ts`
- Phone: no
- Spec: `tests/native-save/native-palette.spec.ts`
- Steps: `scripts/agents/shots/features/F-palette-03.json`

### F-palette-04 Keyboard shortcuts sheet
- Try: Press ? outside a text field.
- Good: Every keyboard shortcut in one sheet; ? typed in a field stays text.
- Files: `src/components/shortcut-sheet.ts`
- Phone: no
- Spec: `tests/native-save/native-palette.spec.ts`
- Steps: `scripts/agents/shots/features/F-palette-04.json`

## Phone layout

### F-phone-01 Phone sheet
- Try: At 390 px pull up Page structure and code from the bottom, then fold it.
- Good: The page takes most of the screen; the sheet opens and folds by tap or drag and remembers its height (U4).
- Files: `src/components/phone-sheet.ts`, `src/components/phone-sheet.css`, `src/components/phone-sheet-rules.ts`, `src/components/phone-sheet-handle.css`
- Phone: yes
- Spec: `tests/native-save/native-phone-sheet.spec.ts`
- Steps: none yet (the try also runs at 1280, where there is no phone sheet)

### F-phone-02 Selection stays clear of the bar
- Try: On a phone select a picture low on the page.
- Good: It scrolls clear of the bar and stays fully visible (U5).
- Files: `src/components/edit-bar-placement.ts`, `src/components/phone-sheet.ts`
- Phone: yes
- Spec: `tests/native-save/native-phone-sheet.spec.ts`
- Steps: `scripts/agents/shots/features/F-phone-02.json`

### F-phone-03 Phone top bar and explorer
- Try: On a phone open the explorer from the top bar.
- Good: The top bar stays one row with Publish in view; the explorer never covers Publish.
- Files: `src/workspace-mount.ts`, `src/style.css`
- Phone: yes
- Spec: `tests/native-save/native-explorer-size.spec.ts`
- Steps: none yet (the try also runs at 1280, where there is no phone top bar)

### F-phone-04 Touch without sticky hover
- Try: Tap rows, tiles and menu items on a touch screen.
- Good: Nothing stays lit after a tap; every target is 44 px (U6).
- Files: `src/theme.css`, `src/components/row-action-overlay.css`
- Phone: yes
- Spec: `tests/native-save/native-media-touch-contrast.spec.ts`
- Steps: none yet (needs a touch screen; tries use a mouse)

### F-phone-05 Phone on its side
- Try: Turn a phone to landscape.
- Good: The column layout stays, and code hides and comes back within the screen.
- Files: `src/components/phone-sheet-rules.ts`, `src/components/code-resize.ts`
- Phone: yes
- Spec: `tests/native-save/native-phone-sheet.spec.ts`
- Steps: none yet (needs a phone held on its side; tries use 900 px tall windows)
