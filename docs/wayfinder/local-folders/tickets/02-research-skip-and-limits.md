---
title: Research what to skip and how big a folder can be
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Which files should a folder project leave out, and what limits are sensible? Propose a default skip list (`.git/`, `node_modules/`, build caches, OS files such as `.DS_Store`, editor folders) and decide how `.gitignore` is honoured: root only or nested, negation rules, a small parser or a library (size), and what the editor does with a file that is ignored but linked from a page. Which hidden files must never be read or sent anywhere (`.env*`, keys)? How long does listing and fingerprinting (git blob SHA-1 via Web Crypto) take in the browser for 100, 1,000 and 10,000 files, and can fingerprints be computed lazily (size plus `lastModified` first)? Measure on `~/Projects/techies-reviews` (118 pages, 191 images) and `~/Projects/native-site-editor-starter`, and on a synthetic large folder. Compare with today's limits (1 MB text files, 5000 drafts, the media manager's 20 MB per file) and recommend a file-count cap, a per-file size cap and what the user sees when a folder exceeds them.
