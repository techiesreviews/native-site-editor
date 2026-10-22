---
title: A test server on 5216 died mid-suite, cause unknown
status: closed
assignee:
blocked_by: []
---

# A test server on 5216 died mid-suite, cause unknown

## What

On 2026-10-08 at about 17:26 the full native-save suite on boot memory
`0946931` lost its test server on 5216 at test 297 of 825
(`native-images-tab.spec.ts`): 536 tests then failed with
`ERR_CONNECTION_REFUSED`. No OOM kill in the journal, no server error in the
log, shared `node_modules` intact. The same specs passed in other suites that
day and in two reruns of that branch (740 / 85 / 0). Another agent removed a
temporary worktree at that moment (it reports no kill by pattern).

## Needs

A repeat with the server's own output captured (Playwright `webServer`
stdout/stderr to a file) to see whether the process exits or is killed.

## Comments

- 2026-10-22: closed as not reproducible (cbf research 02): server output is captured since c9944e64, ports are locked since 2026-10-11, no recurrence in about 30 spec runs and 6 full unit suites under load. The server log will name the cause if it recurs.
