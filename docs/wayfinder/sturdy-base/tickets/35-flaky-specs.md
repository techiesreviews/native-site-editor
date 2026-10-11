---
title: "The two specs that fail under load pass reliably"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 3
---

## What

Seen across this week's full runs, each passing on rerun:

- `native-canvas.spec.ts:382` (code-range drag): a 120 ms timing check measured 142 ms under load (slices 17, 32, 33).
- `native-branch-menu.spec.ts:40` (slices 23, 30); slice 17 could not reproduce it in 3 full runs + 5 repeats.
- Also seen once each: `native-store-history:75` (click timeout, slice 31), `native-org-repositories` (ECONNRESET, slice 19).

Find each cause. A timing threshold that measures the machine rather than the editor should check the behaviour (e.g. the drag lands in one frame/step) instead of wall-clock; a real race in the editor gets fixed in the editor. Don't just raise timeouts.

## Done when

- Each spec's cause is named in the Done note, with the fix.
- Each passes 10/10 with `--repeat-each=10` while another full suite runs alongside (load), and the full `native-save` suite, smoke and `@actual` are green.

## Done (2026-10-11)

- `native-canvas:382`: the spec measured the gap between two real clicks against the 120 ms cursor wait (code-link.ts), so the machine, not the editor. The page's clock now stands still between the code click and the crumb click and then runs 500 ms; the selection stays `body` (a no-op `cancel()` fails it). `native-branch-menu:40` (reproduced, 1 in 10 under load): the trace showed the pointer's way to the flyout taking 460 ms against the flyout's 250 ms close grace; the way now takes 100 ms of page clock. Both install the clock just before the step: installed before load it also fakes `performance`, and Monaco's input-latency measure throws on every key.
- `native-org-repositories` (`apiRequestContext.get: read ECONNRESET`): Playwright's request agent reuses keep-alive sockets the fake server closes after 6 s idle; one sent as it closes is reset (shown in a two-process repro). The server (dev and dist) now keeps idle connections open (`keepAliveTimeout = 0`).
- `native-store-history:75`: the one record (slice 31's run, two Playwright runs in its worktree) is the title click retried 120 s against the Edit component shade, i.e. the mode framed something other than the first card; not reproduced on dev in 150+ runs under load nor 24 at 4–10x CPU throttle, so no editor fix. The spec now waits for the mode and checks a click at the title reaches it, failing in 15 s with that message (framing the second card gives exactly that).
- Commits fcce62f3, cecfce03, 249ca6a6. Each spec 10/10 with `--repeat-each=10` beside a full suite from a second worktree; full native-save 887 passed, 56 skipped; smoke 42/42; @actual 54/54. No src change.
