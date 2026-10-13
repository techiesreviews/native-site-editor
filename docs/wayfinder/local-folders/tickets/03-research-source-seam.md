---
title: Research the source seam in the editor
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Where exactly does a "source" interface go, so that GitHub and a local folder sit behind it and GitHub behaviour stays unchanged? Starting from the charting facts in the map, list every call site in `src/` and `shared/` that reads, lists, writes or checks the head through the Worker (`api`, `postApi`, `readFile(s)`, `readBlob`, `findEntry`, `/api/publish`, `/api/head`, uploads, Download site, media and file-operation ports, the guarded-edit commit reads), and propose the interface (read text, read bytes, list, stat, write a batch with expected bases, check for changes, watch) plus a capability list for GitHub-only features. Propose how the draft scope (`[account, repoId, branch, path]`) becomes a project scope without losing existing drafts, how a folder's snapshot and "commit" identity are formed so `RepositoryIndex`, conflicts, `pruneUnchanged` and boot memory keep working, how several tabs on one folder are coordinated (Web Locks to elect the tab that applies agent changes and polls the disk, BroadcastChannel for the rest), and how a fake folder source runs in the existing Playwright suites (a browser-side stub of `FileSystemDirectoryHandle` over a fixture) and in unit tests. Note what saving several files cannot guarantee on disk (no atomic multi-file write) and the options. Read `CODING_STANDARDS.md` (controllers, ports, proofs) and keep the proposal within it; estimate the byte-budget cost.
