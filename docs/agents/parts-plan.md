# Parts plan: one folder per component

Where the editor's UI is going, so every later slice moves one component the same way. The list of what exists
today is [parts.md](parts.md); this page is the shape it should take and the order to get there. Source: the
TOOLS-238 health check (2026-11-14) and Lex's ask of the same day: components an agent can understand and find,
reuse when they exist, and extend when needed.

## Today

- **Parts:** eight on the design board, in `src/ui/parts/` (a flat folder) and `src/ui/inline-field.css`. Each has
  its code (`<part>.ts`), its options (`<part>-options.ts`, pure, tested without a browser) and its styles
  (`<part>.css`); its tests sit in the shared `tests/` folder.
- **The Button pilot** (`src/ui/parts/button.css`, TOOLS-207) did the styles right: its whole look in one file on the
  components layer, its own `--btn-*` defaults, a tone changes only those, and a screen that needs it to differ sets a
  hook in its own CSS. Its code is still `button()` in `src/ui/dom.ts`.
- **Copies:** screens still make their own buttons, badges and dialogs. `scripts/agents/copies.json` counts them per
  file and kind (128 on 2026-11-14: 58 buttons made by hand, 15 dialogs made by hand, 25 button looks, 17 badge
  looks, 13 dialog and backdrop looks). `npm test` and the kit's css check fail when a count rises.

## Target shape

```
src/ui/
  button/
    button.ts           how to make one, with typed options (today: button() in src/ui/dom.ts)
    button-options.ts   its options and markup, pure (when it has options)
    button.css          its whole look and its own --btn-* defaults, on the components layer
    button.test.ts      its test, beside it
    part.json           name, what it is for, what it is not for, how to call it, its variants
  badge/ …
docs/agents/parts.md    the parts list, generated (scripts/agents/parts-list.mjs)
```

- **One source, every reader.** A folder's `part.json` replaces its entry in `docs/agents/parts.json`; the parts
  list, and later the design board, read it. The list stays generated and checked, so it cannot go stale.
- **Nothing in `src/ui/` imports from a screen.** Screens import parts, never the other way round.
- **A screen places and sizes a part; it never gives it a look.** Margin, grid placement and size are the screen's.
  Background, border, corner, shadow and colour are the part's: a screen that needs a difference sets a hook (as
  `--btn-*`), or the part gets a new variant in its own files.
- **Reuse before new** (AGENTS.md): use a part that fits, extend one that nearly fits, add a new one only with a reason
  in the PR, as a new folder with its `part.json` in the same PR.

## Slices, one component per PR

Each slice keeps the look identical unless it says otherwise, and never moves more than its component (other build
worktrees work on this repo at the same time).

| Order | Slice | What changes |
| --- | --- | --- |
| 1 | Folders for the eight parts | Pure moves into `src/ui/<part>/` with `part.json`; the parts list reads the folders; the unit test globs (`package.json` `test`, `unit.files` and `paths.unitTests` in `scripts/agents/kit.json`) learn tests beside code |
| 2 | Import direction | A guard: nothing in `src/ui/` imports from `src/components/`, `src/page-builder/` or a screen |
| 3 | Icon button and text button | Two parts from `.icon-button` and `.text-button` in `src/style.css`; screens swap to them |
| 4 | Badge swap | Screens use the Badge part; badge looks in screens go |
| 5 | Dialog | One Dialog part with its backdrop; dialogs made by hand swap to it |
| 6 | Menu item and boxed field | Two parts from the menu rows and the boxed fields screens draw themselves |
| 7 | Screen styles split | The screens' rules out of `src/style.css` into files of their own |

## Each slice's proof

- `kit shots --compare dev`: the editor in light and dark at 390 and 1280 px, identical to `dev` (or each difference
  listed in the PR).
- `kit size`: the boot stays within its budget (355 KB).
- The copy count goes down: `node scripts/agents/copies.mjs update`, and `scripts/agents/copies.json` committed with it.
- The parts list is current: `node scripts/agents/parts-list.mjs write`, and `docs/agents/parts.md` committed with it.
- The affected unit tests and browser specs, and `npm run check`.

## When copies differ

When the copies of one look differ slightly (a backdrop shade, a close-icon size, a corner), **the most used look
wins**, without asking Lex (his rule of 2026-11-14). Count the uses with `node scripts/agents/copies.mjs report` and a
search for each class; list each screen whose look changes, with its before and after, in the PR.
