---
title: "Invisible multiplayer, part 2: agent page and file commands, and Undo on the page where work landed"
type: task (AFK)
status: open
assignee: lead-34 (this session)
builder: claude
blocked_by: [27-invisible-multiplayer, 31-native-site-runtime]
---

## Goal

Split from [Invisible multiplayer](27-invisible-multiplayer.md) by Lex on 2026-10-23 (answers IM1 and IM2, "as recommended"). Slice 27 made Media work finish in a background page. Still open:

1. **Agent page and file commands across a switch of site or branch** (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file): they run the Pages, Files and component controllers over the open site's live state; with the site runtime of slice 31 behind one object, they can run against the background page's own site instead and finish there.
2. **Undo on its own page:** a change written away (a pinned Media change, a batch written elsewhere, and the commands of item 1) gets an Undo step on its own page; opening that page later offers it as the newest Undo. Never on the page shown.

## Decided behaviour

Same as slice 27 (Lex: nothing stops when he navigates away; "invisible multiplayer"; no toasts, the site-menu count shows where work landed). Build so the later real multiplayer feature can reuse the background page and per-page Undo.

## Files

Confirm while designing: `src/background-page.ts`, `src/agent-site.ts`, the Pages, Files and component controllers' ports (`src/controllers/pages-controller.ts`, `src/controllers/file-operations*.ts`, component controller), the site runtime from slice 31, `src/draft-store.ts` (Undo per page), `src/main.ts` (wiring only; ceiling per the README), tests and a browser spec `tests/native-save/native-invisible-multiplayer-pages.spec.ts`.

## Done when

- A browser spec per command family (a page command, a section move, a file move or delete) started, then a switch of site or branch, then the result landing as unsaved changes on its own site and page, nothing on what is shown, the site-menu count set.
- Opening that page offers Undo for the change; Undo restores it; nothing on the page shown changed.
- No "open it again" refusal left for these commands (`grep` in Done).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Claude builds and reviews; one Grok second opinion on the final version. Counts as one of the two `src/main.ts` slots.
