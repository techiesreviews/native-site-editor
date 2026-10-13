---
title: Decide how saving to a folder works
type: grilling (HITL)
status: open
assignee:
blocked_by: [03-research-source-seam]
---

## Question

Save writes the chosen drafts into the folder and never commits (settled). What does the button say and what does the user see while and after saving; what happens when a file changed on disk since it was read (the same conflict review as GitHub, or something simpler); what happens when one file of several cannot be written (disk full, permission withdrawn, file locked), since disk writes are not all-or-nothing; how renames, moves, deletions, `_redirects` updates and uploaded media are written; and where the git-clone note appears.

## Comments

### Question from research 03 (2026-10-13)

If a save to a folder stops part way (disk full, permission withdrawn), should the editor keep the files already written and leave the rest as drafts (recommended by the research), or try to undo them? Undoing can fail for the same reason, and could overwrite another program's change.
