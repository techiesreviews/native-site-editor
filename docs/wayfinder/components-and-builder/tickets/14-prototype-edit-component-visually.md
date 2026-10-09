---
title: Prototype editing a component's template visually
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [04-prototype-making-components, 12-prototype-drag-and-drop]
---

## Question

Ticket 04 decided that Edit component mode edits the template in the preview, not only in the code pane, and that Make component and New component both land there. How does that look and behave? On the selected instance: how the template's fixed parts, its slots and their fallbacks are shown and edited in place, and whether the page's own slot content is swapped for the fallbacks while editing; how the block set (ticket 10) and drag and drop (ticket 12) work inside the template, including into items slots; how a slot is added, renamed or removed (the chips from ticket 04's making mode?); how a nested card component is drilled into; how Used on, Done and undo work when one edit changes every page that uses it; and how the code pane stays in sync beside it. Prototype it on `dev` behind a flag, starting from New component's blank section and from a component made from the starter's Recent work.

## Resolution (2026-10-09)

Decided with Lex by trying it live on the real starter (tunnel to a local editor) behind `?proto=template`: A in place on the page, B an isolated canvas with live "Used on" thumbnails, C split page/template; then A revised over three rounds. **A is the design.** The prototype code is throwaway and lives only on the branch `prototype/cb-14-edit-component` (`ac8ad60`, `34de771`, `99f5696`, `2b192dc`), never on `dev`.

**Edit component mode, in place (A)**

1. **Where it starts:** the instance's edit bar (Edit component), its Structure row, after Create in making mode and after "+ New component" (ticket 04), and the Edit component button on a locked fixed part (5).
2. **In place:** the selected instance becomes its template where it sits on the page, inside a purple frame; the rest of the page is dimmed but visible. A slim bar above the canvas: "Editing `<section-work>` · used on N pages ▾ · Show this page's content / Show placeholders · Done". Placeholders (the template's fallbacks) are shown by default; the switch shows this page's own slot content instead.
3. **Editing the template:** fixed text is edited in place (it changes every page that uses the component). Blocks go in with the rail (ticket 12): click-insert by selection and drag with the line and label. Items slots take blocks; named slots refuse drops with the reason (ticket 10). Section is refused inside a template. A nested card component opens with "◇ card-project ›" (or "Open ›" in Structure) and back out by the breadcrumb.
4. **The slot chip:** the edit bar's name label reads "◇ Section work › Heading [title]": the chip comes **after the element name** and is the same control as the badge in Structure. A slot is a solid purple chip (pink for an items slot, "items ×1"); a fixed part is a muted grey chip with its name struck through (the name it had, or the role name it would get, e.g. "text"). A single click toggles slot ↔ fixed (with a short wait so a double-click doesn't flip it); a double-click renames by editing the chip's own text in place (a caret in the chip, no input-field look; Enter or leaving it commits, Esc cancels), mirrored in Structure. No chips at the element's end on the canvas and no "+" on hover.
5. **Structure shows the end result:** the editor's normal Page Structure rows, names and icons for the component, with one purple outline round it. Each part that is or can be a slot carries its badge on the row: purple when a slot, muted and struck through when fixed.
6. **Undo and code:** each change is one undo step through the editor's edit path on `components/<tag>/<tag>.html`; the code pane follows it.

**On the page, outside the mode**

7. **Fixed parts are locked:** they can't be edited or dropped into on the page. Clicking one selects the instance, and the name label says "○ Paragraph fixed in `<section-work>`" with an **Edit component** button that opens the mode with that part selected. Page Structure lists only the instance's slots.
8. **Turning a fixed part into a slot** (in the mode) gives every page that uses the component its own copy of the part's text on Done, in the same undo step, so the part stays visible and becomes editable there (a section component hides an unfilled slot, ticket 03 rule 7).
9. **Renaming or removing a slot** rewrites every page's `slot="…"` in the same undo step (the prototype only changed the template; the build must not).

**Build notes from the prototype**

- The prototype's integration flickers (it reloads the preview on each change). The build must update the instance in place without visible flicker.
- Blocks built into an items slot's placeholder content appear only on new instances: pages that already fill the slot show their own items. That placeholder is effectively the starting content for new instances.
- Inserting a block sometimes scrolled the component under the site's sticky header; the build should keep the edited part in view.
- B's live "Used on" thumbnails and C's split view were not chosen.

**Changed after closing (Lex, 2026-10-09):** renaming a slot never turns the chip into an input field; the double-click puts a caret in the chip's text, which is edited in place like any text, so it feels integrated. The same applies to Structure badges and to ticket 04's making-mode chips.

**Amended by Lex after handoff (2026-10-09):** there is no making mode (see ticket 04's last amendment). In rule 1, "after Create in making mode" becomes "after Make component", which creates at once and lands here; the plan's notes (e.g. page rules that can't follow) show in the slim bar as a dismissible note. The chips of rule 4, the Structure badges of rule 5 (with one purple border round the component's rows) and a right-click menu (Make slot, Rename slot, Remove slot) are the only way slots are marked. The component itself is renamed here: double-click its tag in the slim bar and edit it in place (no input-field look); the folder and files, the tag in its CSS and every page's instances follow in one undo step, and the loader needs nothing. Build slices 22, 23–24, 44, 46, 66 and 76.

**Changed (Lex, 2026-10-09):** no locked-part hint or Edit component button in the label when a fixed part is clicked on the page (rule 7); the part stays locked and selects the instance (build slice 90).

**Changed (Lex, 2026-10-09):** no "Show this page's content / Show placeholders" switch; Edit component mode always shows the template's placeholders (build slice 89).
