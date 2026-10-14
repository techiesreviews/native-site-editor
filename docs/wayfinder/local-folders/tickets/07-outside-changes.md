---
title: Decide how changes made outside the editor show up
type: grilling (HITL)
status: open
assignee: Codex
blocked_by: [01-research-browser-support, 02-research-skip-and-limits]
---

## Question

An agent or code editor writing into the same folder is the main use case. How quickly must the editor notice; what does the user see when a file without drafts reloads (silently, a short note, the preview flashing); how are the already-decided outside-change notes placed and grouped; what happens when very many files change at once (a `git checkout` of another branch, a build tool); and do changes keep being picked up while the tab is hidden?

## Context from Decide how saving to a folder works (2026-10-14)

[Decide how saving to a folder works](06-saving-to-a-folder.md#resolution-2026-10-14) settles which version wins: follow the changed folder file or deletion and remove the affected draft automatically, with a short Updated outside the editor note and View previous draft until the project closes. Cancel an affected unfinished linked operation, keep unrelated drafts, and stop a save that detects an outside change. This ticket remains open for timing, presentation/grouping, large batches and hidden-tab behavior; it no longer needs to design conflict choices.
