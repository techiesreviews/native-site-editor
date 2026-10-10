---
title: Rename the component from Edit component mode's bar
type: task (AFK)
status: closed
assignee:
blocked_by: [41-edit-mode-shell, 45-slot-change-rewrites-pages, 72-atomic-redo-with-files]
builder: claude ★
phase: 5
---

## What

Lex (2026-10-09): Make component names the component automatically (slice 22), so the name is changed afterwards, in Edit component mode's slim bar (slice 41: "Editing `<section-work>` · …").

- Double-click the component's tag in the bar: a caret goes into its text, edited in place like any text, never an input-field look (as the slot chips, slice 24). It is normalised as typed (`normaliseField`, `component-names.ts`, slice 21), with the `section-`/`card-`/`block-` prefix for what the template's root is when the name has no hyphen (decided at handoff, 9). Enter or leaving it commits; Esc cancels. A taken or reserved name (`tagNameProblem`) is refused with the reason under the bar and the old name comes back; the same name is no change.
- Committing renames the component everywhere as **one undo step**, all or nothing on undo and redo (slice 72):
  - the folder and its files: `components/<old>/<old>.html` and `.css` → `components/<new>/<new>.html` and `.css` (other files in the folder move with it);
  - the old tag in the component's own CSS;
  - every page's instances (`<old …>…</old>` → `<new …>…</new>`, attributes and content kept), pages not open rewritten as drafts as slice 45 does, and any other template that uses it (a card component as an items slot's fallback);
  - the loader: nothing (no registry; `components/components.js` finds components by tag).
- Site stylesheets that name the old tag are left alone; a note in the bar lists them ("styles.css names `<section-work>` in 2 rules; they no longer reach it").
- The mode stays open on the renamed component: the code pane follows the template to its new path, Used on is unchanged.
- A pure plan over the sources (old tag, new tag → file moves and edits), applied through one `applyNativeOperation` like slice 45 (one transaction per user action, `CODING_STANDARDS.md`).

## Done when

- Unit tests for the plan: folder and files moved; the tag in the component's CSS; instances on two pages, one with attributes and one with two instances; a page not open; another template using it as a fallback; text that merely contains the old name left alone; a taken and a reserved name refused; the same name no change; the prefix for a name typed without a hyphen.
- Nightly spec: with two pages using the component, in Edit component mode double-click the tag, type "showcase", Enter: the tag reads `<section-showcase>`, the files are at the new path and gone from the old, both pages' instances renamed and still rendered, the mode still open; one undo restores everything and redo applies it again; Esc cancels; a taken name is refused.

**Decided (Lex, 2026-10-09):** exact tag selectors that name the old tag in the site's own stylesheets are renamed too, in the same undo step; the bar notes which files changed. (This replaces the earlier "leave them and list them".)

## Done (2026-10-10)

- Double-click (or F2) on the tag in Edit component mode's bar puts a caret in its name (no field look): made valid as typed (`normaliseField`), a muted `section-`/`card-`/`block-` prefix shown before a name with no dash (`templateNameSource`); Enter or leaving commits, Esc cancels, a taken or reserved name is refused with the reason under the tag and the old name comes back. `componentRenamePlan` (`component-rename.ts`, pure, lazy) moves the folder and its files, renames the instances on every page and in other templates (`renameInstances`) and exact tag selectors in the component's CSS and the site's stylesheets (`renameTagSelectors`, Lex's decision); one `applyNativeOperation` (moves + edits, every file read proven) is one undo step. The mode follows the template to its new path and back on Undo/Redo (`followRename`); the bar's note names the stylesheets changed. Main bundle +0.7 KB gzip (dev was already over the budget, slice 97).
- Commit "Rename the component in place from Edit component mode's bar (slice 76)".
- Tests: `tests/component-rename.test.ts` (14: moves, own CSS, two pages incl. attributes and two instances, page not open, fallback in another template, text left alone, stylesheets, nesting, taken, reserved, folder there, same name, prefixes, flat component, messages); nightly `native-rename-component-actual.spec.ts` (@actual: Esc, taken, typed with prefix, files moved, both pages, stylesheet note, Undo and Redo with the mode on, About rendered).
