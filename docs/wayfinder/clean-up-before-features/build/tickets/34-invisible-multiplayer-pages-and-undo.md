---
title: "Invisible multiplayer, part 2: agent page and file commands, and Undo on the page where work landed"
type: task (AFK)
status: closed
assignee: lead-34
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

## Done (2026-10-24)

An agent's page and file command (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file) that arrived on a site or branch no longer shown runs there after all and lands there as unsaved changes; nothing shows or lands on what is shown, nothing is said, and the repository menu counts it on the workspace it landed in (slice 24). A change written away from its page (these commands, a guarded edit finishing on another page of the site shown, a pinned Media change written elsewhere) gets its Undo step on its own page: opening that page offers it as the newest Undo, never the page shown.

Two modules carry it:

- **Background site** (`src/background-site.ts`, `backgroundSite`): the workspace a command held as it arrived (its pin, now kept for every edit in `siteCommandPins`, `src/agent-tools.ts`, set in `agent-tools-edit.ts`), as the editor's own controllers see it: an `EditorWorkspace` with the pin's scope, site, files and texts and nothing mounted, opened or selected, and the Pages, Files and component ports with their reads pinned and their screen work none. `finishAgentTextElsewhere` (`src/agent-site.ts`) runs a page or file command there through `agentStructuralActions` (new `home`: the page a step belongs to when it names none) and the shared `applyStructural` (the on-show path in `src/main.ts` uses it too). Every step finishes away. Its workspace shown again before the step is kept, even briefly (the workspace session counts each workspace's loads, `visits` in `src/workspace-session.ts`, the background workspace's `generation`), stops the attempt with nothing kept: shown by then, the editor runs it on show; left again, it runs in the background site again, as often as it is switched under, and lands once (`finishStructuralElsewhere`). A receipt is kept only with its step, so a stopped attempt leaves none to count as a duplicate. An agent's context built away carries its site's pages and outlines from the pin (`agent-site-host.ts`), so the command is prepared against that site. Make component and Add section plan the component loader with the new `siteLoaderPlan` (`src/page-builder/component-loader.ts`), shared with `main.ts`'s `nativeComponentLoaderPlan`.
- **Parked steps** (`src/guarded-edit/parked.ts`, `createParkedSteps`, `parkedTransitions`, `parkedStep`): a step written away keeps the drafts each side of it (only the files it wrote), parked by site, branch and page (at most 50); the page's history takes it when that page opens in its workspace (`openCodeEditor` in `main.ts`), or at once when it is open there as it lands. Its Undo is planned when it runs, over the editor then: refused when any draft it wrote changed since, else one draft receipt writes the other side back (a mounted model follows), and a page Undo took away opens where it came from. A step that deleted the page it belongs to waits on the home page. Sources: `commit.ts`'s away path (`EditorWorkspace.park`), and `media-batch.ts` (a batch written elsewhere or on another page; a batch that adds files parks none, its Redo would need their bytes again). Sign-out clears them; a reload forgets them.

The confirm-dialog wrapper for agent file commands (`withAgentAnswers` in `main.ts`, `withAnswers` in `agent-site-host.ts`, `agentAnswers` in `agent-site.ts`) was unreachable since the commands' own controllers answer their questions, and is gone with its "The editor changed branch or revision" refusal.

No "open it again" refusal is left for these commands: `grep -rn "again and repeat" src` finds none, and `grep -rln "open it again" src` finds only the Media refusals of work holding no pin (`media-actions.ts`, `media-controller.ts`, `media-batch.ts`, `media-draft-transaction.ts`; slice 27's, outside these commands). The refusals left in `finishAgentTextElsewhere`: a command that needs the page on screen (open_page, inspect_preview), "this needs its page on screen"; and a page or file command that held no workspace as it arrived (nothing open), "this change was not tied to the one it was read on". On show, a command whose branch was saved at another commit since it was read says so (`AGENT_REVISION_MOVED` in `main.ts`); a switch during an on-show run still falls back to its background site (`editorOrElsewhere`).

Tests:

- `tests/native-save/native-invisible-multiplayer-pages.spec.ts` (9 cells): each command held at the edit tools' chunk, the branch (or site) switched, then let go: set_page_details across a branch and a site switch, create_page, add_section, remove_section, move_section, make_component, move_file, delete_file. Each lands on main's drafts only, the menu counts 1, nothing is said, the page shown offers no Undo; opening main's page (the moved page at its new place, the created page) offers Undo and Undo takes it back (the created page's Undo opens the page it was made on).
- `tests/parked-steps.test.ts` (8; review round 1 added unsaved typing on its page refusing the Undo and keeping the text, and a step that deleted its own page parked on the home page): a step landing away is parked for its page, none on the page shown; adopted when its page opens (another page adopts nothing), Undo and Redo move the drafts and the open model; a draft changed since refuses; only the files it wrote prove its Undo; a page created away is parked on itself, its Undo removes it; the registry's open-now, branch and limit rows.
- `tests/background-site.test.ts` (5): reads and nothing mounted; a step lands as drafts with its Undo parked; a page moved lands at its new place read from the branch; its workspace shown again, or shown and left again, at any wait (`forEachAwait`) writes nothing.
- `tests/agent-text-commit.test.ts`: a page command for a branch not shown lands through its background site with its receipt and parked Undo; its branch shown again at any wait keeps nothing and is left to the editor (undefined, no receipt); shown and left again at any wait, it runs again and lands once (both `forEachAwait`, through `finishAgentTextElsewhere`).
- `tests/native-save/native-invisible-multiplayer.spec.ts`: the agent's `place_media` cells (branch and site) now open main's page afterwards, where Undo is offered and takes the picture back.
- `tests/media-batch.test.ts`: a batch on another page and one written elsewhere park for the page they were asked on. `tests/agent-text-commit.test.ts`, `tests/agent-site-host.test.ts`: updated for the removed wrapper and the new refusal.

Files beyond the ticket's list, needed by the method: `src/background-site.ts`, `src/guarded-edit/parked.ts`, `src/guarded-edit/commit.ts`, `src/guarded-edit.ts`, `src/editor-workspace.ts`, `src/agent-site-host.ts`, `src/agent-tools.ts`, `src/agent-tools-edit.ts`, `src/media-batch.ts`, `src/page-builder/media-draft-transaction.ts`, `src/page-builder/component-loader.ts`, `src/workspace-session.ts` (`visits`), `CONTEXT.md`, `docs/agents/code-map.md`. `src/draft-store.ts` needed no change: parked steps enter the page's journal as host steps (`recordHistoryAction`). `main.ts` 3895 → 3867 lines (ceiling 3900 holds).

Commits: dc0dbdc8 (the slice), and review round 1 (this round).

Checks (slice): `kit unit --affected` `RESULT: ok unit 2525/2525 (156 files)`, and the two new unit files (`tests/parked-steps.test.ts`, `tests/background-site.test.ts`) 10/10; `kit specs --affected` `RESULT: ok specs 126/126 passed`; `kit specs` on the new spec with `native-invisible-multiplayer.spec.ts`, `native-switch-mid-work.spec.ts` and `native-agent-edits.spec.ts` `RESULT: ok specs 4/4 passed` (26 cells); `npm run check` and `npm run lint` clean; `kit size` `RESULT: ok size boot 350 KB (+1 KB) vs dev@0a70d7e, budget 355 KB`.

Checks (review round 1): `kit unit --affected` `RESULT: ok unit 2704/2704 (166 files)`; `kit specs` on the touched specs with `native-switch-mid-work`, `native-agent-edits` and `native-agent-live` `RESULT: ok specs 5/5 passed` (29 cells); `npm run check` and `npm run lint` clean.
