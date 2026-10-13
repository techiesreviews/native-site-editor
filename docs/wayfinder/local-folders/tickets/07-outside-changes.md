---
title: Decide how changes made outside the editor show up
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-research-browser-support, 02-research-skip-and-limits]
---

## Question

An agent or code editor writing into the same folder is the main use case. How quickly must the editor notice; what does the user see when a file without drafts reloads (silently, a short note, the preview flashing); what does a conflict look like when a file with drafts changed on disk, and when such a file was deleted; what happens when very many files change at once (a `git checkout` of another branch, a build tool); and do changes keep being picked up while the tab is hidden?
