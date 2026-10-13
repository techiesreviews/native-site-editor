# Crop and focus point mockup — 2026-10-13

Planning-only mockup for [Prototype crop and the focus point](../tickets/09-prototype-crop-and-focus.md). File: [crop-focus.html](crop-focus.html), 192,386 bytes, fully self-contained (five demo pictures inlined as WebP data, Phosphor Regular icons inlined from `@phosphor-icons/core`, no network addresses). Source SHA256 at commit: `354f65313b77b40d75a4798d9ed47135400f9ac334e6c5df5c770e550d9f81cf`. No editor code was changed.

## What it shows

A pretend site ("Studio Lights") in an editor canvas with one picture selected. A top switch compares three ways; a second switch selects the picture **On the page** (hero) or **Inside a card** (middle card of a card grid, edit-bar label `Card › Image` in the component colour). Every way keeps phone and desktop live previews (the same site drawn at 390 px and 1200 px and scaled down), and every way has **Replace image…** in the edit bar.

| Way | Edit bar | Cutting / turning | After Replace image… |
| --- | --- | --- | --- |
| A. All on the page | Replace image…, Alt text · Shape (Original, Square, 4:3, 16:9, Tall 4:5), Focus point · Ask agent, Remove | None | Shape kept, focus back to the middle, note says why |
| B. Shapes on the page, cutting in Media | Same as A | Media tab → file details (Tiles look) → Crop & rotate: corner handles, Turn 90°, Straighten; Save as new picture adds `…-crop.webp` next to the original with a "New" mark; Use in this place / Keep in Media only | Same as A |
| C. One Crop button | Replace image…, Alt text · Crop (shows current shape or "Trimmed") · Ask agent, Remove | Crop screen per spot: shape chips + Free, drag the picture area, Zoom in, Straighten, Turn 90°; a live message says whether a new picture will be made; Done saves it quietly and an "In Media now" card shows both | Shape kept, focus reset; note adds that the trimmed picture stays in Media |

Rules from ticket 08 and research 03 §4, §5, §7 hold throughout: shapes and the focus point belong to the spot and never make a file; the focus point does nothing with the Original shape (the popover says so and hides the dot); cutting, zooming in and turning always make a new file and leave the original untouched. In C, reopening Crop on a trimmed spot starts again from the original with the earlier trim restored.

Edit bar look follows `src/components/edit-bar.css` and `theme.css` (light): label tab over a pale-blue panel, groups with thin rules, pressed state in the action blue, component label in violet. Two differences from the real bar: the image button reads **Replace image…** (real: "Choose image…") to match the ticket wording, and buttons grow to 44 px on phones and touch screens (real: 28 px). Media screens reuse the Tiles tokens: one bar (search pill, Collections dropdown, More), square tiles with soft name gradient and usage number, details with a large viewer beside grouped information.

## Checks (Playwright Chromium, headless)

Scripted runs at 1440 × 1000 and 390 × 844 (touch enabled), clicking through all three ways. No page errors and no console errors at either width.

- **A:** dragging the focus dot moved `object-position` on the canvas picture and both previews (e.g. 50% → 69% across); arrow keys move 2% (Shift 10%) and update the slider's spoken value ("73% across, 56% down"); Escape closes the popover and returns keyboard focus to Focus point. Shape → Tall 4:5 kept the focus. Original shape shows the explanation and no dot. Card picture: drag moved its focus (50% → 22.6%) in canvas and both previews. Replace kept 4:3, reset focus to 50% 50% and showed the note.
- **B:** Save as new picture is disabled until something is cut or turned. Corner drag, Turn 90° and Straighten 4° then Save produced `studio-lights-crop.webp` directly after `studio-lights.webp` in the grid, with the notice that the 3 pages using the original don't change. Use in this place put the new file on the page with the shape kept and focus reset.
- **C:** 4:3 + dragging the area moved the previews and kept the message at "Nothing new is saved"; Done wrote only shape and focus to the spot. Free + corner drag switched the message to "This makes a new picture"; Done saved `studio-lights-crop.webp`, the side card listed original ("Used on 3 pages") and new ("Used here only"). Reopening restored Free. Card + Square + Zoom 160% also reported a new picture. Arrow keys move the crop area.
- **Layout:** no horizontal page overflow and no control past the right edge at either width; at 390 px every button, select and slider measured at least 44 × 44 px (excluding the scaled previews).

Fixes made during checking: crop corner handles were clipped at the picture edge (dimming moved to its own clipped layer); the focus popover covered the hero picture on desktop (it now opens to the left when there is room, and sits in the flow on phones so the picture stays visible under it); phone switches were 38 px tall (now 44 px); the phone preview now scrolls to the selected card; the C message moved under the crop area so it is visible while dragging; the Original-shape popover no longer offers "Back to the middle".

## Not checked / known limits

- WebKit could not start on this machine (missing system libraries), so Safari was not checked; the page uses `aspect-ratio`, `object-fit`, container queries and canvas, all supported in current Safari. Saved crops are WebP where the browser can make them and JPEG otherwise.
- Free-trim corner handles are pointer and touch only; keyboard users move the area with arrows and resize with Shift + arrows.
- Alt text, Ask agent, Remove, search and Collections are inert ("Not part of this mockup").
- Not yet published with `html_render`; no push or deployment.
