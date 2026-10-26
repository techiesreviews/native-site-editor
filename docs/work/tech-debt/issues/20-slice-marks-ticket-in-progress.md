---
title: kit slice marks its ticket as in progress, and frontier skips it
status: ready-for-agent
assignee:
blocked_by: []
---

# kit slice marks its ticket as in progress, and frontier skips it

## What

Retro 2026-10-26, item 2. While kitchen-everywhere slice 10 was being built, `tickets.mjs frontier kitchen-everywhere` showed it as `open` and `claude`, the same as an untouched ticket. A planning thread nearly started the same build again. Only a T3 thread search showed the build running. `kit.d/slice` writes the ticket's status only when the slice closes it (`kit.d/slice:245`).

## Done when

- When `kit slice` starts, it writes the ticket's `assignee:` as the slice owner plus its branch or T3 thread (for example `claude (slice-ke10, branch slice/ke-10)`), and commits that on dev, as the tracker's "Claim" rule asks (`docs/agents/issue-tracker.md`).
- `tickets.mjs frontier` lists a claimed ticket under a separate "in progress" heading, not among takeable tickets. `kit next` already skips running jobs; it keeps doing so.
- A cancelled or failed slice clears the claim, or `kit status` shows the stale claim.
- Land it after the kitchen-everywhere slices that touch `kit.d/slice` and `kit-lib.*` (ke 10–17), or coordinate with that build's lead first.
- Kit: `kit doctor`, `kit unit --affected` (kit tests), `kit review`, `kit pr` into dev.
