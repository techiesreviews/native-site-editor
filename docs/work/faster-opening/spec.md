# Faster opening

Lex chose (2026-11-09) two of the faster-opening options: (b) fewer waits on the server before the first screen, and (c) the code pane loads after the page is usable. Not (a), showing the last page from the browser's memory. The boot keeps its 355 KB budget (`kit size`).

How it is measured: `tests/perf/cold-start.ts` against the test server with the built app (`ASE_NATIVE_SAVE_DIST=1`), 3 runs, median ms from navigation start, with `ASE_COLD_NET=100/20` (normal: 100 ms latency, 20 Mbps) and `ASE_COLD_NET=400/1.6` (slow mobile). "paint" is the first screen (the page in the preview), "usable" the page structure listing it, "warm" a repeat visit. A before-and-after comparison runs the old and new builds in alternating rounds on the same machine, as machine load moves the numbers by up to 0.15 s between sessions (ticket 01 used 5 runs a round for the normal profile). The test server answers at once, so these numbers show the round trips' latency, not GitHub's own time on the real editor.

## Before (dev at 428e793, 2026-11-09)

| | session | first screen | usable | code pane |
| --- | --- | --- | --- | --- |
| Normal, first visit | 777 | 1098 | 1098 | 1912 |
| Normal, repeat visit | 245 | 332 | 332 | 558 |
| Slow, first visit | 3214 | 4414 | 4414 | 10690 |
| Slow, repeat visit | 917 | 1030 | 1030 | 2157 |

On the real preview editor (preview-editor.techies.tools, a repeat visit, code from the cache): `/api/session` ends at about 1.2 s and `/api/snapshot` at about 2.7 s, both GitHub's time behind the Worker.

## Tickets

- [01 Fewer waits on the server before the first screen](issues/01-fewer-server-waits.md)
- [02 The code pane loads after the page is usable](issues/02-code-pane-after-usable.md)
