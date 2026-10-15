# Media manager UX and UI audit (ticket 89, 2026-10-15)

Lex's goal: **minimal and easy**, so the media screens feel like the modern apps people already know. This audit compares every media screen built in phases 1–7 with current Mobbin references, Lex's Brizy image popup, and the two chosen mockups (`prototype/tiles.html`, `prototype/crop-popup.html`). It lists what already matches, then each gap: what to change, where, why, and which reference it follows.

## Sources

- **Our screens:** 370 screenshots taken 2026-10-15 from `origin/dev` 6b788762 on the real starter (Larkspur Studio), at 390×844, 768×1024 and 1280×800, light and dark. Set A covers the Media screen family (27 states) and set B covers details, picker, popup, large editor, Social image, players and Site settings (35 states). The sets live in the lead's local `/tmp/mm-audit-shots/{a,b}/` and are not committed. Shot names below are `A-NN` / `B-NN`.
- **Mobbin:** 67 screens with measured notes, plus 6 looked up for this audit (Adding settings). They are third-party, so they are kept privately in `native-site-editor-private/audit-references/` and **cited here by app and file name only**. Measurements follow the notes' conventions: iOS sizes in pt, web sizes in CSS px, "~" marks an estimate.
- **Brizy:** `prototype/references/brizy-image-popup.webp`, kept locally (Lex, 2026-10-13).
- **Mockups:** `prototype/tiles.html` (Tiles, chosen 2026-10-12) and `prototype/crop-popup.html` (image popup, chosen 2026-10-13).
- **Settled rules** from the map's tickets (06, 07, 09, 10, 11, 12, 13, 15) and the build tickets are respected. Anything that would change agreed **behaviour** is listed under [Questions for Lex](#questions-for-lex), not in a fix slice.

## The shortlist: what makes things simpler for Lex (ranked)

1. **The Media panel is a short floating box.** At 1280×800 it is about 540 px tall, so two rows of tiles show and the bottom actions are cut off (Remove 3 files, Fix all, New collection, Replace everywhere). Its size also jumps between Pages, Media and Files. → slice **104**.
2. **Nothing visible says "done".** Site settings results and many other editor messages are screen-reader only. Media's status lines appear at the bottom, out of view, in a brown warning colour, and stay on later screens. → slice **105** (one toast for the whole editor).
3. **Touch screens keep a grey "hover" patch** wherever a tap landed, in every media screen. → slice **106**.
4. **The image popup is taller than Brizy's** (about 630 against 490 px, and Brizy's height includes three switch rows we don't have). Brizy fits its picture and Zoom into about 265 px. Ours needs about 300 px for the same part, then adds about 280 px for a Turn row, the Preview row, a banner and the buttons. → slice **109**.
5. **File details spreads simple facts over a 2×2 card**, shows empty "Other uses · 0" boxes, and gives "Remove file…" the same look as "Copy path". → slice **108**.
6. **The sub-screens (Clean up, Recently removed, To check, Improve images, Manage collections) each lay out differently.** They mix filled and plain buttons, place row actions in the middle of the panel, repeat sentences, and use two kinds of Back. → slice **111**.
7. **Phone details:** squeezed search, one giant picture per row in Clean up review, 10 px trim handles, an unlabelled icon row in the large editor. → slices **107**, **110**, **111**.
8. **Numbers that disagree:** Improve images (2) against "4 to improve", Length 0:02 against the player's 0:01, the canvas audio player reading 0:00 / 0:00, and "Home 12" on the page button. → slices **114**, **104**.

Behaviour questions (Add button, More menu, phone editing room, "leave alone everywhere", video in picture spots, video button) are at the end.

## Cross-cutting findings

### C1. Panel size, position and stability (all widths)

What matches: the tile grid follows Tiles (3 / 4 / 6 columns, 3 px gaps, close to Google Photos' 2 pt and Apple Photos' 1.7 pt), and Media widens to `min(1040px, 100vw - 32px)` as slice 09 decided.

Gaps:
- **Height.** `#explorer-media { block-size: min(55dvh, 560px) }` (`src/components/pages-tree.css:200`) and `.explorer #files { max-height: 40dvh }` (`src/style.css:847`) make the panel end at y≈595 on a 1280×800 screen (A-01), at y≈715 on 768×1024, and about 90 px above the bottom on 390 (B, 390 shots). Change: the panel runs to 16 px above the window's bottom edge (`block-size: calc(100dvh - <top bar> - 16px)` from the anchored top), at every width, for every tab. Why: a library is a full-height surface in every reference (Squarespace Asset Library, Air, Google Photos), and the cut-off action rows (A-09, A-12, A-18, A-20, B-03, B-06) all come from this cap.
- **Pinned actions.** Confirm rows (Remove 3 files, Replace everywhere, Save details, Fix all, New collection) scroll with the content. Change: give every sub-screen's last action row `position: sticky; inset-block-end: 0` on the panel surface, with a 1 px top line. Reference: Zendesk media picker modal footer (`5-zendesk-web-media-picker-modal.jpg`) and Google Photos' "Delete 80 items" pinned button (`8-google-photos-ios-free-up-space-summary.jpg`).
- **Sticky One bar.** Once you scroll the grid (A-02), search, Collections and More scroll away and tile names slide under the tab line. Change: the One bar sticks under the tabs (`position: sticky; inset-block-start: 0`, on the panel colour). Reference: Apple Photos and Google Photos keep their controls fixed while the grid scrolls (`1-google-photos-ios-grid-date-pill.jpg`).
- **One size for all tabs.** At 768 Pages and Files are about 480 px wide against 736 px for Media (A-25, A-27). At 1280 they are 320 against 690. Change: the explorer keeps Media's size for all three tabs, so switching tabs never makes the panel jump. Why: consistency. A panel that changes size looks like a different window.
- **Empty band above the tabs.** About 50 px holds only the gear icon (`.explorer-settings`, `src/style.css:900`). Change: move the gear into the tab row's end (a 44 px icon button after Files) and remove the band.
- **768 top bar.** When Publish shows a count, the top bar wraps: Undo, Redo and History drop to a second row, and the panel opens over half of "Publish 17" (A-13, A-14, A-19 to A-25, B-12). Change: the panel's top follows the top bar's real bottom edge (anchor to the bar, not a fixed 64 px), and the top bar keeps one row at 768 by letting the page button shrink first (`#current-page` already ellipsises).
- **"Home 12" on the page button.** The clean-up count shows on the page button that opens the explorer, so it reads like a page count, and it reaches "Home 132" with many files (A-26, A-02). The agreed badge belongs on the **Media tab** (map ticket 10). Change: the page button shows a small 8 px dot (primary colour) when Media has work, with the count only on the Media tab.

### C2. One visible confirmation (lead's note 6)

What matches: Undo exists for every change. The drop tray's "Added 2 files" is visible.

Gap: `announce()` (`src/main.ts:3840`) writes into `#status`, which is `.sr-only` (`src/style.css:862`). Site settings results ("Updated 73 links in 13 files…", slice 80; "Added the .nojekyll file GitHub Pages needs.", slice 81) are therefore screen-reader only. Media's own result lines, in contrast, are visible but appear at the bottom of the screen out of view (B-07b), in a brown warning colour (B-07b, B-12), and stay on other screens ("Removed 3 files…" under Improve images, A-20; "Changed 1 page." in Adding settings, A-24; "Vimeo's own bar…" under the Replace confirm, B-06).

Recommendation, **one pattern for the whole editor: a toast.**
- One line, past tense, names the thing ("Replaced red-acer.webp with bluebells.webp on Home and About"), with at most one action (Undo or Show) on the right. References: Fibery `10-fibery-web-restored-toast-view-action.jpg`, Linear `10-linear-ios-snackbar-undo.jpg`, Google Photos `10-google-photos-ios-snackbar-undo.jpg`.
- Look: about 44 px tall, 8 px radius, inverse surface (dark on the light theme, light on the dark theme), 13–14 px text, 16 px side padding, no warning colour for successes. It sits bottom-centre on computer and tablet, 16 px above the bottom edge, and on phone 8 px from the sides above the bottom edge. It never covers a primary button: if a pinned action row is showing, it sits above that row.
- Timing: it stays 6 s, longer while hovered or focused. A new toast replaces the old one, and it is also announced (the live region stays).
- Errors stay **inline next to the field** (Typeform and Homerun in the Mobbin notes, part 7), not in toasts.
- Status lines that belong to a screen are cleared when you leave that screen.

### C3. Touch hover, disabled look and dark-mode contrast

What matches: tiles already guard hover (slice 87), focus rings use `:focus-visible`, and the themes follow the system.

Gaps:
- **Sticky hover on touch** (A-13, A-20, A-23, A-25 at 390; B-25 Redo at 390). About 25 `:hover` rules sit outside `@media (hover: hover) and (pointer: fine)`: `src/style.css` (`.icon-button`, `.primary`, `.secondary`, `.text-button`, `.file-row-line`), `image-popup.css` (6), `image-large-editor.css` (3), `media-adding-settings.css:17`, and about 10 in `media-picker.css`. Change: wrap each in that query, and add `:active` press states.
- **Disabled buttons** are only `opacity: 0.5` (`src/style.css:35`), so a disabled primary looks like a pale primary (A-24 "Reset to defaults", B-13 "Use file"). Change: disabled buttons get the neutral surface (`--surface-subtle`) with `--muted` text and no fill colour. Reference: GitBook's Save stays grey until something changes (`7-gitbook-web-edit-slug-prefix.jpg`). The WordPress media editor greys Save the same way.
- **Dark radios** in Adding settings have a muddy brown-grey fill, so unticked choices look half selected (A-23, A-24 dark). This is fixed by slice 112's choice rows, which use no radio dots.
- **Links in dark mode:** usage page names (B-02 dark) and "Choose favicon…" (B-26 dark) are plain white. In light mode the usage-popup links are blue on lavender, at low contrast (A-10). Change: one `--link` token per theme that reaches 4.5:1 on the panel surface, used by every link in media screens.
- **Transparent pictures on dark tiles:** the dark-lettered logo PNG almost disappears (every dark picker and grid shot). Change: tiles and previews of pictures with transparency get a **light** checkerboard backing in both themes, with dedicated colours (8 px squares of `oklch(97% 0 none)` and `oklch(90% 0 none)`), because the dark theme's surface tokens are 18–22 % lightness (`src/theme.css:147-149`) and would stay dark. This is how Squarespace and Figma show transparent assets.
- **Surface depth differs by theme.** In light mode, cards, the tray and the selection bar are white on lavender. In dark mode they are near-black on slate, darker than the panel (A-11, A-14, A-20). Change: both themes use one rule, a card one step *lighter* than the panel (dark: `color-mix(in oklch, var(--panel-surface), white 6%)`).

### C4. Wording rules

- One verb per action everywhere: **Remove file…** (picture and video details) but **Remove from Media…** for Vimeo (B-12). Use "Remove…" for both, because the screen already says which file.
- Buttons name the action, as in "Remove 3 files" and "Replace everywhere" (already good). "OK" in To check becomes **Looks right**.
- At most one helper sentence per field. Longer explanations move into the confirm step, where they matter (Calendly `7-calendly-web-my-link-one-line-warning.jpg`, Mobbin notes part 7).
- Remove technical words from visible text: "size details" (Improve images), "Poster URL" / "Video URL" (video bar), "span.download-card-meta" (canvas hover tag, B-29b at 768).

## Per screen

### Media: Tiles gallery and One bar (A-01 to A-08)

Matches: Tiles as in `tiles.html`: square crops, one tile per family, 3 / 4 / 6 columns, 3 px gaps, a small radius, the page count top-left and a selection ring top-right as two 44 px targets (slice 09), names on hover with a mouse and always on touch, video lengths bottom-right as in Google Photos (`1-google-photos-ios-grid-date-pill.jpg`). The empty state is one title, one sentence and one action, like Shopify Files (`1-shopify-web-files-empty-state.jpg`). No results keeps the bar visible and offers Clear search, like Semrush (`1-semrush-web-nothing-found-clear-filters.jpg`). Newest first (slice 103) works: added files are first and highlighted (A-14). That is Lex's iPhone fix (lead's note 8), and it looks right at all widths.

Gaps:
- **Heavy JPEGs show a grey "JPG" document tile** instead of their picture (allotment-harvest.jpg and workshop-panorama.jpg, both 2.1 MB; A-01, A-09, A-13, A-14). A picture library must show pictures. The tile falls back to the type icon when `h.bytes(preview)` rejects or the image errors (`tilePicture`, `media-library-grid.ts:180-190`). Both files are 2.1 MB, which points at a 1 MB read limit in the byte path; the builder confirms the cause first. Change: heavy pictures load like any other picture, downscaled for the tile. → 107.
- **The top shade dims every tile** (a dark gradient over about the top 40 %, A-01). Reference: Google Photos and Apple Photos put white glyphs on the photo with no chip or shade (`1-google-photos-ios-grid-date-pill.jpg`). Change: shrink the shade to a 36 px band at 35 % strength (or `text-shadow` only), keeping 4.5:1 for the number. The tile then reads as a photo first. → 107.
- **Phone One bar** (A-04, A-05, B-05 at 390): the search field is about 115 px wide, so typed words lose their start, and "All colle…" is cut. Change: in the phone container, the Collections trigger shows the short name ("All", "Garden") with `max-inline-size: 40%`, and search takes the rest (`flex: 1 1 55%`). → 107.
- **The by-agent mark** on a tile (small dark circle bottom-right, A-01 tile 11) has no words. Change: give it the same icon and a tooltip/label "Written by an agent – check in To check", so it matches the To check row. → 107.

### List view (A-09)

Matches: thumbnail, name, size, usage, as Squarespace and Air list views do.

Gaps: rows without a thumbnail (the heavy JPG, the MP3) centre their names, out of line with every other row at 768 and 1280, and indent differently at 390. Change: a fixed 48 px thumbnail column, with an icon on `--surface-subtle` when there is no picture. The count shows twice ("1" bubble and "Used on 1 page"): keep only the words. The agreed states stay distinct ("No uses found", "Other uses found", "Not checked yet"; map ticket 06), so 0 is never shortened to "Not used". → 107.

### Usage popup (A-10)

Matches: names the pages with their addresses, and links them.

Gaps: two ways to close (✕ and a blue **Close** as the main button), and an empty "Other uses · 0 / No other uses found." block. Change: drop the Close button. ✕ and Escape close it, and "File details" becomes the one (secondary) action. Hide "Other uses" when it is 0. Links get the C3 colour. → 108 (it shares `media-usage-text.ts` with details).

### Selection and selection bar (A-11)

Matches: a mode with checks, one count, actions in a floating bar, Clear beside the count, removal last. This is the pattern of Google Photos' action tray and Customer.io (`2-google-photos-ios-selection-action-tray.jpg`, `2-customerio-web-selection-bar.jpg`).

Gap (small): on the phone the bar is a two-row card (count, ⋯ and Clear on top; Add to collection and Remove files below) about 130 px tall, covering a full tile row. Change: one 56 px row with "✕ 3" (clear and count in one control, as Google Photos does), then **Add to collection**, then ⋯ holding Remove files… last. At 768 and 1280 it stays one row as now. → 107.

### Manage collections (A-12)

Matches: the rules of ticket 15 (rename, delete, new; no combine).

Gaps: "Back to grid" is a text button, while every other sub-screen uses a ← icon with the title (and at 390 it is clipped under the tab line). Eight bordered Rename/Delete buttons fill four rows. The phone footer shows keyboard hints ("Enter opens details · Arrow keys browse"). Change: the shared sub-screen header (← + title). Each row gets one ⋯ menu with Rename and Delete (Delete last, in red text), like Apple Photos' more menu (`4-apple-photos-ios-more-menu-destructive-last.jpg`). Hide the keyboard hints on touch (`@media (pointer: coarse)`) and remove them from the Media footer elsewhere. → 111.

### Adding progress and the tray (A-13, A-14, A-25)

Matches: progress lives on placeholder tiles in their final place ("Waiting", "Preparing…" chips and a bar on the tile), exactly Savee's pattern (`3-savee-web-inline-upload-tiles.jpg`), plus one tray, as in Google Drive (`3-google-drive-web-upload-tray-in-progress.jpg`). Cancel is a quiet text button.

Gaps:
- The finished-with-error tray at 390 is five lines of technical text ("Hidden personal details could not be removed because the picture could not be prepared…", A-14). Change: two lines at most: **"phone-export.png couldn't be added. Save it as JPEG or PNG and try again."** The full reason goes under Review…. → 112.
- Tray actions "Review…" and "Retry" are bare text with no edge, and ✕ sits beside them. Change: "Retry" becomes a 36 px secondary button, "Review" a text button, and ✕ moves to the tray's top-right corner (Google Drive tray layout). → 112.
- Title wording: "Added 2 files · 1 could not be added" becomes **"2 added · 1 couldn't be added"** (Google Drive: "1 upload complete"). → 112.

### To check (A-15) and agent-facing text

Matches: one line explains who wrote it and what to do. Each row shows the file, what was written and the words.

Gaps: **OK** (filled blue) and **Edit** (near-black in dark mode) sit at about x=830–904 of a panel that ends at 1136. The row actions should end at the panel's edge. "OK" is vague. Change: actions right-aligned to the panel edge. **Looks right** as a secondary button and **Edit** as a text button (neither filled: this is a review list, not a form). The helper line becomes "An agent wrote these. Check they read right." → 111.

### Clean up groups, review, confirm (A-16 to A-18)

Matches: groups by reason with count and size, each opening its own review, as in Google One's cleanup suggestions (`8-google-one-ios-storage-manager-cleanup-suggestions.jpg`). The confirm names the count ("Remove 3 files") and says where the files go (Recently removed, 30 days), as in the iOS delete alert (`2-ios-system-delete-confirm-recently-deleted.jpg`).

Gaps:
- **Phone review** shows one picture per row at full width, so eight files mean a long scroll and Review removal is out of sight (A-17 at 390). Change: the review uses the media grid (3 columns on phone), with a size under each tile and the action pinned (C1), like Google Photos' review grid (`8-google-photos-ios-review-grid-selected.jpg`). → 111.
- **A ticked picture shrinks inside its ring and leaves a white (light) or black (dark) band across its top** (A-17, all widths). Change: inset the ring with `box-shadow: inset 0 0 0 3px var(--primary)` and keep the image at full size, or shrink it evenly on all sides with the radius kept, as Google Photos does (~8 pt inset). → 111.
- The group page's helper paragraph is two sentences about what can't be seen. Change: **"Files used only from outside the site? Mark them Always keep."** Put the total each group frees in the screen's title line: "Clean up · 271 KB" (Google One). → 111.
- The confirm's "Keep files" is a white pill, the primary is a darker navy than every other primary (A-18), and both are cut at 1280. Change: the standard primary colour, and the pinned row from C1. → 111.

### Recently removed (A-19)

Matches: one retention sentence, a "days left" line per file, Restore per file (Google Drive Trash, `2-google-drive-ios-trash-list.jpg`).

Gaps: three **filled** blue Restore pills in a column ending about 230 px short of the panel edge. The 30-day sentence shows twice (header and the leftover status line). Change: Restore as a secondary button, right-aligned at the panel edge. One retention sentence: **"Removed files stay here for 30 days."** The second half of today's line ("Restore puts a file back at its address…") goes. The status line goes to the toast (C2). → 111.

### Improve images (A-20 to A-22)

Matches: rows per page with what would change, opening to show pictures with ticks, Fix per row and Fix all, Undo per row. That is ticket 11's Wix-style fixer, with progress and Cancel.

Gaps:
- **Count mismatch:** More says "Improve images (2)" but the screen lists four rows and says "4 to improve" (A-07 against A-20). `media-badge.ts:42` counts something else from the screen. → 114.
- **Row text is technical:** "4 pictures missing copies, 4 pictures missing size details". Change: **"4 pictures · lighter copies for phones"**. The opened row's per-picture lines follow ticket 74's plain phrases ("Heavy: a lighter file"). → 111.
- **"Fix" is bare text** at the row's right edge with no button edge (A-20). Change: a 36 px secondary button, so Fix all (filled, pinned at the bottom) is the one primary. → 111.
- Checkboxes are 24 px blue squares, louder than the text (A-21 dark). Change: 20 px, the theme's `accent-color`, as in the tiles mockup. → 111.
- The "leave this picture alone everywhere" control is missing (lead's note 2). This is a behaviour choice → [Q4](#q4-improve-images-leave-a-picture-alone-everywhere).

### Adding settings and repository size (A-23, A-24)

Matches: plain names (Smaller files, Balanced, Higher quality) with one hint each, "Recommended" marked, a repository size line with a bar (ticket 07).

Gaps:
- Three stacked groups of 3–4 radio rows (Images, Video, Audio) make a long screen with muddy dark radios. Change: each kind is one grouped card (12 px radius, 1 px line between rows). Each choice is a 48 px row with a title, a 13 px hint and a **trailing ✓** for the chosen one (no radio dot). References: XChat "Upload Quality" (https://mobbin.com/screens/fe77b36b-a2f0-4696-9b3a-677453488eba), WhatsApp "Media quality" (https://mobbin.com/screens/25a35e68-cf20-4269-9e93-f7f888ff8a8d), Google Photos "Backup settings" (https://mobbin.com/screens/0f371c41-642a-4550-a260-876e45b83303). → 112.
- **Reset to defaults** is a filled button (pale when disabled). Change: a text button under the cards, hidden when everything is already default. → 112.
- **Repository size:** "320 MB. GitHub Pages publishes sites up to 1 GB." over an 8 px plain meter. Change: WhatsApp's storage card (`7-whatsapp-ios-storage-usage-bar.jpg`): **"320 MB"** at 20 px semibold, "of 1 GB GitHub Pages allows" in 13 px muted, then a fully rounded 8 px bar in the primary colour (amber from 80 %). → 112.
- The leftover "Changed 1 page." line → C2.

### File details: picture (B-01 to B-03), video (B-08, B-09), audio (B-10), PDF (B-11), Vimeo (B-12)

Matches: the order preview → name → facts → usage → copies → collections → description → marks → actions follows Shopify's detail card (`4-shopify-web-file-detail-alt-usedin-focal.jpg`). Rename is the name field itself, and Description is one field with one helper line. Video details have Still picture (Use this moment, Choose picture…), like the thumbnail setting in Framer's YouTube panel (`9-framer-web-youtube-component-panel.jpg`), and Subtitles as one file with Replace/Remove, which visitors reach through a CC button as in Codecademy's player (`9-codecademy-web-player-captions-menu.jpg`).

Gaps:
- **Facts as a 2×2 card** (Kind, Size, Dimensions, Folder; about 120 px tall). Change: one 13 px muted line, **"WebP · 2000 × 1125 · 47 KB · media/images"**, with "Added 14 Oct" on its own line when there is a date (Shopify "JPG • 3024 × 4032 • 1.61 MB", Squarespace File Details `4-squarespace-web-file-details.jpg`). Saves about 90 px. → 108.
- **The preview is letterboxed** in a fixed box, with empty bands above and below (B-01 1280: about 60 px bands; B-02 768: about 110 px). Change: the preview takes the picture's own aspect ratio, up to `max-block-size: 50dvh`, on `--surface-subtle`. → 108.
- **Four equal pills under the preview** (Optimise image…, Replace everywhere…, Copy path, Remove file…) wrap to two rows on phone and put removal at the same level as copying. Change: **Replace everywhere…** and **Optimise…** as secondary buttons. Copy path moves to a ⋯ menu beside them, and **Remove…** goes last in that menu in red text. Reference: Klaviyo puts Crop and Replace first and an unlabelled trash last (`4-klaviyo-web-image-panel-replace-alt.jpg`), and Apple Photos puts its destructive item last and red (`4-apple-photos-ios-more-menu-destructive-last.jpg`). → 108.
- **Usage**: "Pages · 2" then "Other uses · 0 / No other uses found." Hide the empty group. Page names get the link colour in dark (C3). → 108.
- **Copies and original**: rows wrap at 390 ("1600 px / wide"), and at 1280 the kept original's size sits higher than its name (B-02). Change: two-line rows (name, then "Smaller copy · 1600 px" muted) with the size aligned to the first line's baseline (`align-items: first baseline`). → 108.
- **Decorative / Always keep**: the checkbox rows are spaced 56 px apart with a helper line below each. Change: 44 px rows with the helper as the row's second line. → 108.
- **Player time against Length**: video shows 0:01 in the player against Length 0:02, and audio 0:41 against 0:42 (B-08, B-10). Both must round the same way. → 114.
- **Vimeo details**: "Remove from Media…" against "Remove file…" (C4). The "Show Vimeo's own bar" result line stays on later screens (B-06): → C2. → 108.
- **Remove dialog wording, Save model:** keep as is (ticket 15).

### Rename (B-04)

Matches: the name field is the rename (Shopify, Squarespace), the taken name is said inline, and a one-tap suggestion "Use bluebells-2.webp" is offered (ticket 15).

Gap (small): at 390 the name field sits below the preview and the four pills, so it needs a scroll. Slice 108's action changes move it up by one row. The error text is dark red at about 13 px: keep it, and add a ⚠ glyph so the message is not only colour. → 108.

### Replace everywhere: picker, confirm, result (B-05 to B-07b)

Matches: Now / New side by side, the action named on the button, where the old picture goes (Recently removed).

Gaps:
- **The confirm doesn't name the pages** (lead's note 7: "2 pages show red-acer.webp"). It has a tinted box plus four more sentences (B-06), and its buttons are cut off (C1). Change: the box lists the pages as links (**"Shows on: Home, About"**, up to 5, then "and 3 more"). Below it the address line stays conditional, as `media-replace-rules.ts:47-54` decides today: for the same format, "Same name and address, so links from other sites show it too."; for a new format, "It's a WebP, so its address becomes /media/images/red-acer.webp. Every mention is updated." with "Keep the old address working" as now (ticket 15). Then a short "Focus points go back to the middle." when pages use it, and "The old picture goes to Recently removed for 30 days." Drop only "bluebells.webp also stays in Media as it is." Keep the trimmed-copies line when it applies. The usual case drops from 5 lines to 4, and the pages are named. Reference: the iOS system delete alert is one sentence plus a thumbnail (`2-ios-system-delete-confirm-recently-deleted.jpg`). Typeform's confirm names the consequence in one bold sentence (`7-typeform-web-change-url-confirm.jpg`). → 113.
- **The result** ("Replaced red-acer.webp everywhere on 2 pages, as a draft…", `media-replace-rules.ts:73`) is at the very bottom of the details, out of view (B-07b), in brown. It names only the old file. Change: a toast (C2), **"red-acer.webp now shows the bluebells picture on Home and About"**, with Undo. → 113.
- **Leftover Vimeo line** under the confirm (B-06): → C2.

### Media picker, all entry points (B-05, B-13 to B-18)

Matches: the same tiles and One bar as Media. One "Choose image / Choose media" title naming the entry ("Home · Add media"). Cancel and **Use** bottom-right, disabled until a pick (Zendesk modal, `5-zendesk-web-media-picker-modal.jpg`). On phone it fills the screen (ticket 06). Kind-limited lists for stills and Social image (B-17, B-18).

Gaps:
- **The YouTube/Vimeo field is always on screen** (B-13 to B-15), even when choosing a picture is the point. Change: a quiet **"Paste a YouTube or Vimeo link"** text button in the One bar row that reveals the field with **Use** and one helper line, "Works with YouTube and Vimeo". That is Notion's Link tab (`5-notion-web-image-link-tab.jpg`, `9-notion-web-video-embed-link.jpg`). The error stays inline under the field. The settled rule (pasting is allowed, ticket 12) is unchanged. → 113.
- **Footer:** a "Choose one file" line plus Cancel and "Use file" take about 130 px on phone (B-14 at 390). Change: drop "Choose one file", and say "Use" (disabled) until a pick, then "Use image" / "Use video" as today. On phone, Cancel and Use share one 56 px row. The iOS picker sheet puts them in the header (`5-ios-system-photo-picker-sheet.jpg`). We keep the bottom for thumb reach. → 113.
- **Empty space at 1280:** with 10 files the picker shows two rows in an 850 px window (B-13). Change: the picker's height follows its content: `block-size: fit-content; min-block-size: min(480px, 100dvh - 48px); max-block-size: min(850px, 100dvh - 48px)` (the grid scrolls inside). → 113.
- **Wide and transparent pictures** (logo, social card) crop to unreadable fragments in square tiles. Change: pictures with transparency, and those wider than 2:1, show whole (`object-fit: contain`) on the checkerboard from C3. Photos stay cropped as Tiles decided. → 107 (tile rule shared with Media).
- **Phone double-click to open the picker** never reached the photo in three tries (B-16 skipped at 390; lead's notes 1 and 4). The stale double-click is a bug (→ 114). The phone's editing room is a behaviour question (→ [Q3](#q3-more-room-for-the-page-on-phones)). The Image button → Replace path works at every width (B-19, B-20).

### Image button and image popup (B-19 to B-23)

Matches Brizy and `crop-popup.html`: a 328 px popup (Brizy about 325 px) with label-left / control-right rows split by hairlines, the shape menu as a dark pill **on** the picture, the focus dot on the picture, Zoom as a slider with "100 %", **Done** as the one primary, and a bottom sheet with 44 px targets on phone (ticket 39). It follows the editor's look, light and dark, as Lex asked (ticket 09).

Gaps (measured on the shots: Brizy's popup is about 325 × 490 px, with Image and Zoom taking about 265 px and three switch rows the rest; ours is 328 px wide and about 630 px tall at 1280, B-20):
- **The helper line under the picture** ("The whole picture shows." / "Drag the dot to what matters most." / "Drag the corners to trim.") takes about 40 px and repeats what the dot and corners show. Change: show it only the first time a shape is chosen, then keep it as the dot's accessible name. Replace stays on that line, right-aligned. → 109.
- **"Only changes this spot" banner**: a 36 px tinted box with a blue left stripe and a check icon, plus the yellow "Saves a new picture for this spot" box with an amber stripe. Both messages are agreed (ticket 39), but they read as alerts. Change: one 13 px muted line with a 14 px icon, left of Done on the same row (computer) or above the buttons (phone). The yellow case keeps its icon tinted amber; neither gets a box or stripe. Saves about 50 px. → 109.
- **Turn row** shows "0°" plus two icons in a 50 px row. Brizy has no Turn. Change: put the two 44 px turn icons at the end of the Zoom row, so Zoom and Turn share one row (the degree shows in the icon's tooltip). Saves 50 px. → 109.
- **Preview row**: the phone/computer previews are 120 px tall and push Done out of reach. Keep them (Etsy's "What buyers will see", `6-etsy-web-adjust-thumbnail-previews.jpg`, is the clearest way to explain framing), but cap them at 72 px tall. → 109.
- **Phone sheet** (B-20 to B-23 at 390): the 70 px label column narrows the picture to about 250 px, and Turn and Preview sit below the fold. Change: on phone, labels sit above their controls (12 px muted), so the picture gets the full 358 px. With the changes above, all rows fit in an 85 dvh sheet. → 109.
- **Free trim handles** are about 10 px dots (B-22). Change: 12 px visible circles with a 1 px blue ring and an invisible 44 px grab area, as the WordPress media editor does (Lex's chosen large-editor reference). → 109.
- **The edit bar on phone** (B-19 at 390) has Image · Original, Alt text, Decorative and delete. It matches ticket 39. The "Image" label tab above the bar duplicates the Image button. Hide that tab when the bar's first button already names the element. → 109.

### Large editor (B-24, B-25)

Matches `crop-wordpress-style.html` and WordPress 7.1: picture left, tools right (Turn, Flip, Zoom, Shape, Preview), the straighten ruler under the picture with the value in bold, Reset · Undo · Redo bottom-left and Cancel · Done bottom-right, a full-screen layout on phone with one row of tool icons.

Gaps:
- **Shape is a native `<select>`** (B-24), while the popup uses its dark pill menu. Change: the same shape menu component in both, with the current shape as the button's label ("16:9 ▾"). Apple Photos and Buffer use one row of short chips (`6-buffer-web-crop-aspect-chips.jpg`), but a menu is fine here because it stays consistent with the popup. → 110.
- **768: the Computer preview runs past the dialog's right edge** and is clipped (B-24/25 at 768, both themes). Change: previews sit in a 2-column grid of `minmax(0, 1fr)` with `object-fit: contain`. → 110.
- **Phone: 7 unlabelled icons** in one row, with Shape hidden behind a crop icon (B-25 at 390). Change: icon over an 11 px label (Turn, Turn, Flip, Flip, Zoom −, Zoom +, Shape), as in Apple Photos' tool switcher and Google Photos (`6-apple-photos-ios-crop-aspect-presets.jpg`). The Shape button shows the current shape ("16:9"). Row height becomes 56 px. → 110.
- **Ruler degree labels** are faint grey (about 2.5:1). Change: `--muted` (4.5:1), with the current value in bold `--text` as now. → 110.
- **The amber "Saves a new picture for this spot" box** reads as a warning. Same change as the popup (one quiet line by the buttons). → 110.

### Social image popup (B-17, B-27)

Matches: the same popup at 1200 × 630 (ticket 09), focus dot, zoom, a share-card preview.

Gaps:
- At 768 and 1280 it opens over the Site settings form, covering "Default social image" and Apply, and hangs past the dialog's bottom edge (B-27). It is lavender on a white dialog. Change: it opens as its own centred layer above the dialog, on the dialog's surface colour, with the same shadow and backdrop. → 109.
- At 390 the Preview is hidden behind the pinned "Saves a sharing copy" message and Done. The quiet-line change above fixes this. → 109.
- The trigger is a filled blue **Image** button inside a settings form. Change: the current social image's 64 px thumbnail plus a secondary "Change…" button, like Klaviyo's image well (`4-klaviyo-web-image-panel-replace-alt.jpg`). → 109.

### Video, audio, download and Online video placement (B-29 to B-33)

Matches: the visitor sees the site's own player: a round play button on the still, a thin audio bar with time, and a PDF card with its first page and **Open** (B-32, B-33), all in the thin-chrome style of Contra (`9-contra-web-video-block-native-chrome-caption.jpg`). The Online video loads on tap under the same bar (ticket 12). The canvas stays still, with Play to check.

Gaps:
- **The video edit bar uses address words**: "Video URL", "Poster URL", "Title" (`native-element-fields.ts:82`), beside a "Default" style menu and "Looping video" (B-30). Change in wording only: **"Video file"**, **"Still picture"**, **"Title"**. A larger change is [Q6](#q6-a-video-button-like-the-image-button). → 115.
- **The canvas audio** shows the browser's bare player reading "0:00 / 0:00" (B-29b), while visitors get the site's player with 0:42. Change: the canvas loads the audio's length (`preload="metadata"`), so the editor shows the real time, and uses the site's player look where the page has it. → 115.
- **The developer hover tag** "span.download-card-meta" covers the PDF card's name in the canvas (B-29b at 768). Change: the hover tag shows the element's plain name ("Download") as other blocks do, or none over media cards. → 115.
- **Phone**: Play on a selected video shows only the bar, because the canvas is 90–150 px tall (B-31 at 390). → [Q3](#q3-more-room-for-the-page-on-phones).
- **1280**: the edit bar sits over the top of the video, and a hover outline runs past the video to the canvas edge (B-30). Change: the bar sits above the element when there is room, and the outline follows the element's box. → 115.
- The dark visitor page fades the dark-lettered logo too (B-33). That is the starter's own content, not the editor. Noted for the starter, no slice here.

### Site settings and Site address (B-26, B-28)

Matches: the address change asks in the footer before rewriting ("This updates 95 links in 13 files to the new address. Undo is available. · Cancel · Update links", B-28). That is the inline, named-action confirm of Calendly and Typeform (Mobbin notes part 7), with no extra dialog. "Drafts until you publish" is one quiet line.

Gaps:
- **No visible result** after Apply: "Updated 95 links…" (slice 80) and ".nojekyll added" (slice 81) are screen-reader only. → C2 / 105.
- **The long site address is cut off** inside its field at 390 (B-26). The helper "Where your site lives, like https://name.github.io/my-site/" wraps to two lines. Change: the field wraps as a 2-line textarea-like input on phone (`field-sizing: content`), and the helper becomes "Like https://name.github.io/my-site/". → 113.
- **"Choose favicon…"** is a text link indented 10 px differently from the fields' column (B-26, x≈413 against the fields at 561). Change: a secondary button in the field's column, with the favicon's 32 px preview in front of the field. → 113.

## Coverage and what was not shot

Every screen in ticket 89's scope is assessed above at 390, 768 and 1280, light and dark, except the states below. The prepared shot sets did not include them, and this audit did not retake shots (the lead prepared steps 1–2). They are assessed from the code and from neighbouring shots only, so **each fix slice that touches one of them must shoot it** in all six combinations before and after:

| Not shot | Nearest evidence | Shot by |
| --- | --- | --- |
| File details for a generic download (not a PDF: ZIP, DOCX) | B-11 (PDF details) | 108 |
| The picker's own adding progress, ready and error states | A-13/A-14 (Media's tray), A-25 (Files) | 112 |
| Picker entry points: component fields and slots, section backgrounds, favicon, Image popup → Replace | B-05, B-13, B-16 to B-18 | 113 |
| B-16 "Choose image" by double-click at 390 (skipped in both themes: the double-click never reached the photo) | lead's notes 1 and 4 | 114 (spec), Q3 |
| Media gallery loading and load-error states; usage "Not checked yet" and "Other uses found" | A-01, A-10 | 107 |
| Repository size warnings at 500 MB and 900 MB | A-24 (320 MB) | 112 |
| Visitor subtitles (CC on) and the audio transcript; the looping video's corner pause button; Online video playing and its fallback when the provider is blocked | B-32, B-33 | 115 |

Nothing in these states contradicts the findings above. The shared components (tray, picker, details, player) are the same, so the same changes apply.

## What is already good (keep)

- Tiles: the dense square grid, 3 px gaps, names on hover, video lengths on tiles, the page count and selection ring as 44 px targets.
- Progress on the tile where the file will appear; newest first with a highlight.
- Clean up grouped by reason with sizes; Recently removed for 30 days; confirms that name the action and the count.
- The image popup's Brizy structure and size (328 px wide, rows, shape pill on the picture), and the WordPress-style large editor.
- The visitor's player, audio bar and PDF card.
- The Site address confirm in the footer, with no extra dialog.

## Widths and themes, at a glance

| | 390 phone | 768 tablet | 1280 computer | Dark |
| --- | --- | --- | --- | --- |
| Biggest issue | canvas too small to edit (Q3); search squeezed; review one-per-row | top bar wraps under the panel; large-editor preview clipped | panel 540 px tall; actions cut | muddy radios; white links; logo vanishes; warning-brown successes |
| Slices | 104, 107, 109, 110, 111, 113 | 104, 110 | 104, 113 | 106, 112 |

## Fix slices (phase 8)

| Slice | Title | Builder | Blocked by | Covers |
| --- | --- | --- | --- | --- |
| 104 | The Media panel fills the height, keeps one size, pins its actions | claude | 89 | C1 |
| 105 | One visible confirmation: a toast for the whole editor | claude | 89 | C2, lead's note 6 |
| 106 | Touch, disabled and dark-mode fixes | claude | 89 | C3 |
| 107 | Tiles, list view, selection bar and the phone One bar | claude | 104, 106 | Tiles, list, selection, phone bar, transparent tiles |
| 108 | File details: one fact line, a calm preview, actions in order | claude | 105 | details per kind, usage popup, rename |
| 109 | Image popup and Social image: shorter, closer to Brizy | claude | 106 | popup, edit bar tab, Social image |
| 110 | Large editor: fits at every width, one shape menu, labelled phone tools | claude | 109 | large editor |
| 111 | The sub-screens share one layout | claude | 104, 105 | Clean up, Recently removed, To check, Improve images, Manage collections |
| 112 | Adding: settings as choice cards, shorter tray messages | claude | 105, 106 | Adding settings, repository size, tray |
| 113 | Picker, Replace everywhere and Site settings: less text, pages named | claude | 104, 105 | picker, Replace everywhere, Site settings fields |
| 114 | Numbers that agree, a double-click that always opens, tidy dates | sol | 89 | counts, lengths, stale double-click, discarded date entries |
| 115 | Placed video, audio and downloads in the editor: plain words, real times | claude | 105 | video bar words, canvas audio, hover tag, bar placement |

Each ticket is in `tickets/104-…` to `tickets/115-…`. Every visible slice ends with shots at 390, 768 and 1280, light and dark, of the screens it touched.

## Questions for Lex

These change how something **works**, not just how it looks, so they wait for Lex. No slices exist for them yet.

### Q1. A visible Add button in Media

Today "Add new file" is inside More (⋯), and dropping files anywhere adds them (decided in ticket 06). Every reference library has a visible add or upload button (Shopify Files, Squarespace, Google Photos' "+").
- **A. Keep it in More** (as today).
- **B. Add a "+" button in the One bar**, beside More, and keep dropping. *(Recommended: adding is the most common job and should be one tap.)*

### Q2. A shorter More menu

More holds 15 items: Add new file, Adding settings, Clean up, Improve images, Recently removed, To check, then Show (All, Images, Video, Audio, Documents) and View (Grid, List). Apple Photos puts "what to show" and "how to show it" in one filter menu, apart from its tools.
- **A. Keep one menu** (as today).
- **B. Move Show and View into the Collections menu** (renamed "Filter"), so More holds only the tools: Clean up, Improve images, To check, Recently removed, Adding settings. *(Recommended: two short menus are easier to scan than one long one.)*

### Q3. More room for the page on phones

On a phone the page you edit gets only about 90–150 px between Page structure and the code. When a picture or video is selected, the edit bar covers it, so double-click, Play and checking the result hardly work.
- **A. Keep the layout.** Use the edit bar's Image button, which works.
- **B. On phones, Page structure and code fold into a pull-up sheet while you edit the page**, so the page gets most of the screen. *(Recommended. This changes the whole editor on phones, not only media, so it would be its own small project.)*

### Q4. Improve images: leave a picture alone everywhere

Unticking a picture in Improve images leaves it alone on that page only. A picture used on six pages has to be unticked six times.
- **A. Keep per page** (as today).
- **B. Add "Leave alone everywhere" to a picture's row**, remembered for the whole site, with ticking it again undoing it. *(Recommended: one tap instead of six.)*

### Q5. Replacing a video that sits in a picture spot

A picture spot can hold a looping video (ticket 12). Today there is **no way to replace a video** anywhere: Replace everywhere works for pictures only (`replace-everywhere.ts:19`, `media-replace-rules.ts:9`), and the image popup's Replace doesn't open for a video in a picture spot (slice 69's follow-up). To swap one you remove the spot's video and add again, which can break a component's layout.
- **A. Not now.**
- **B. Add Replace for a video in a picture spot**: the spot's edit bar gets the same Replace as pictures, choosing a picture or another video. *(Recommended: otherwise a spot with a video is stuck, and this matches how pictures already work.)*

### Q6. A Video button like the Image button

A selected video's edit bar has three address fields (Video file, Still picture, Title), plus a style menu and Looping video. Pictures have one Image button that opens a popup.
- **A. Keep the fields**, with the plain words of slice 115.
- **B. One Video button that opens a small popup**: the still picture (Use this moment / Choose…), Loop silently, Subtitles, Replace. This mirrors the Image popup. *(Recommended later, after slice 115: one way to edit any media spot.)*

## Review

Reviewed by GPT-6.1 Sol through read-only `codex exec`. The outcome is recorded in ticket 89's Done section.
