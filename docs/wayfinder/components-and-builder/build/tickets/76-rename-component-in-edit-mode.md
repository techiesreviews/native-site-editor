---
title: Rename the component from Edit component mode's bar
type: task (AFK)
status: open
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
