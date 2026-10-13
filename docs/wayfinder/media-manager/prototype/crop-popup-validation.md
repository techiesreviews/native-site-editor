# Crop popup (Brizy style) with the large editor behind it: mockup check, 2026-10-13

Planning-only mockup for [Prototype crop and the focus point](../tickets/09-prototype-crop-and-focus.md), after Lex chose **two levels**: a small Brizy-style popup for everyday changes, and an "Open large editor" button for precise work in the WordPress-style window. File: [crop-popup.html](crop-popup.html), 236,499 bytes, fully self-contained. It starts from [crop-wordpress-style.html](crop-wordpress-style.html), so it has the same five demo pictures as WebP data and the same inlined Phosphor icons (plus `arrows-out-simple`), with no network addresses. Source SHA256 at commit: `b18c2fabbe4db629fdbf0547eb5eea4f5789c311b1bc3bbf627b8c2e88525ca8`. No editor code was changed. Reference: [references/brizy-image-popup.webp](references/brizy-image-popup.webp).

## Change from Lex during the build: one image button, no Crop button

Lex asked mid-build to drop the separate Crop button. As in Brizy, the popup opens from the edit bar's image button. Changes made for this:

- The edit bar's **Replace image…** and **Crop** buttons are replaced by one **Image** button (picture icon + "Image"). It sits where Replace image… was and has a small badge with the spot's state ("Square", "Card's shape", "Trimmed"). The tooltip repeats it ("Picture, shape and focus · Square").
- The popup holds everything: the thumbnail, the shape menu on the thumbnail, the focus dot, Zoom, Turn, Free trimming, the message, **Replace**, Open large editor and Done. It is titled **Image** (or **Sharing image**).
- **Replace** is a small link under the thumbnail. In Brizy, clicking the thumbnail picks a new picture. Here the thumbnail is where you drag the dot, so Replace gets its own button. It swaps the thumbnail for a 3-column grid of pictures from Media with a Back link. Brizy's ✕ for removing the picture is left out (Remove stays in the edit bar).
- The sharing image in Page settings gets the same kind of button ("Image · 1200 × 630") and the same popup.

## What it shows

The same pretend site as before. A switch picks the example (**On the page**, **Inside a card**, **Sharing image**). A second mockup switch, **Popup look: Light / Dark**, changes the popup's look (light is the default).

The popup follows Brizy's layout: compact rows with the label on the left, the control on the right and thin dividers; rounded corners; the shape menu sits over the top of a picture area 196 px tall. It uses our edit bar's lavender (#cfd7f9) and our blue (#275ac8), not Brizy's dark theme. Rows, top to bottom:

1. **Picture**: the whole picture. Over it are a dark shape pill (Original, Square, 4:3, 16:9, Tall 4:5, Free; inside the card **Card's shape (4:3)** comes first) and the frame of what the spot shows, with a pale wash outside it (as in the WordPress window). Inside the frame is the draggable blue dot; clicking anywhere on the picture moves the dot there. On **Free**, the dot is replaced by four corner handles; drag a corner to trim or drag inside to move. Below: a one-line hint ("Drag the dot to what matters most", "Drag the corners to trim", or the card warning) and **Replace**.
2. **Zoom**: a slider from 100 % to 500 % with the value shown.
3. **Turn**: turn left / right 90°, with the current angle. If the large editor already straightened or flipped the trim, that shows here too ("0° · straightened −4° · flipped").
4. **Preview**: small live phone and computer views of the page (on phones only the computer view, because the page itself is the phone view). For the sharing image: a small link preview.
5. The **message**, one line: blue "Only changes this spot" or yellow "Saves a new picture for this spot". The rules are unchanged: shape and dot = nothing new; Free trim, zoom in and turn = a new picture used only here. Re-cropping a trimmed spot says "Updates this spot's trimmed picture". The sharing image says "Only changes the sharing copy". Hovering shows the longer explanation.
6. Footer: **Open large editor** and **Done**. The ✕ (top right) and Escape close without changes.

**Where it opens.** On computers the popup sits beside the picture, level with the edit bar, with a small pointer towards the bar, so the page picture stays visible while it changes live. It goes on the left of the picture if there is room, else on the right, else below the edit bar. On phones (≤ 700 px) it is a bottom sheet, at most 56 % of the screen high. The message and buttons stay pinned at its bottom while the rows scroll. The page scrolls so the picture sits just above the sheet.

**Live.** The page picture, its shape tag ("Tall 4:5", "New picture") and the previews follow every drag, zoom, turn and shape change. The edit bar badge changes only after Done.

**Open large editor** opens the existing WordPress-style window with the popup's state carried over (shape, dot, zoom, turn, trim). The window works exactly as before. Its **Done** saves and closes both levels. **Cancel**, ✕ and Escape go back to the popup as it was.

**Kept states:** inside the card it opens on Card's shape, and other shapes show "This card will look different from the others." (also in the shape menu). Replace keeps the spot's shape, centres the new picture, drops trimming made for the old one and says so in a note at the top of the popup. The sharing image is locked to 1200 × 630, with a lock on the pill. After Done, a snackbar with Undo appears; no snackbar if nothing changed.

**Left out on purpose:** Brizy's Lazy Load, Fetch Priority and Open in Lightbox switches (loading is automatic, decided earlier) and its Mask tab.

## Checks (Playwright Chromium, headless)

Scripted click-throughs at 1440 × 900, 900 × 800 and 390 × 844 (phone, touch, 2.8×). No page errors or console errors in the final run.

- **Hero, computer:** opens to the left of the picture, level with the edit bar, not covering the picture, no sideways scrolling. Focus goes to the dot. Tall 4:5 + dragging the dot to 72 %/40 % kept the blue message; the page picture became 4:5 at once. Two Left arrow presses moved the dot 72 % → 68 %. Zoom 150 % turned the message yellow; back to 100 % made it blue again. Turn right made it yellow ("90°"); turn left made it blue again. Escape closed without changes and focus went back to the Image button (badge still "Square").
- **Free:** four handles, no dot. Dragging two corners made a trim ("Saves a new picture for this spot", zoom shows 143 %). Arrow and Alt+arrow keys move and resize the frame.
- **Open large editor:** the window opened on Free with the same trim, Done active and its own yellow notice. Cancel went back to the popup unchanged, focused on Open large editor. Done in the popup saved `studio-lights-crop.webp`, the badge read "Trimmed" and the snackbar offered Undo. Reopening showed Free and "Updates this spot's trimmed picture". From there the large window's Done (after a turn) replaced the trimmed picture.
- **Card:** the pill read "Card's shape (4:3)" with "The shape every card in this list uses." The menu lists Card's shape first and has the note about other cards. Square showed the warning. Replace → orange-orbit.webp kept the card's shape and showed the note. Escape put the original picture back. Replace + Done gave "orange-orbit.webp is in this spot." with Undo.
- **Sharing image:** the popup opened to the left of the Page settings box. The pill was locked at 1200 × 630, with no shape menu. Dot and zoom updated the link card in Page settings live and kept "Only changes the sharing copy". The large window opened with the shape locked ("Crop sharing image"). Done: "Sharing copy updated. Your picture itself is unchanged."
- **Tab order** in the popup: shape menu → dot (or trim frame) → Replace → Zoom → Turn left → Turn right → Open large editor → Done → ✕. Up/Down/Home/End move through the shape menu; Escape closes the menu first, then the Replace grid, then the popup.
- **Phone:** bottom sheet 473 px high on an 844 px screen. The picture sits above it (picture 55–363 px, sheet starts at 371 px), and the sheet content scrolls. Every button, the slider, the dot and the menu items measured at least 44 × 44 px, including in the Replace grid. Open large editor opened the existing full-screen phone layout with the shape carried over; ✕ returned to the sheet. On the sharing image the link card stays above the sheet.

Fixes made during checking: the popup was placed before the page picture had its new height (it now re-places itself after each update). Undo after re-cropping pointed at a picture that had been removed from Media (Undo now puts Media back as well; this bug was also in crop-wordpress-style.html). The trim handles were hidden under the shape pill (the picture now sits below the pill). The phone sheet covered the picture (it is now shorter, with the message and buttons pinned).

## Choices for Lex to check

- **Light popup by default.** The dark version (switch at the top, screenshot 6) looks closer to Brizy but heavy next to our lavender edit bar. I'd keep light.
- **Popup beside the picture, not over it** (Brizy puts it over the picture). This keeps the live page picture visible. It falls back to below the bar when there is no room.
- **Replace is a link under the thumbnail**, not "click the thumbnail" as in Brizy, because clicking the thumbnail moves the dot.
- **Replace takes effect in the popup at once, but ✕ / Escape undo it**: nothing from the popup is kept without Done.
- **Inside the card, the menu has no plain "4:3"**, because Card's shape is already 4:3 (the large window does the same).
- **The dot is the focus point**, where the picture is anchored (like Brizy's dot), and the frame follows it. With Original and no zoom the whole picture shows, so moving the dot changes nothing you can see yet.
- **Live previews are small** (phone and computer views at about 60 and 150 px wide); on phones only the computer view is shown.
- **The popup does not trap Tab**: like Brizy's, Tab after ✕ moves on to the page.

## Not checked / known limits

- Only Chromium; WebKit (Safari) was not run.
- Touch was simulated with a mouse at phone size. Swiping the sheet down to close is not built (use ✕); pinch zoom is not built.
- The pointer on the popup's side is small. It points at the edit bar, not exactly at the Image button.
- Alt text, Ask agent and Remove are still inert ("Not part of this mockup.").
- Not yet published with `html_render`; no push or deployment.
