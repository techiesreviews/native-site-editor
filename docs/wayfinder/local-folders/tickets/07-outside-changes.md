---
title: Decide how changes made outside the editor show up
type: grilling (HITL)
status: closed
assignee: Codex
blocked_by: [01-research-browser-support, 02-research-skip-and-limits]
---

## Question

An agent or code editor writing into the same folder is the main use case. How quickly must the editor notice; what does the user see when a file without drafts reloads (silently, a short note, the preview flashing); how are the already-decided outside-change notes placed and grouped; what happens when very many files change at once (a `git checkout` of another branch, a build tool); and do changes keep being picked up while the tab is hidden?

## Context from Decide how saving to a folder works (2026-10-14)

[Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14) settles which version wins: follow the changed folder file or deletion and remove the affected draft automatically, with a short Updated outside the editor note and View previous draft until the project closes. Cancel an affected unfinished linked operation, keep unrelated drafts, and stop a save that detects an outside change. This ticket remains open for timing, presentation/grouping, large batches and hidden-tab behavior; it no longer needs to design conflict choices.

This is historical context. The resolution below supersedes its previous-draft recovery requirement and closes the remaining questions; the saving decision remains unchanged as the record of the earlier decision.

## Comments

### Round 1 (2026-10-14, Lex)

- Changes appear automatically and quickly: usually within a second, with checks every few seconds where browser support is weaker. These are responsiveness targets, not guaranteed deadlines.
- Gather changes briefly, update together and show one grouped note rather than repeatedly reloading the preview or showing a note for each file.
- Catch up when the user returns to the tab rather than doing continuous background work. Check immediately on return and before saving.

Notice placement, previous-draft access and remaining edge cases are still being discussed; the ticket remains open.

### Round 2 (2026-10-14, Lex)

- The short Updated outside the editor note disappears after a few seconds and can also be dismissed manually.
- Do not add an Outside changes button or an update log. Update the page directly. The inline mockup's button and log are rejected.
- If the page being viewed is deleted outside the editor, show This page was deleted outside the editor and offer Choose another page rather than navigating automatically.

Access to a previous draft after the note disappears remains to be settled; its read-only lifetime until the project closes still follows the saving decision.

### Round 3 (2026-10-14, Lex)

- Remove previous-draft recovery. This supersedes the recovery-copy requirement from Decide how saving to a folder works; no Previous drafts section or View previous draft action is wanted.
- On return, show Updating from folder… when catch-up takes time and pause editing and saving until caught up.
- Lex asks whether Google Docs-style collaboration/multiplayer is possible. Its participants and scope are being clarified before this ticket is resolved; do not equate automatic folder updates with shared editing.

## Resolution (2026-10-14)

Lex confirmed closing this ticket. The following decisions supersede the earlier recovery requirements in this ticket and [Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14). Earlier comments remain the conversation record. These are planning decisions; no editor implementation is included.

### Quick automatic updates, gathered briefly

- While a project tab is visible, pick up outside changes automatically and quickly: usually within a second with `FileSystemObserver`, with fallback checks every few seconds where it is unavailable. These are responsiveness targets, not guaranteed deadlines for every folder or batch.
- Gather nearby changes for a brief, bounded interval, then apply one incremental refresh and one grouped note for that batch. Continuous writes must not keep the editor waiting indefinitely for a quiet folder. Process further changes in subsequent bounded batches; do not promise a whole-folder atomic snapshot or a transaction across other programs' writes.
- Keep unrelated drafts and their Undo, the open page and file, and the user's position where those still exist. Refresh affected content in place, without flashing the preview, forcing a panel open or taking keyboard focus. The editor's own successful writes are excluded from outside changes. MCP agents still propose drafts through the existing review and Save workflow; direct disk writes follow this outside-change rule.
- Honor the ignore, secret-file and size limits from [Research what to skip and how big a folder can be](02-research-skip-and-limits.md#resolution-2026-10-13). Metadata alone can miss rapid rewrites of the same size; correctness checks must use content identity appropriate to those limits, rather than treating unchanged size and timestamps as proof that content is unchanged.

### One short note below the toolbar

- Show a short note below the toolbar: **Updated outside the editor**. For one file, identify its path. For a batch, show a file count and the affected current file, removed drafts or linked operation's relevant paths and counts as needed. Keep the note brief; counts describe files, not observer events. Present cancellation and successful earlier writes through the outcomes already settled by [Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14).
- The note disappears after a few seconds or can be dismissed manually. Do not add a Details control, Outside changes button, persistent activity log, previous-updates history or new panel.

### The folder wins, without recovery

- Follow the changed folder version or outside deletion and remove the affected draft automatically, including a pending deletion or a new-file draft whose path now exists on disk. Do not keep previous-draft copies, offer **View previous draft**, or add any recovery action or comparison. Ordinary Undo cannot revive removed affected drafts or cancelled linked operations; unrelated drafts and their Undo remain.
- If an outside change touches an unfinished linked operation, cancel the whole unfinished operation and its linked drafts. For a move, use **Move cancelled because files changed outside the editor**. Keep unrelated drafts. Files already written stay on disk; report the cancellation and those earlier writes without promising rollback.
- Save stops when it detects an outside change, adopts the folder state and applies the cancellation/removal rule. Unrelated drafts wait for the next Save; successful earlier writes remain saved. This changes the recovery requirement from Decide how saving to a folder works, not its expected-version checks, partial-save rules or write ordering.
- If the currently viewed page is deleted, show **This page was deleted outside the editor** with **Choose another page**. Stay in that state until the user chooses; do not navigate automatically or recreate the page.

### Hidden tabs catch up before work resumes

- Pause background folder checking when all tabs for that project are hidden. A visible leader may keep visible followers updated through the existing planned tab coordination; a hidden leader must not prevent visible tabs from receiving updates.
- Check immediately when a tab returns and before Save. If catch-up takes time, show **Updating from folder…** and pause editing and saving until the editor is caught up. Returning to a stale view must not permit a save before catch-up succeeds.
- If catch-up fails because access is refused, the folder is missing or another read problem occurs, keep Save unavailable and reuse the existing opening/reopening problem notices and actions from [Decide how a folder is opened and reopened](05-opening-and-reopening.md#resolution-2026-10-13). Do not add another conflict-choice or recovery interface, or falsely mark an unsuccessful catch-up complete.

### Separate future work

Multiplayer is separate future work, outside this local-folder map. Lex's direction is eventual shared editing for people with live cursors, MCP agents and direct coding tools, through a shared edit layer above the source. Its protocol, tool participation and behavior are not specified or built here. Until that work is decided and implemented, writes made directly to disk remain outside changes and the folder wins as above; automatic folder updates do not provide shared editing.
