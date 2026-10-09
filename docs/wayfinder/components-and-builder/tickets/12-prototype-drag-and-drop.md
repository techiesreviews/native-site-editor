---
title: Prototype drag and drop for nested blocks
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [10-block-set, 11-research-insert-drag-today]
---

## Question

Using the block set (ticket 10) and the gaps found in ticket 11, how does dragging a block into a nested position feel: the drop indicator (line, box, ghost), the order of targets when the pointer is over a deep tree, dropping into an empty container, moving an existing block by drag on the canvas and in Structure, dropping into a component instance (ticket 10: only into its unnamed slot; named slots refuse), and the keyboard alternative? Prototype on `dev` behind a flag and decide with Lex.

## Resolution (2026-10-09)

Decided with Lex by trying it live on the real starter (tunnel to a local editor) behind `?proto=blocks`: A line and label, B boxes and gaps, C Structure-led; then D, which combines A and C, revised over three more rounds. **D is the design.** The prototype code is throwaway and lives only on the branch `prototype/cb-12-drag-and-drop` (`7c93c2a`, `5840c75`, `6cac9c9`, `1862832`), never on `dev`.

**Where blocks come from**

1. **An icon rail** at the far left, before Page Structure, always visible: the six blocks (ticket 10) as plain icons. Hover or focus shows the name only ("Section", "Div", "Image"…), which is also the accessible label. The Add panel keeps components and sections only.
2. **Click to insert, following the selection:** a selected Section or Div takes the block inside, at the end; a selected leaf (Heading, Paragraph, Image, Button) takes it right after, in the same container; a Section always goes after the selection's page band (never nested); with nothing selected, a Section goes after the last band and other blocks into the last Section (or a new one). The new block is selected, so the next click builds on it: a new Section or Div takes the following clicks inside it, a new leaf puts the next one after it. Esc goes up a level. A selected instance takes the block into its items slot; one without an items slot refuses with the reason.
3. **No dialogs on insert:** Image inserts a placeholder image (`alt=""`, width and height) and Button `<a class="btn" href="#">Button</a>` at once. "Choose image…" and "Alt text" stay on the Image edit bar, and links keep their usual controls, for afterwards. Div's Stack/Grid is a Layout select on the Div's edit bar, Stack by default. (Amends ticket 10's Image and Button insert dialogs.)
4. **A label flashes at the new block** after a click-insert ("Into Section › after Heading"); a refusal flashes the red reason and inserts nothing.

**Dragging (A on the canvas, C in Structure)**

5. **On the canvas:** a thin insertion line, sideways between items in rows and grids, plus a floating label naming the target ("Into Div (stack) › after Paragraph"). The innermost valid container wins; within ~8 px of its edge the target escapes to the parent; Alt or Tab steps up a level, Shift+Tab back. No border around the target container: the line and label are the only cue. Empty containers show a tinted "Drop into the empty Div" area. Auto-scroll near the frame edges, 7 px before a drag starts, Esc cancels (as today).
6. **Structure mirrors the canvas:** while dragging over the canvas, the tree unfolds to the target and shows the same spot as an indented line. Dropping in the tree itself picks the depth from the pointer's x, as in file trees. The target row gets a faint tint, no border.
7. **Folded rows spring open:** holding a non-Section block over a folded row that can take it (Section, Div, a component with an items slot) for ~400 ms opens it, with the caret turning as the cue; deeper rows open the same way. Rows opened this way fold back when the drag ends elsewhere (or when the pointer moves on below them); rows the user had open stay open.
8. **Sections never refuse:** a dragged Section (new or existing, including section components), on the canvas or in Structure, always snaps to the nearest gap between page bands: the half of the band under the pointer picks before or after; a nested row resolves to its band; the header and footer give the first and last gap. Nothing springs open while a Section is dragged.
9. **Refusals:** other blocks keep ticket 10's rules. A named slot that isn't an items slot shows a red outline with its reason ("The “title” slot is filled by editing its text…").

**Moving existing blocks**

10. **Drag the block itself:** pressing on a block and moving 7 px moves it (a plain click still selects or starts text editing). The name chip above the edit bar ("Image") also drags, which is how a text block being edited is moved. Structure rows drag. There is **no ⠿ grip and no "Move to…"** on the edit bar. The header and footer don't drag from the page.
11. **Keyboard:** Alt+↑/↓ moves among siblings and Alt+←/→ out of / into containers, on the canvas and on Structure rows.
12. **Card reorder by drag** (the map's fog) is this same move: cards are items in a grid, moved with the sideways line.

**Items slots:** drops and click-inserts into an instance go only into its items slots (ticket 04: the unnamed slot, a slot the page fills with repeated items, or one whose fallback holds a component). The page owns that markup, so the instance seal (`native-operations.ts:112`) is bypassed only there.

