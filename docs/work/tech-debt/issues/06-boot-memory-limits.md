---
title: Boot memory known limits
status: needs-triage
assignee:
blocked_by: []
---

# Boot memory known limits

## What

"Remember last boot" ([p5-17](../../../wayfinder/lean-fast-editor/build/p5-17-boot-memory.md))
met the warm target (341 ms). Accepted limits after one Opus and five Sol
reviews:

- No read timeouts in the editor: a guessed (or fresh) snapshot that stalls
  after the branch list is in holds the page; the only bound is the 5 s wait
  after a failed branch list (`GUESS_AFTER_FAILED_LIST_MS`).
- A guess taken before the repository selection is cleared or access is
  removed is not marked abandoned; if its snapshot lands it still seeds the
  file cache (right content, keyed by SHA; may evict entries). Sol P3.
- Sign-out clearing the memory has no browser test; `sessionTag()` has no unit test.
- A boot without repo and branch in the hash does not use the memory.
- Subfolder paths are proven only from a snapshot with the full `tree`.
- A stale guess costs one wasted snapshot and one batch read.
- The memory (repo names, branch, paths, SHAs; no contents) is readable by
  scripts on the editor origin and cleared only by sign-out.
