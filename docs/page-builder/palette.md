# Command palette and keyboard layer

One field finds everything the editor can open or do, and one sheet lists every key the
editor answers. Ideas from Framer's ⌘K, Linear and Raycast (one search, grouped results,
recent first) and VS Code (⌘P to go to a file, `>` for commands).

## Use it

| Keys | What | Where it works |
| --- | --- | --- |
| ⌘K / Ctrl+K | Command palette: pages, files, components, actions | Everywhere except typing in code (Monaco's own ⌘K chords stay) and except with text selected on the canvas or in the edit bar (⌘K links it) |
| ⌘P / Ctrl+P | Go to: pages, files and components only | Everywhere, typing in code too (Monaco does not use it) |
| ? | Keyboard shortcuts sheet | When not typing (not in a field, text element or code) |
| ⌘D / Ctrl+D | Duplicate the selected section | Canvas, when not typing |
| Delete / Backspace | Remove the selected section | Canvas, when not typing |
| Shift+Enter | Select parent | Canvas, when not typing (Enter finishes typing in a text first) |
| ⌘Z, ⇧⌘Z, Ctrl+Y | Undo, redo | Now on the canvas too (when not typing), as the toolbar's buttons |

In the palette: type to search (letters in order, each word anywhere: `fe bl` finds
Add Feature block), Up/Down (Ctrl+N/P on a Mac) move, Page Up/Down jump five, Tab jumps to the
next group, Enter or a click runs, Escape or a click outside closes and gives focus back.
A leading `>` searches actions only, `/` pages only (by URL too: `/about`). Matched
letters are highlighted. Before typing: what the selection can do, recent items, then
actions, pages and section components; files show once something is typed.

Results by group:

- **Selection**: the edit bar's controls for the selected element, by their own names
  (Move up, Duplicate, Remove, Bold, Heading level: H3, Text size: Large, Address, Label…),
  each running the control itself; plus Select parent. Fields (Address, Alt text, Label)
  open in the edit bar.
- **Agent**: Ask agent… opens the edit bar's note; with an agent connected and something
  typed, `Ask agent: “…”` sends what was typed about the selected element.
- **Actions**: Publish changes, Review changes to publish, Undo, Redo, Hide/Show code,
  Hide/Show page structure, New page, New file or folder, Show pages and files, Show
  history, Go to page or file, Keyboard shortcuts. Only what can run now is listed.
  There is no separate "Save": drafts keep themselves, and Publish is Save to GitHub
  (its keywords include save and commit).
- **Pages**: by title (and URL), opening the page.
- **Components**: `Add <Component>` for each section component, inserted after the
  selected section (or the section the selection is in), else at the end of `main`, as
  one undo step through the same edit as the insert picker; `Open <Component> component`
  opens its template.
- **Files**: every other file of the repository, opened in the code pane.

Recent items are remembered in localStorage (`native-site-editor:palette-recent`) by
command id and shown only when they exist now.

## Add a command

`src/page-builder/commands.ts` is the registry; one call adds a command to the palette
and its shortcut to the sheet:

```ts
import { registerCommand } from "./page-builder/commands";

registerCommand({
  id: "page.duplicate",
  title: "Duplicate page",
  group: "Actions",
  icon: "copy",                       // a name from command-palette.ts ICONS
  keywords: ["copy", "clone"],
  shortcut: [["Mod", "Shift", "D"]],  // shown only; bind the key where it works
  when: () => Boolean(currentPage()),
  run: () => duplicatePage(),
});
```

Commands that come and go with the site use `registerCommandSource(() => Command[])`
(asked on every keystroke, so keep it cheap). A key that is no command (a list's keys)
goes to the sheet with `registerShortcut({ area, label, keys, note })`. "Mod" is ⌘ on a
Mac and Ctrl elsewhere; key caps are drawn per platform.

## How it is built

- `src/page-builder/palette-search.ts`: fuzzy matching (best placement by dynamic
  programming: word starts and runs score, scattered mid-word letters do not count),
  ranking with recency, grouping, query prefixes. Pure, unit tested.
- `src/page-builder/commands.ts`: the registry and key formatting/matching. Pure.
- `src/components/command-palette.ts` (+ `.css`): the dialog (a combobox field with
  `aria-activedescendant` over a grouped listbox). `src/components/shortcut-sheet.ts`:
  the sheet, from the registry.
- `src/page-builder/palette.ts`: the editor's commands and the keys. It gets what it
  calls from `main.ts` (`mountPalette()`, called at the end of `mountWorkspace`), and the
  selected element's edit bar model (`nativeEditBarModel`, set in `renderNativeEditBar`)
  for the Selection group. Publish, Review changes, Show history and Ask agent… press the
  editor's own buttons. `SidebarResize` gained `toggle()`.
- `src/components/native-preview-runtime.js`, block "Editor shortcuts": keys pressed in the
  preview frame never reach the editor, so the runtime forwards ⌘K, ⌘P, ?, undo/redo and
  the section keys as `shortcut` messages (only when not typing; ⌘K with text selected
  still links). The editor accepts them only from a preview frame's window.

Motion: 160 ms fade and lift on open, none under `prefers-reduced-motion`. Colours and
sizes are the theme's tokens; components carry the `--component` accent.

## Tested

- `tests/palette-search.test.ts`: matching, ranking, recency, grouping, prefixes,
  registry, key caps and matching per platform.
- `tests/native-save/native-palette.spec.ts`: opening, moving and running from the
  keyboard and mouse, focus returning, recent first, `/` and `>` scopes, ⌘P from Monaco
  while ⌘K stays Monaco's, Hide/Show code and page structure, the section's controls from
  the palette pressed in the preview, ⌘D / Delete / Shift+Enter / undo / redo on the
  canvas, Select parent, Add Feature block after the selected section with one-step undo,
  and the shortcuts sheet from ?, from the palette, and not while typing.

## Not done

- Monaco's F1 palette does not list the editor's commands.
- No palette entry for page settings (title, description, URL). Controls other slices
  add to the edit bar (buttons, selects, menus, fields) appear in the Selection group
  without changes here; icons and shortcuts for them go in `BAR_ICONS` / `BAR_SHORTCUTS`.
