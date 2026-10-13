# Crop in the WordPress style: mockup check, 2026-10-13

Planning-only mockup for [Prototype crop and the focus point](../tickets/09-prototype-crop-and-focus.md). It rebuilds direction C ("one Crop button", chosen in [crop-focus.html](crop-focus.html)) in the layout of the WordPress 7.1 media editor, after Lex said he likes how that editor looks and works. File: [crop-wordpress-style.html](crop-wordpress-style.html), 202,654 bytes, fully self-contained: the same five demo pictures as crop-focus.html inlined as WebP data, Phosphor Regular icons inlined from `@phosphor-icons/core`, and no network addresses. Source SHA256 at commit: `7d4c2873c46c776eacb1e61d4d06598a4f739deedd0aeb06960be41a1a69ee93`. No editor code was changed. The real WordPress screens and a description of them are in [references/README.md](references/README.md#wordpress-71-media-editor-crop).

## What it shows

A pretend site ("Studio Lights") in our editor, with a switch at the top for three examples: **On the page** (hero picture), **Inside a card** (middle card) and **Sharing image** (a Page settings panel with a link preview). The edit bar keeps our editor's look; its one **Crop** button (showing the current shape, or "Trimmed") opens the crop window. The sharing image has its own Crop button in Page settings.

**Taken from WordPress:** a large window 40 px in from the screen edges, title top left with keyboard shortcuts, side panel and close buttons top right; a light grey picture area where the frame stays put and the picture moves under it; a thin dark frame with 12 px round white handles (44 px to grab), eight on Free and four corners on fixed shapes; a pale wash outside the frame; a thirds grid only while dragging; after resizing, the frame grows back to fill the area (WordPress's "magnified crop canvas"); the straighten ruler (−45° to 45°) under the picture; a side panel with two plain tabs and small uppercase labels; shapes in a dropdown named "Name (ratio)"; Reset, Undo, Redo bottom left and Cancel plus a blue primary button bottom right, greyed until something changes; a keyboard shortcuts box; snackbars with an action after saving; on phones a full-screen window with one row of icon buttons and a shape menu.

**Kept from ours (ticket 09 decisions):**

- Shapes Original, Square (1:1), Standard (4:3), Wide (16:9), Tall (4:5), Free. Choosing a shape and moving the picture only changes this spot; Free trimming, zooming in, straightening, turning and flipping save a new picture used only here. A live message in WordPress notice style says which: blue "Only changes how the picture fits this spot. Nothing new is saved." or yellow "This makes a new picture…".
- A live phone and computer preview of the spot, in the Crop tab of the side panel (on phones behind a **Preview** button, as a sheet with Preview and Details tabs). The Details tab replaces WordPress's file-information fields with this spot, the picture and, after a trim, "In Media now" (original used on 3 pages, trimmed copy used here only).
- Inside a card, Crop opens on **Card's shape (4:3)**; picking another shape shows "This card will look different from the other cards."
- Sharing image: the same window titled "Crop sharing image", locked to **Sharing shape (1200 × 630)**, with link-preview cards (in a message, on social media) instead of page previews; the message says Done updates the separate sharing copy and the picture itself doesn't change (ticket 08).
- Replace keeps the spot's shape, centres the new picture, drops trimming made for the old one, and says so in a snackbar with a **Crop** action.
- Re-cropping a trimmed spot starts from the full original with the earlier trim put back; Done replaces that trimmed picture under a fresh name (`studio-lights-crop.webp` → `studio-lights-crop-2.webp`) because nothing else uses it. Going back to a plain shape returns the spot to the original and says the trimmed picture stays in Media.
- Our blue (#275ac8, the editor action colour) replaces WordPress's #3858e9 everywhere, so the window matches our edit bar. Our editor font replaces WordPress's system font. The primary button says **Done** (as in direction C), not Save.

**Left out on purpose:** WordPress's live "W: 759px H: 415px" label while resizing (pixel numbers), its Portrait 3:4, Classic 3:2/2:3 and Tall 9:16 presets (not in our decided list), and its alt text, caption and description fields (alt text stays in our edit bar).

## Checks (Playwright Chromium, headless)

Scripted runs at 1440 × 900, 900 × 760 and 390 × 844 (phone, touch, 2×). No page errors or console errors in any run.

- **Hero:** opens on Square with the blue message. Tall (4:5) or Wide (16:9) plus dragging the picture moved what stays in view (e.g. across 50% → 72%) and kept "Nothing new is saved"; Done wrote only shape and position and the snackbar said no new picture was made. Zoom in switched the message to "This makes a new picture"; Ctrl Z undid it and the message returned. Free plus dragging a corner showed the grid, then the frame grew back to fill the area; −4° on the ruler; Done saved `studio-lights-crop.webp`, the edit bar read "Crop · Trimmed", the snackbar offered Undo. Reopening restored Free and −4° on the original and the message read "This updates the trimmed picture"; Done replaced it as described above. Reset plus Square returned the spot to the original.
- **Card:** opened on "Card's shape (4:3)" with "The shape every card in this list uses."; Square showed the warning note (side panel on computers, inside the shape menu on phones). Replace image with orange-orbit.webp kept Square, reset the position to the middle and showed the snackbar; its Crop action opened the window on the new picture.
- **Sharing image:** shape dropdown disabled with a lock and "Link previews always use this shape."; moving and zooming updated both link previews; Done showed "Sharing copy updated. Your picture itself is unchanged."
- **Keyboard:** the picture area takes focus on opening; arrow keys move what stays in view (50% → 59% after two presses), R turns, H and V flip, + and − zoom, Ctrl Z / Ctrl Shift Z undo and redo, Escape closes the shortcuts box first and then the window. Forty Tab presses never left the window. Focus returns to the Crop button on closing.
- **Side panel:** hiding it on a computer widens the picture area, and the live message moves under the picture so it stays visible.
- **Layout:** no sideways scrolling and no control past the screen edge at any width. At 390 px every button, tab and menu item in the window and the page measured at least 44 × 44 px (the side panel tab was 40 px wide and was fixed). At 900 px the side panel scrolls to reach the previews.

Fixes made during checking: a delayed history save could run after the window closed; the phone sheet stayed hidden because a more specific rule won; the shape dropdown arrow icon was missing; a snackbar stayed on top of a reopened window; link-preview web addresses overflowed; tabs were under 44 px on phones; the live message vanished with the side panel hidden.

## Not checked / known limits

- WebKit (Safari) could not be started on this machine; only Chromium was used.
- Real touch gestures were simulated with a mouse at phone size; pinch zoom is not built (the mouse wheel zooms on computers).
- WordPress's pixel snapping and its exact easing were not copied; the settle animation is a plain 0.3 s ease.
- Alt text, Ask agent and Remove are inert ("Not part of this mockup."). The Undo in the snackbar restores the spot but leaves any new picture in the pretend Media.
- Not yet published with `html_render`; no push or deployment.
