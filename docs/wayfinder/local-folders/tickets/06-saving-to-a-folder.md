---
title: Decide how saving to a folder works
type: grilling (HITL)
status: closed
assignee: Lex + Codex (grilling)
blocked_by: [03-research-source-seam]
---

## Question

Save writes the chosen drafts into the folder and never commits (settled). What does the button say and what does the user see while and after saving; what happens when a file changed on disk since it was read (the same conflict review as GitHub, or something simpler); what happens when one file of several cannot be written (disk full, permission withdrawn, file locked), since disk writes are not all-or-nothing; how renames, moves, deletions, `_redirects` updates and uploaded media are written; and where the git-clone note appears.

## Comments

### Question from research 03 (2026-10-13)

If a save to a folder stops part way (disk full, permission withdrawn), should the editor keep the files already written and leave the rest as drafts (recommended by the research), or try to undo them? Undoing can fail for the same reason, and could overwrite another program's change.

### Round 1 with Lex (2026-10-14)

Lex accepted the recommendations except the conflict presentation: **show only the folder version**, not a side-by-side comparison.

- **Save:** Save to folder opens the chosen-drafts list, without a commit message; Saving… while writing, Saved to folder afterwards. Unselected drafts remain unsaved. Saved means on disk, not online.
- **Conflict:** stop before writing anything in the selected save. Review shows only the folder's version. The exact actions and deleted-file cases are settled in the next round.
- **Partial failure:** keep successful writes, stop at the first failure, explain the failed file and reason, show the saved and still-unsaved counts. The failed and unattempted files remain drafts; retry only what remains. No attempt to undo disk writes.
- **Git clone:** the save panel says "This folder is a git clone. Commit and push with your own tools." Show until dismissed for that project, then keep it available through a small information button. No repeated after-save notice.
- **Start your site:** Starter site and Blank page both work in an empty folder, create drafts to preview, and reach disk only through Save to folder. Folders get a Setup checklist with Save to folder in place of Save to GitHub. A nonempty folder without a home page remains to be settled.

### Round 2 with Lex (2026-10-14)

- **Outside changes replace drafts:** Lex said to assume another agent is working on the file: show the changed folder file and remove its draft. This supersedes round 1's conflict review and the proposed Use folder version / Replace with my draft / Back to editing choices. No side-by-side view or keep/replace decision. Recovery and interruption of a save are still to be settled.
- **Related changes stay together:** select a move/rename together with its link and `_redirects` changes, and a media addition together with the references the editor adds. Write new files first, references next, deletions last. A partial save reports the operation as unfinished and leaves its remaining writes as drafts; a move may temporarily leave both copies.
- **Nonempty folder without a home page:** offer Start your site, keeping existing files by default and asking before replacing matching names. If the site is in a subfolder, offer to open that first. The first-visit hint should mention starting through either a folder or GitHub.
- **Checklist:** Start your site ticks when its drafts are created; Save to folder ticks only when every file belonging to that starting point has saved. A partial save does not tick Save.

### Round 3 with Lex (2026-10-14)

Lex accepted both recommendations: keep a read-only previous draft until the project closes, and cancel an entire unfinished linked operation when an outside change touches it. Save stops on a detected outside change; unrelated drafts wait for the next Save.

## Resolution (2026-10-14)

### Save means writing to this folder

- The action is **Save to folder**. It opens the list of draft changes to select, with no commit message, commit, or push. GitHub projects keep their existing behavior; **Save to GitHub** remains the glossary term (the current GitHub button still says Publish).
- While writing, show **Saving…** and prevent a second save. After every selected change has saved, show **Saved to folder**. This means written to disk, not published, building, or live. If other drafts were left out, retain their unsaved count and the Save to folder action; do not describe the whole project as saved.
- Refresh the saved files, preview and other tabs from the actual successful writes without resetting the open page. Clear only the submitted changes actually saved; newer edits made while saving remain drafts.

### An outside change wins

Assume another agent or tool is working on the file. When the editor detects a different version on disk, **show that folder version and remove the affected active draft automatically**, including a pending deletion or a new-file draft whose name now exists on disk. If the file was deleted outside the editor, follow the deletion and remove its draft; do not recreate it. There is no conflict panel, side-by-side comparison, or keep/replace choice.

- Show a short **Updated outside the editor** note identifying the affected file, with **View previous draft** when a draft was removed. Keep that recovery copy only until the project closes. It is read-only so the user can copy useful content; it is not a draft to save and does not restore a draft or write to disk. For media or deletion drafts, retain enough information to inspect what was removed rather than pretending there is text to compare.
- If an outside change touches a pending move, rename, deletion with related updates, or media addition, cancel the **whole unfinished linked operation** and its linked draft changes. For a move, say **Move cancelled because files changed outside the editor**. Keep recovery copies of the removed drafts; unrelated drafts remain. If some writes already happened, retain them on disk and explicitly report the unfinished operation and what was written; cancellation does not promise to undo those writes.
- At Save, check every selected file and required destination against the version or absence on which its draft was based before writing any file. If an outside change is detected, adopt it as above and stop this save; unrelated drafts wait for the user's next Save. If detected after writing has begun, stop there and retain successful writes. Check again before subsequent writes and deletions; never knowingly write a stale draft over a detected outside change.
- Ordinary Undo must not silently revive a draft removed by this rule. View previous draft is the recovery path. The editor's own successful writes are not outside changes. An MCP agent proposing drafts still follows the existing draft/review workflow; this rule concerns another tool writing directly to the folder.

This deliberately supersedes the earlier conflict-review proposal in this ticket and the folder-conflict assumptions in [Research the source seam in the editor](03-research-source-seam.md#resolution-2026-10-13) and ADR 0002. Expected-version checks still protect disk changes, but the response is to follow the folder and remove drafts, rather than ask which version wins. Detection timing, large outside batches and hidden tabs remain with [Decide how changes made outside the editor show up](07-outside-changes.md). Browser writes are not an atomic check-and-write against other programs; do not claim to lock another agent or guarantee an all-or-nothing batch.

### Related file changes and a partial save

- Select an operation together with the changes it requires: old/new paths for a rename or move, its generated link and `_redirects` updates, and uploaded media with the references the editor adds. Show the affected files together; do not let a subset leave a deliberately broken operation. A shared file needed by several operations ties their selection together. Independent changes remain separately selectable.
- Write new files, copies and uploaded media bytes first; then changed files and references; then deletions. A move keeps the original until the replacement and references have saved. `_redirects` is an ordinary file change, only included when the user chose to keep old URLs working; saving it does not mean a local host supports redirects. Uploaded media are written from their browser-held bytes into the folder, without a GitHub upload.
- Stop on the first write failure. **Keep files already written**, clear their saved changes, and retain failed/unattempted writes as drafts. Never attempt a rollback of disk writes. Say, for example, **2 files saved · 3 still unsaved**, identify the failed file and reason in plain words, and offer a retry after the problem is fixed. Counts describe files; a linked operation remains unfinished until all its required writes complete.
- An unfinished move can leave both copies on disk. Explain that the original is still there and keep only the remaining work pending; retry must not repeat successful writes or demand the move's old starting state. Recheck what remains against the actual post-save folder. If an outside change is found, apply the outside-change rule instead of retrying over it. A full retry finishes the operation and clears its drafts.

### A git clone stays a folder

In the save panel, show **This folder is a git clone. Commit and push with your own tools.** Show it until dismissed for that project, remembering the dismissal across visits. Afterwards it remains available through a small information button in the save panel. Do not repeat it after every save, show git status, or imply that saving committed or pushed anything. Detecting a clone must not read or share `.git` contents.

### Start your site and the Setup checklist

- **Starter site** and **Blank page** both work without GitHub sign-in in an empty folder or a folder without a home page. Start your site creates drafts to preview; only Save to folder writes them. The Starter site may download the public template; no folder files are uploaded to obtain it. Blank page is created locally.
- A nonempty folder keeps its existing files by default. Show matching names and ask before replacing them with a starting point; creating replacement drafts still does not write to disk. If a site already sits in a subfolder, offer to open that folder first, as decided in [Decide how a folder is opened and reopened](05-opening-and-reopening.md#resolution-2026-10-13). Later outside changes still take precedence over any replacement drafts.
- Give folders the same Setup checklist: **Start your site**, **Save to folder**, **Name your site**, and optional **Connect an agent**. No GitHub connection, first commit, or Put it online item. It appears after a starting point is chosen, can be dismissed, and remains available through Set up your site; an existing site does not get it forced open just because its folder was opened.
- Start your site ticks when its drafts exist. Save to folder ticks only when every required starting-point file has saved; a partial save or cancelled required change must not produce a false completed Save. Name your site and optional Connect an agent keep their existing purpose. The checklist belongs to the folder project, not a signed-in GitHub account.
- Replace the first-visit hint from [Prototype the project overview](12-prototype-project-overview.md#resolution-2026-10-14) with **No site yet? Choose an empty folder or start a new site on GitHub.** This updates that hint only; its layout stays as decided there. Folder starting points and checklist support override the research's tentative GitHub-only starter/setup capabilities; the GitHub Setup wizard remains separate.

The inline conflict-review mockup shown during round 2 was rejected by Lex's final outside-change rule and is not a build reference. This ticket changes planning documents only; no editor implementation, deployment or production change was made.
