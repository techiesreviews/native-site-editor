---
title: Decide what Lex sees when files change outside the editor
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [04-research-always-the-latest, 08-grill-shared-editing-mechanism]
---

## Question

Today an outside change replaces the draft in a local folder and raises a conflict on GitHub (CONTEXT.md, Outside change). With live updates: what does Lex see when a coding tool or a person changes a page he has open, or a page he has unsaved changes on; when does it fold in by itself and when does he choose; and how is that shown in place (no toasts)?

## Comments

- 2026-10-24, round 1 with Lex:
  - **Open page, no unsaved changes:** it updates in place with a brief outline and an author chip: "k".
  - **Open page with unsaved changes:** "If it changes elsewhere, it should merge or show the latest version." This is about changes outside the editor. What happens on a true clash is asked in round 2.
  - **Local folders get the same merge** instead of "the folder wins": "yes if that is possible". It is: drafts keep their starting text and the folder watcher gives the new text, so the browser can do the three-way merge.
  - **Unpushed local clones:** out of scope.
  - **GitHub App webhook:** Lex switches it on himself from a checklist at build time, after the builder tests on a test App.
- 2026-10-24, round 2: a true clash shows the latest version, and Lex's clashing words stay one Undo away: "yes".

## Resolution (2026-10-24)

Decided with Lex, for changes made outside the editor (GitHub commits, folder writes, coding tools):

1. **Open page, no unsaved changes:** it updates in place within seconds (GitHub push webhook through the relay; folder watcher in Chromium). A brief outline with a chip names who changed it (the commit's author, or "Folder"), then fades. No message.
2. **Open page with unsaved changes:** a three-way merge against the text each draft started from.
   - Different lines merge by themselves.
   - A true clash (the same words changed on both sides) shows the latest version, and Lex's clashing words stay one Undo away, with no question and no message.
3. **Local folders get the same merge.** This replaces "the folder wins" from [the local-folders map](../../local-folders/tickets/07-outside-changes.md); that map is unbuilt.
4. **Unpushed local clones:** out of scope.
5. **GitHub App webhook:** Lex switches it on from a checklist at build time, after the builder tests on a test App. New self-hosters get it at setup.
