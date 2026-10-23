---
title: "Work finishes where it started"
type: task (AFK)
status: open
assignee: lead-23
builder: claude
blocked_by: [22-workspace-session-callers]
---

## Goal

Rides with candidate #1. Today a switch of site or branch while something is still working stops that work with "The site changed meanwhile" (or a variant). Lex wants it to carry on and land where it started, never on the site now shown.

## Decided behaviour

[Ticket 05, item 2](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22), round 2 comment: switching **site, branch or page** mid-work, the work carries on and finishes where it started:

- a save lands on its own site and branch;
- uploads and media adds (and Replace everywhere, Optimise) finish into that site's Media;
- an agent keeps working, and its changes wait on that site as unsaved changes;
- an edit started on one page lands on that page (as an unsaved change of that page) when another page is shown.

Nothing ever lands on the site, branch or page now shown. The notification icon is slice 24.

Lead decision (check with Lex if the list is not empty): anything that cannot finish elsewhere (for example a drop whose place depends on the page as it is shown) still refuses with today's message; the builder lists each such case, with its reason, in the Done section.

## Shape

Work holds a session stamp (slices 20–22). When the stamp no longer `holds()` but its scope is still a known workspace, the result is written through that scope: commits through its repository and branch, drafts through its draft key (the draft store already keys by scope), media through its media key. Writes to the open editor models happen only when the stamp's page is the one shown; otherwise the result goes to drafts.

## Files

- `src/workspace-session.ts` (an "elsewhere" outcome, if needed), `src/guarded-edit.ts`, `src/guarded-edit/commit.ts`, `src/draft-store.ts`
- `src/controllers/save-publish-controller.ts`, `src/media-batch.ts`, `src/page-builder/media-files-adding*.ts`, `src/page-builder/replace-everywhere.ts`, `src/page-builder/improve-images-run.ts`
- `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`, `src/agent-site.ts` (only the "site changed" outcome)
- `src/main.ts` (save, media and agent wiring only)
- Tests: affected unit files, `tests/guarded-edit.test.ts` (stamp moved on, result lands in its own scope), one spec `tests/native-save/native-switch-mid-work.spec.ts` (save, upload and agent edit each held with `page.route`, switch branch, release: the result is on the first branch, nothing on the second)

## Done when

- Each of the four cases above has a test that holds the work across a switch and checks where it landed.
- No "site changed meanwhile" refusal left for save, upload, media batch or agent work; a `grep` of the remaining refusals matches the Done list.
- CODING_STANDARDS "Async writers" and "Racing and speculative reads": the settle matrix is in the commit message.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 25.

- `kit doctor`; `kit bg slice-23 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/23-work-finishes-where-it-started.md --builder claude-opus-5-5`; `kit wait job slice-23 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-switch-mid-work.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: the refusals left (list), unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Comments

- 2026-10-22, Lex (check of the lead decision above): **he wants to be able to navigate away in every case; nothing should stop.** This replaces the "still refuses" lead decision. Proposed method, put to Lex in the next round: first make each such action work on the files directly instead of on the page as shown; for the few that truly need the page drawn (a drop place, a measurement), finish them in an invisible copy of that page kept in the background until done. List each such case and the method used in the Done section.
- 2026-10-22, Lex agreed to the method: **Lex never needs to be on the page.** Work first finishes on the files directly; actions that truly need the page drawn run in an invisible background copy of that page, which closes when done. Nothing stops when he navigates away. The builder lists each case and its method in the Done section.

## Done (2026-10-23)

Work started on one site, branch or page now finishes there when Lex switches meanwhile. One idea carries it: work holds a **pin** of the workspace it began on (`mediaPorts.pin` in `src/main.ts`, `MediaPin` in `src/controllers/media-controller.ts`): while that workspace is shown, its reads are the editor's; once another is shown, they are the pin's snapshot, the branch texts read so far and that workspace's drafts, and the result is written as unsaved drafts there, with no Undo step on the page shown and nothing opened or selected.

The four cases, each with its method and test:

- **A save** lands on its own site and branch (it always posted there; `reconcilePublished` already saved its drafts by their scope). `published` now runs the scope's own follow-up whatever is shown (uploads' bytes swept, base sources adopted only when its scope is shown); the head and the snapshot after it follow only while the editor is still on what it began on. Tests: `tests/save-publish-controller.test.ts` (each move: the save's scope gets `saved`, no snapshot is read, no head taken); spec case 1.
- **Uploads and media adds**, files directly: a Files drop or Upload files… pins its workspace at the drop; the adding queue no longer drops an addition on a switch (`media-files-adding-runs.ts`) and a later drop in another repository waits its turn. Media batches holding a pin (`src/media-batch.ts`) run each attempt whole on one side: on show through the editor (Undo on the page open as the step commits; another page opened meanwhile takes it), elsewhere as drafts through the pin's reads, with no editor model mounted and no Undo step; a switch during an attempt rolls it back and runs it again on the other side (three attempts). In the Media pane, files added to the library, **Replace everywhere** and an **Improve images (Optimise)** row in progress finish in the workspace they began on (a context's `again`, `media-workspace.ts`); the pane closing on a switch no longer aborts its row (`media-library-view.ts`), and a row measures its pictures only while its workspace is shown, else it keeps the safe sizes (`improve-images-run.ts`). The toast of a Files drop that finished elsewhere says where ("On main: Added …"). Tests: `tests/media-files-adding-runs*.test.ts`, `tests/media-batch.test.ts`, `tests/media-workspace.test.ts`, `tests/improve-images-run.test.ts`; spec case 2.
- **An agent** keeps working: the live connection no longer cancels an edit tool call under way when another workspace opens (`agent-transport.ts`; its reply has no socket, its receipt stays for `get_command_status`); the edit holds its workspace from arrival (`agent-menu.ts` → `agent-tools-edit.ts` `held`, `agent-site-host.ts` `pin`), is prepared from those files and that context, and a text write (edit_file, write_file) for a site or branch no longer shown is written there on its files directly (`finishAgentTextElsewhere`, `src/agent-site.ts`): its text there must still hash to what the agent read, the draft goes through the agent records with its receipt and is settled into the draft store. Tests: `tests/agent-transport.test.ts`, `tests/agent-tools-edit.test.ts`, `tests/agent-text-commit.test.ts`; spec case 3.
- **An edit started on one page lands on that page** when another page is shown: guarded edits take `finish` (`src/guarded-edit.ts`); another page shown (or Edit component mode entered or left) is no reason to stop, the reads are proved by their bytes, and the commit's drafts-only shape (`elsewhere`, `src/guarded-edit/commit.ts`) writes the step's drafts there with no Undo step, opening and selecting nothing. Agent page commands use it (`agentStructuralActions`). Another workspace or a reload still stops such a step. Tests: `tests/guarded-edit.test.ts` (`finish:` cases), `tests/agent-structural-commit.test.ts`.

Spec: `tests/native-save/native-switch-mid-work.spec.ts` holds a save (`/api/publish`), a Files upload (the Media actions chunk) and an agent edit (the edit tools' chunk) with `page.route`, switches main to feature, and releases: each result is on main (a commit, an upload draft with its records, an agent draft of robots.txt), nothing on feature. Two more cells: the save answered 500 after the switch keeps main's draft unsaved and writes nothing on feature; the upload still held after the switch is cancelled from its row and adds nothing anywhere. `tests/native-save/server.ts`'s `/__demo/file` takes `&branch=` for it.

Settle matrix (each racing input against a switch of site or branch):

| Work | resolves after the switch | rejects | never settles |
|---|---|---|---|
| Save (`/api/publish`) | commit on its branch, its drafts there saved, uploads swept; nothing on the one shown | publish menu gone: drafts kept as they were | menu gone; drafts kept |
| Files upload (context, settings, preparation, save) | files and records drafted on the drop's branch, no Undo step; toast names the branch | its file fails with the reason (Retry), or the addition goes with its context's reason | its row stays preparing, with Cancel |
| Pinned media batch attempt | lands on show or elsewhere; a switch mid-attempt rolls back and runs again on the other side | its reason, as before | the step waits; nothing written |
| Agent edit (tools chunk, context, commit) | drafted on its branch with its receipt; reply dropped, `get_command_status` says applied | conflict or unknown, as before | the relay's deadline cancels it before commit |
| Guarded edit with `finish` (another page) | drafts on its page, no Undo step | stale or refused, as before | nothing written |

The Files upload row is also the pinned media batch row's browser case (the upload goes through it elsewhere); the guarded `finish` row has unit cases only (no request inside a guarded run can be held with `page.route`). No timer is added; the transport's existing deadline timer still bounds a call that finishes after a switch and is cleared in its dispose.

Still refusing across a switch of site or branch (the remaining refusals, with their reason and method):

1. Agent page and file commands (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file) read from a site or branch no longer shown: "The editor shows another site or branch now; open <branch> again and repeat this change." They run the editor's own page and file actions on the site as loaded. Method: the invisible background copy (a files-only editor workspace of the pin behind the same controllers). Across a page switch on the same site they finish (`finish`).
2. Agent media commands (`agent-tools-media.ts`, `listMedia`/`media` in `main.ts`): "The editor changed branch or revision…". Method: the same pinned media context as uploads; placing on a page needs the page drawn (background copy).
3. Media pane work not under way at the switch: files still being prepared in the Media pane (and the Optimise sheet's preparation), and Improve images rows not yet started, stop with the pane. Method: the pane's queue outliving its screen, as the Files queue does.
4. Media work without a pin: placing a picture on a page (picker Use, image popup, place/trim/frame) and Media pane edits started on a stale screen keep "The repository changed. Close Media and open it again." A placement selects the placed element on the page shown, so it needs the background copy.
5. A pinned media batch whose workspace switches back and forth during each of three attempts: "The repository changed. Close Media and open it again."
6. Guarded edits (with or without `finish`) across a switch of site or branch or a reload: stale, as before; only agent page commands would use it (item 1).

Review round 1 (behaviour and tests):

- A media batch whose page changed after it was asked for (`opened`, taken as `applyBatch` is called) lands with no Undo step, pinned or not, instead of putting its Undo on the page now shown; a page opened during an attempt runs it again that way. A pinned batch's first attempt holds the caller's stamp (a reload before it refuses); a new stamp only after its workspace was seen to move away and back. Tests: `tests/media-batch.test.ts` (page opened before and during an attempt, the caller's stamp, a `forEachAwait` switch at each staging wait).
- Library additions, Replace everywhere and an Improve images screen take their pin synchronously as they begin (`createMediaWorkspace`'s `pinned`, from `main.ts`), so a switch while their context is still being made lands too; contexts lost `again`. Tests: `tests/media-workspace.test.ts`.
- Only an Improve images row in progress outlives the Media pane (`sheet.finishes`); other pane work is cancelled with it again.
- The agent connection cancels an edit kept from a workspace move when agents are then turned off (`agent-transport.ts` `halt`). Test: `tests/agent-transport.test.ts`.
- An agent's text write elsewhere asks after every wait whether its branch is shown again (`shown()`, also in its commit guard); then it is left to the editor, which writes it through the open file's model (`applyAgentSiteCommand` takes its stamp after that check). Tests: `tests/agent-text-commit.test.ts` (`forEachAwait`), `tests/agent-site-host.test.ts` (the pinned context, `forEachAwait`).
- A Files drop that finished elsewhere names the repository when it is another ("On lex/site (main): …"), and its Review… says "Open main to review these pictures." instead of nothing.

Round 1 checks: `kit unit --affected` `RESULT: ok unit 2334/2334 (145 files)`; `npm run check` and `npm run lint` green; `kit specs native-switch-mid-work.spec.ts` `RESULT: ok specs 1/1 passed` (5 tests); `kit specs --affected` `RESULT: fail specs 1 of 133 failed: native-mcp.spec.ts` (the Ask agent history test: its Request 2 card did not open under shards), and alone `kit specs native-mcp.spec.ts` `RESULT: ok specs 1/1 passed` (19 tests); `kit size` `RESULT: ok size boot 343 KB (±0 KB) vs dev@3152d0b, budget 355 KB`; `main.ts` 5700 lines (ceiling 5700).

Checks: `kit unit --affected` `RESULT: ok unit 2327/2327 (145 files)`; `npm run check` and `npm run lint` green; `kit specs native-switch-mid-work.spec.ts` `RESULT: ok specs 1/1 passed` (3 tests); `kit specs --affected` `RESULT: ok specs 133/133 passed`; `kit size` `RESULT: ok size boot 343 KB (+1 KB) vs dev@d3531e0, budget 355 KB`. `main.ts`: 5698 lines (ceiling 5700): the pin, the upload and agent wiring, and three small media and save ports joined to one line each.

Files beyond the ticket's list, needed by the method: `src/controllers/media-controller.ts`, `src/controllers/media-actions.ts` (the pin and `again`), `src/page-builder/media-workspace.ts`, `src/page-builder/media-library-view.ts` (Media pane work), `src/agent-transport.ts`, `src/components/agent-menu.ts`, `src/agent-site-host.ts`, `src/agent-tools.ts`, `src/agent-tools-read.ts` (the agent edit's hold), `tests/native-save/server.ts`.

Review round 2 (behaviour and tests):

- Work left and shown again before it lands (Lex opens feature and goes back to main, a new load of main) now lands on show. A pinned media batch's attempt on show takes a new stamp as it starts (a named exception to "Proofs survive awaits" in `src/media-batch.ts`: the batch's paths, sources and assets' versions are proved after every wait and before commit, so a reload that changed them still refuses); an agent edit accepts a new load of the branch it arrived on while its revision holds (`agent-menu.ts`), and its pinned context is read again when the branch was left and shown again while it was made (`agent-site-host.ts`). `applyAgentSiteCommand` takes its revision and stamp before its first wait again; a new load of the branch since takes a new stamp, the revision must still hold.
- Tests: `tests/media-batch.test.ts` (away and back before the first attempt: lands on show pinned, refuses without a pin), `tests/agent-tools-edit.test.ts` (away and back before it runs: applied). Spec: a drop held while feature and then main are opened lands on main; the cancel cell now waits for a second drop, added once the cancelled addition has finished.
- Checks: `kit unit --affected` `RESULT: ok unit 2335/2335 (145 files)`; `npm run check` and `npm run lint` green; `kit specs native-switch-mid-work.spec.ts` `RESULT: ok specs 1/1 passed` (6 tests); `kit specs` of the agent and media specs touched (native-agent-edits, native-agent-lifecycle, native-mcp, native-upload, native-media-transaction, native-improve-images, native-media-tab) `RESULT: ok specs 7/7 passed`; `main.ts` 5700 lines.

## Question for Lex (open)

Lex's comment of 2026-10-22: nothing should stop, and actions that need the page drawn run in an invisible background copy. This ticket finishes saves, Files uploads, Media library additions, Replace everywhere, the Improve images row in progress, agent text edits and agent page commands across a page switch. The list "Still refusing across a switch of site or branch" in the Done section is left; items 1, 2 and 4 need the background copy, which is not built here. Ask Lex: build it in this ticket, or close this one with that list and build the background copy as its own ticket. Until he answers, `status: open`.
- 2026-10-23, Lex: split. This slice lands with the cases that already finish where they started; the remaining refusals (agent page and file commands, agent Media commands, picture placement without a pin, a batch switched back and forth) move to [Invisible multiplayer](27-invisible-multiplayer.md), built before release.
