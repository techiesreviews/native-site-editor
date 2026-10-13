# Downloaded design references

Downloaded from the media manager's Mobbin research on 2026-10-11 and the photo-app follow-ups on 2026-10-12. These files keep the prototype independent of the short image links, which expire around 2026-11-10. The screenshots are design research, not files to add to a user's site.

| Saved screen | Permanent source | Pattern used |
| --- | --- | --- |
| [Squarespace library](squarespace-library.webp) | [Mobbin screen](https://mobbin.com/screens/3168d383-2323-47e9-ae48-7cd906d92027) | Folders above a calm thumbnail grid |
| [Shopify detail](shopify-detail.webp) | [Mobbin screen](https://mobbin.com/screens/36e740f3-33be-483d-a6f4-2793cc531a18) | Large preview with a plain information card and usage |
| [Klaviyo optimise](klaviyo-optimise.webp) | [Mobbin screen](https://mobbin.com/screens/470df6f6-008e-49ff-a00e-396068c4f35c) | Before and after, size saving, recommended smaller copy |
| [Shopify phone picker](shopify-phone-picker.webp) | [Mobbin screen](https://mobbin.com/screens/150c862e-fb22-463f-a334-9468f88630e3) | Search, filters, two columns and reachable selection action |
| [Air selection](air-selection.webp) | [Mobbin screen](https://mobbin.com/screens/e213ec25-0d67-4977-b0e1-6d49141be0b3) | Visible selection and a floating action bar |
| [Google One clean-up](google-one-cleanup.webp) | [Mobbin flow](https://mobbin.com/flows/bbf6760f-a1bc-48f8-9bc6-df429d81421e) | Suggestions grouped by the task and size |
| [Apple Photos library](apple-photos-library.webp) | [Mobbin screen](https://mobbin.com/screens/fd1557f6-17b2-4214-baca-c788ba625f5d) | Picture-led grid, quiet controls and little explanatory copy; downloaded and inspected on 2026-10-12 for the photo-app refinement |
| [Google Photos timeline](google-photos-timeline.webp) | [Mobbin screen](https://mobbin.com/screens/b8943b54-3545-408d-9683-5958a00f5ba1) | Date groups and closely spaced pictures with varied frame sizes; downloaded and inspected on 2026-10-12 for the new comparison |
| [Google Photos selection](google-photos-selection.webp) | [Mobbin screen](https://mobbin.com/screens/a0249152-98cb-466e-863c-f7a8e3baff9c) | Explicit selection mode, blue checks, selected count and actions for several files; downloaded and inspected on 2026-10-12 |
| [Apple Photos view options](apple-photos-view-options.webp) | [Mobbin screen](https://mobbin.com/screens/b83829a3-4ce6-4755-b53e-165252dd54e4) | Dense square library with grid density and aspect-ratio options; downloaded and inspected on 2026-10-12 |
| [Apple Photos filters](apple-photos-filter-menu.webp) | [Mobbin screen](https://mobbin.com/screens/e7215100-cdc1-4799-9b86-f88dffba4441) | A compact menu for narrowing an All Items library; downloaded and inspected on 2026-10-12. Only the editor's already agreed kinds and Collection filtering are carried forward |
| [Apple Photos file information](apple-photos-file-info.webp) | [Mobbin screen](https://mobbin.com/screens/1cd13420-1706-4a92-b988-e5f741ec1aad) | Full image above grouped file information and a compact action area; downloaded and inspected on 2026-10-12 for the supporting-screen refinement. The editor keeps its own usage, collection and description fields, without camera/location features |
| [Google Photos Add selection](google-photos-add-selection.webp) | [Mobbin screen](https://mobbin.com/screens/edb479f0-9c30-46fa-bfb4-9363d0bca540) | Cancel, selected count and Add in one header above previews. This is selection of existing photos, not evidence of file upload or optimisation; only its layout informs the editor's import/picker presentation. Downloaded and inspected on 2026-10-12 |
| [Google Photos clean-up review](google-photos-cleanup-review.webp) | [Mobbin screen](https://mobbin.com/screens/5774ee10-df28-4ff4-8363-9b3688cad2d1) | Large preview and a focused review action, with size information; downloaded and inspected on 2026-10-12 |
| [Google Photos clean-up selection](google-photos-cleanup-selection.webp) | [Mobbin screen](https://mobbin.com/screens/45a17dde-0c21-4426-8faa-9d764ac0fa96) | Selected count, category and visible preview before removal; downloaded and inspected on 2026-10-12. Cloud storage quotas and consumer-photo deletion rules are not carried into the editor |

Full research remains on `research/mm-01-mobbin-patterns`, at `docs/wayfinder/media-manager/research/01-mobbin-patterns.md`; today's-code research remains on `research/mm-04-media-code-today`, at `docs/wayfinder/media-manager/research/04-media-code-today.md`. Read with `git show`, without switching branches.

## New photo-app comparison

The comparison explored **Timeline** (date-grouped rows), **Tiles** (a dense square wall) and **Natural** (full images at their original aspect ratios). Lex chose **Tiles** on 2026-10-12; [tiles.html](../tiles.html) is the current selected mockup. The comparison harness was removed after selection, with its source retained at `f2956c77`: `git show f2956c77:docs/wayfinder/media-manager/prototype/photo-app-directions.html`. Its [validation record](../photo-app-validation.md) and publication remain research evidence. The screenshots above inform layout and selection, rather than adding cloud accounts, capture-date rules or consumer-photo features to the editor. Timeline's sample added-date groups were not selected.

Two additional images were copied unchanged from the map's `~/Projects/techies-reviews` reference site: `images/uploads/2023/12/lex-bw.png` → `../demo-media/portrait-mono.png` (472 × 521), and `images/brand/lex.png` → `../demo-media/portrait-colour.png` (639 × 639). The existing artwork remains sample content. Layout ratios use the actual asset dimensions, while file sizes, usage, dates and page placements are demonstration data. No image was extracted from a Mobbin screenshot.

The later supporting-screen pass applies the same photo-app direction to file details, adding files with optimise, the compatible page picker, clean-up, selection actions and usage information. It keeps the chosen Tiles library and the existing media model. The references guide visual hierarchy and compact controls; upload defaults, scanner scope and removal policies remain decisions in their separate tickets.

## WordPress 7.1 media editor (Crop)

Captured on 2026-10-13 for [Prototype crop and the focus point](../../tickets/09-prototype-crop-and-focus.md), after Lex said he likes how the WordPress image editor looks and works. Screens come from a real WordPress 7.1 site run locally with the WordPress Playground command line tool (`@wp-playground/cli` 3.1.58, `server --wp=7.1`, PHP 8.3; the current release is 7.1.3), driven by headless Chromium. The picture is our own demo file `../demo-media/pink-light.webp` (960 × 538), uploaded as `studio-lights.webp`; nothing was taken from WordPress media. Desktop shots are 1440 × 900; phone shots are 390 × 844 at 2× and reduced. They show the editor opened from an Image block's **Crop** button unless noted. Background reading: the [call for testing](https://make.wordpress.org/core/2026/05/21/media-editor-modal-call-for-testing/) and the Gutenberg [23.3](https://make.wordpress.org/core/2026/06/03/whats-new-in-gutenberg-23-3-03-jun/) and [23.5](https://make.wordpress.org/core/2026/07/01/whats-new-in-gutenberg-23-5-july-1-2026/) release notes. Our restyled mockup is [crop-wordpress-style.html](../crop-wordpress-style.html).

| Saved screen | What it shows |
| --- | --- |
| [Default](wordpress-media-editor-default.webp) | Opens as "Edit media" on Free: picture area left, Crop / Details tabs right, straighten ruler under the picture, Reset · Undo · Redo and Cancel · Save at the bottom; Save greyed until something changes |
| [Wide 16:9](wordpress-media-editor-wide-16-9.webp) | Aspect ratio dropdown set to "Wide - 16:9"; fixed shapes keep only the four corner handles |
| [Square, zoom, straighten](wordpress-media-editor-square-zoom-straighten.webp) | Square after two Zoom in presses and 8° on the ruler: the picture behind the fixed frame tilts and grows; the outside shows through a pale grey wash; the ruler gets a blue focus ring |
| [Turned and flipped](wordpress-media-editor-turned-and-flipped.webp) | After Flip horizontal (button stays pressed, dark) and Rotate 90° clockwise |
| [Resizing, Free](wordpress-media-editor-resizing-free.webp) | While dragging a corner: thirds grid inside the frame, live "W: 759px H: 415px" label by the handle |
| [Magnified after resize](wordpress-media-editor-magnified-after-resize.webp) | About two seconds after letting go: the smaller frame is enlarged to fill the picture area again (the "magnified crop canvas") |
| [Details tab](wordpress-media-editor-details-tab.webp) | Title, Alt text, Caption, Description, then date added, author, file name, type, size, dimensions, attached to |
| [Keyboard shortcuts](wordpress-media-editor-keyboard-shortcuts.webp) | Ctrl Z / Ctrl Shift Z, arrows to pan, + / − zoom, R and Shift R turn, H / V flip, Shift + arrows for larger steps |
| [Panel hidden](wordpress-media-editor-panel-hidden.webp) | Side panel closed with the header's panel button; the picture area takes the full width. WordPress remembers this choice next time |
| [After Save](wordpress-media-editor-after-save.webp) | Back in the post: the block now shows `studio-lights-…-edited.webp`, with an "Image edited. Undo" snackbar |
| [Phone](wordpress-media-editor-phone.webp) | Full screen; no side panel and no Details; one row of icon buttons (turn ×2, flip ×2, zoom ×2, aspect ratio) above Reset · Undo · Redo · Cancel · Save |
| [Phone shape menu](wordpress-media-editor-phone-shape-menu.webp) | The aspect ratio button opens a menu: Free, Original, Square - 1:1, Standard - 4:3, Portrait - 3:4, Classic - 3:2, Classic Portrait - 2:3, Wide - 16:9, Tall - 9:16 |
| [Cover block](wordpress-media-editor-cover-block.webp) | The same editor from a Cover block's "Crop background image" button; it opens on Free and knows nothing about the cover's own shape |

### How it is laid out

- **Window.** A large dialog 40 px in from every edge of the screen (1360 × 820 on a 1440 × 900 screen), white, 8 px corners, soft layered shadow, 35% black backdrop. Header 72 px: "Edit media" (20 px, semi-bold) on the left; on the right three 32 px icon buttons: keyboard shortcuts, side panel (dark when on), close.
- **Picture area.** Left, flat light grey (#e0e0e0) panel with rounded corners. The crop frame has a thin dark border; handles are 12 px white circles with a 1 px blue ring, each with an invisible 44 px grab area. Free shows eight handles (corners and edges); fixed shapes show four corners. Outside the frame the picture is seen through a pale grey wash, not darkened. A thirds grid appears only while dragging. Dragging moves the **picture** under a frame that stays put; the frame is always enlarged to fill the area after a resize (the "magnified crop canvas"). Pinch zoom is listed in the release notes (not tried here).
- **Straighten.** A 360 px ruler under the picture, inside the grey area: −45° to 45°, numbers every 15°, the current value in bold over a blue centre line; the scale slides under the line as you drag. Turning by 90° is done with buttons instead (the "snap" rotation).
- **Side panel.** 280 px, right. Two plain tabs, **Crop** and **Details**, with a close cross. Crop tab: small uppercase labels ROTATE (two buttons), FLIP (two buttons), ZOOM (+ and −), then ASPECT RATIO as a 40 px dropdown. Details tab: the picture's title, alt text, caption and description fields plus file facts.
- **Bottom bar.** Left: Reset (text button), Undo, Redo. Right: Cancel (text) and Save (blue, greyed until there is a change).
- **Phone.** Full screen. The side panel and Details disappear; the controls become one row of 32 px icon buttons under the picture, the shapes move into a menu, and the bottom bar stays.
- **Type and colour.** System font, 13 px body, 11 px semi-bold uppercase labels, near-black text (#1e1e1e), WordPress blue #3858e9 for the primary button, handles, links and the ruler pointer.

### What Save does

Save writes a **new file** next to the original, named `…-edited` (seen: `studio-lights-5-edited.webp`, a new Media item), and switches only this block to it. The original file and other posts that use it are untouched. A snackbar says "Image edited." with Undo. Opening Crop again starts from the edited file, not the original (no earlier crop is put back), on Free. There is **no focus point** in this editor; the Cover block still has its separate focal point picker in the block settings. The call for testing describes the crop as "block-level, not attachment-level"; we saw that as a new attachment used only by this block.
