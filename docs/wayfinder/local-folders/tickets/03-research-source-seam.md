---
title: Research the source seam in the editor
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Where exactly does a "source" interface go, so that GitHub and a local folder sit behind it and GitHub behaviour stays unchanged? Starting from the charting facts in the map, list every call site in `src/` and `shared/` that reads, lists, writes or checks the head through the Worker (`api`, `postApi`, `readFile(s)`, `readBlob`, `findEntry`, `/api/publish`, `/api/head`, uploads, Download site, media and file-operation ports, the guarded-edit commit reads), and propose the interface (read text, read bytes, list, stat, write a batch with expected bases, check for changes, watch) plus a capability list for GitHub-only features. Propose how the draft scope (`[account, repoId, branch, path]`) becomes a project scope without losing existing drafts, how a folder's snapshot and "commit" identity are formed so `RepositoryIndex`, conflicts, `pruneUnchanged` and boot memory keep working, how several tabs on one folder are coordinated (Web Locks to elect the tab that applies agent changes and polls the disk, BroadcastChannel for the rest), and how a fake folder source runs in the existing Playwright suites (a browser-side stub of `FileSystemDirectoryHandle` over a fixture) and in unit tests. Note what saving several files cannot guarantee on disk (no atomic multi-file write) and the options. Read `CODING_STANDARDS.md` (controllers, ports, proofs) and keep the proposal within it; estimate the byte-budget cost.

## Resolution (2026-10-13)

Full findings: branch `research/lf-03-source-seam` (commit 214f0e8d), file `docs/wayfinder/local-folders/research/03-source-seam.md`, with about 60 call sites listed by group.

1. **The seam** sits at the reads by git blob SHA (snapshot, directory listing, file texts, file bytes, head check) plus one batch write. Everything above it (drafts, conflicts, `pruneUnchanged`, caches, `RepositoryIndex`, guarded edits, media, Download site) already works by fingerprint and stays. A `SiteSource` interface with two adapters: GitHub (existing code moved, including the publish POST out of `publish-menu.ts`) and folder (new, loaded only when a folder opens).
2. **Capabilities:** seven GitHub-only features (history, branches, deploys, setup, starter, download, session) switched per source.
3. **Drafts:** GitHub draft and upload keys stay exactly as they are, so nothing migrates (rewriting keys would duplicate drafts while old and new tabs run side by side during a deploy). Folder drafts use `folder:<uuid>`, the same id as research 04; every project comparison goes through one `projectKey` check.
4. **Folder identity:** real git blob SHAs per file, git tree hashes per folder; the folder's tree hash of its kept files stands in for a commit, the same in every tab and never mistaken for an empty repository.
5. **Outside changes and tabs:** reuse the incremental after-save path, not Refresh (which resets the preview and open file). A Web Lock elects one leader tab per folder to watch the disk and apply agent changes; a second lock serialises saves; BroadcastChannel keeps the others in step. Leader handover measured at about 26 ms.
6. **Saving several files:** check every file first and write nothing on any conflict; then write new files, changed files, deletions, each replaced whole. If the disk fails part way, written files count as saved and the rest stay drafts (existing per-file reconciliation handles it).
7. **Test fakes:** browser specs use a real Chromium folder handle in OPFS rather than a hand-written stub (which cannot be stored in IndexedDB); measured real write/replace, `FileSystemObserver` reports and injected write failures. Unit tests use a small in-memory directory fake. In Playwright's default private context, reading a stored handle back crashes the context, so reopen specs need a persistent context.
8. **Bytes:** 340 of 355 KB today; about +1–2 KB for a GitHub project's start-up; folder code is a separate chunk of about 10–12 KB.
9. **Slice order:** project scope, GitHub adapter, capabilities (GitHub unchanged throughout), then folder reading, saving, outside changes, agents.
