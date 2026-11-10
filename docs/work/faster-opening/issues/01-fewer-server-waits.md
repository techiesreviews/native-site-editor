---
title: "Fewer waits on the server before the first screen"
status: needs-info
assignee: fleet-lead
blocked_by: []
---

## Goal

The first screen comes sooner on a first visit, most of all on a slow connection, by not waiting for one server answer before asking the next. Lex chose this (option b, 2026-11-09). See [the spec](../spec.md) for how it is measured and the numbers before.

## What the measurement shows (slow, first visit, ms from navigation start)

```
2805–3212  /api/session
2806–3225  /api/repositories
3289–3724  /api/snapshot?repo=…&branch=main        (starts after session answered)
3289–3698  /api/branches?repo=…
3727–4170  /api/file?…                             (starts after the snapshot answered)
3734–4182  /api/files?…
3738–4354  /assets/native-preview-runtime-….js     (asked only after the snapshot)
first screen 4414
```

Three server waits run one after another (session, then snapshot, then the page's files), and the preview runtime (36 KB) is only asked for after the snapshot. Nothing is asked for while `index.js` (209 KB) downloads, until 2.8 s. A repeat visit already asks session, snapshot and files side by side (`src/boot-memory.ts`, `src/workspace-boot.ts`).

## Decided behaviour

- Same screens and same safety: nothing a person sees changes except that it comes sooner. Every check that holds today still holds (a signed-out session, another account, a repository that went away, a branch that moved: the same outcome as today, only sooner or after a retry).
- Ask what can be asked at once:
  - the session (and the repository list) from the page itself, before the app's script has loaded (for example a `fetch` or `<link rel="preload" as="fetch" crossorigin="use-credentials">` in `index.html`, which the boot then takes instead of asking again);
  - the snapshot of the repository and branch named in the address (`#repo=…&branch=…`) together with the session, on a first visit too, not after it; a session that turns out signed out or for another account throws that answer away, as a stale answer is thrown away today;
  - the preview runtime as soon as a site will be shown (for example a `modulepreload` the boot adds when the address names a repository), not after the snapshot.
- If the page's files can come with fewer round trips without a server change, take that; a server change (the snapshot carrying the first page's texts) is out of scope here and goes in Done as a suggestion with its measured gain.

## Files

Expected (confirm while designing): `index.html`, `src/controllers/boot-controller.ts`, `src/workspace-boot.ts`, `src/boot-memory.ts`, `src/main.ts` (wiring only; `tests/main-ts-ceiling.test.ts`), the preview runtime's loading (`src/components/native-preview.ts`); tests.

## Done when

- Unit tests for the ordering: the session and the address's snapshot are asked at once; a signed-out or other-account session discards the early snapshot; the early session answer is used once and not asked again.
- `tests/perf/cold-start.ts` before and after (both `ASE_COLD_NET` profiles, first and repeat visit) in Done, as the spec's table. Expected: the slow first visit's first screen at least 0.8 s sooner; no repeat-visit number worse.
- `kit size` passes (boot within 355 KB), `kit unit --affected`, `kit specs --affected`, `npm run check`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../agents/runner.md)). `kit go slice-fo01 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`. Measure with `kit bg` for the test server (`ASE_NATIVE_SAVE_DIST=1 ASE_NATIVE_SAVE_PORT=<port> npx tsx tests/native-save/server.ts`) and `ASE_COLD_BASE=… ASE_COLD_NET=… npx tsx tests/perf/cold-start.ts 3`.

## Done (2026-11-10)

### Open for Lex

- The slow first visit's first screen comes 0.70 to 0.74 s sooner, not the 0.8 s this ticket asked for (Timing says why: the test server's six connections, not server waits). Accept 0.7 s, or keep the ticket open for more?
- One failure case changes what a person sees (Behaviour, last point): on a first visit to a site link, a branch list GitHub never answers no longer stops the opening; the site opens on the linked branch, as a repeat visit already does. Keep it, or bring back the old error for first visits?

### Behaviour

- The page asks for the session and the repository list itself, first in `<head>` and ahead of the editor's own files (`<link rel="preload" as="fetch" crossorigin="use-credentials">`, added by `vite-preview-runtime.ts` to `index.html` only). A small classic script, `src/boot-early.ts` (1 KB gzip, content-hashed under `/assets/`, async, high priority), takes those answers and, when the address names a repository, asks for its snapshot: at once when the browser remembers the repository's name (`rememberedName`, `src/boot-memory.ts`), otherwise as soon as the repository list names it, without waiting for the session. It also asks for the preview runtime then (its URL comes on the script tag as `data-runtime`).
- The boot takes each early read once (`takeEarlyRead`, `takeEarlySnapshot` in `src/boot-reads.ts`) and checks it as it checks its own reads: the session and the list through `startBootReads` (same session tag), the snapshot through the boot guess in `src/workspace-boot.ts` (the adopted session's tag, the verified listing, the same full name and branch, and the remembered account when there is a memory). A signed-out session, another account, a renamed repository, another repository or branch in the address: the early snapshot is thrown away and the snapshot is read afresh, as before. When the boot starts first (a repeat visit can), it claims the reads and the early script asks for nothing.
- An early read counts as the first of a read's four tries (`first` in `fetchWithReadRetry`): one that gets no answer, or a 502/503, is followed by the read's own three retries, so a silent GitHub still shows the toast after four tries.
- The editor's GET reads use `credentials: "include"` (the same as `same-origin` for these same-origin reads) so they match the page's preloads.
- One failure path changes: on a first visit with a linked site, a branch list GitHub never answers no longer stops the opening; the early snapshot proves the branch and the site opens, as a remembered (repeat) visit already did. `native-github-silent.spec.ts` now covers the branch-list toast with a site remembered by the browser but not named in the address.

### Timing

`tests/perf/cold-start.ts`, built app (`ASE_NATIVE_SAVE_DIST=1`), median ms from navigation start, old (f68a492) and new builds measured in alternating rounds on the same machine on 2026-11-09/10. Normal: 5 runs per round; slow: 3 runs per round; the table shows the first round of each.

| | session | first screen | usable | code pane |
| --- | --- | --- | --- | --- |
| Normal, first visit, before | 839 | 1241 | 1242 | 2244 |
| Normal, first visit, after | 226 | 1022 | 1028 | 2034 |
| Normal, repeat visit, before | 245 | 341 | 341 | 591 |
| Normal, repeat visit, after | 227 | 330 | 330 | 565 |
| Slow, first visit, before | 3206 | 4413 | 4413 | 10687 |
| Slow, first visit, after | 824 | 3675 | 3675 | 9913 |
| Slow, repeat visit, before | 916 | 1021 | 1021 | 2131 |
| Slow, repeat visit, after | 879 | 1005 | 1005 | 2114 |

Second rounds: slow first screen 4415 before, 3712 after; normal first screen 1244 before, 982 after; repeat visits 346/1037 before, 322/991 after. No repeat-visit number is worse.

The slow first visit's first screen comes 0.70 to 0.74 s sooner, short of the expected 0.8 s. What is left is not server waits: the test server speaks HTTP/1.1, so the browser keeps six connections, and the editor's boot is about 25 files (`index.js` and its chunks, the stylesheets) that each hold one for the 400 ms latency. The editor's script cannot run before the last of them, about 3.1 s; the snapshot is already in by then (asked at 0.87 s, it waits in the same queue), and the page's files (about 0.45 s) follow the script. On the real editor (HTTP/2 and HTTP/3) the queue does not apply. Tried and dropped: a higher fetch priority for the early reads (fetch stays at High), the session asked by the early script instead of the page (no change), the runtime asked later (no change).

The preview runtime asked by the early script is used: the preview frame's own request for it comes from the disk cache (Chrome DevTools protocol: `fromDiskCache`, 0 bytes on the wire), and no "unused preload" message shows. The same build with and without it (alternating rounds, slow profile, first screen): 3681 and 3704 with, 3866 and 3867 without, so it is worth about 0.17 s.

### Settle matrix

Each early read is a first try only: whatever happens to it, the boot ends where it ended before, sooner or after its own tries.

| Read | Answers | Fails (401, 403, 503, network) | Never answers |
| --- | --- | --- | --- |
| Session (page preload, early script) | The boot adopts it as its first session read, once; a later boot asks afresh. | The boot's read: a 401 or signed-out answer shows the sign-in page as before; a 502/503 or no answer is followed by the read's own three tries. | Given up after 8 s; three more tries, then the error as before. |
| Repository list (page preload, early script) | Taken by `startBootReads` only with the adopted session's tag; otherwise the session's own listing, as before. | No early snapshot is asked (a 401 is the signed-out page); the boot's listing as before. | No early snapshot; given up after 8 s, the boot's listing as before. |
| Early snapshot (asked once the list or the memory names the repository) | Used only with the adopted session's tag, the listed full name, the linked branch, and the remembered account when there is a memory; otherwise read afresh. | A 403/404 (a moved branch or lost access) or 401: read afresh, the normal path's message. A 502/503: three more tries. | Given up after 8 s, three more tries, then the toast with Try again (four tries in all). |
| Order: the boot first | The boot claims the reads; the early script asks for nothing and the boot asks for each itself, once. | | |
| Order: the address changes before the boot | The early snapshot names another repository or branch and is thrown away. | | |

### Suggestions (not done here)

- Server: the snapshot carrying the first page's texts would save the page's files round trip after the snapshot, about 0.45 s on the slow first visit and 0.1 s on the normal one (measured: `/api/file` and `/api/files` 3165–3611 ms in the slow waterfall).
- Fewer boot files: with six connections, each file the boot waits for costs a slot for one round trip; the boot's chunk count is now the slow first visit's limit.

### Tests

- `tests/boot-reads.test.ts`: the session, the list and the remembered repository's snapshot are asked at once; with nothing remembered the snapshot is asked as soon as the list names the repository, before the session answers, and the boot can still read the list; a list without the repository (or a 401) asks no snapshot; no address, no snapshot and no runtime; an early try with no answer is given up after the read timeout; each early read is taken once and a snapshot for another repository or branch is thrown away; the boot's claim leaves the early script nothing to ask.
- `tests/boot-controller.test.ts`: the early session and list stand for the first reads, each used once; a later boot asks afresh.
- `tests/workspace-boot.test.ts`: the early snapshot opens the linked repository with no second read once the session's tag proves it; taken once; a signed-out session or another account's tag throws it away; another name (renamed) or none (not listed) reads afresh; another repository or branch is never taken; with a memory it stands for the guess's first try and the remembered files are asked as before.
- `tests/read-retry.test.ts`: an early first try is the first of four. `tests/github-reads.test.ts`: an early answer is the answer; no answer or a 502/503 is followed by the read's own tries. `tests/boot-memory.test.ts`: `rememberedName`. `tests/vite-preview-runtime.test.ts`: the editor's page gets the preloads and the early script first (the other pages do not), the dev server serves it as one classic script, and the built script asks the session, the list, the snapshot and the runtime.
- `tests/native-save/native-boot-memory.spec.ts`: a guessed read is one asked before the boot asks for the branch list (the session now answers before the editor's script runs).
- `tests/native-save/native-early-reads.spec.ts` (first visit, no memory, `#repo=501&branch=main`), one test per matrix row: the session and the list are asked once each and no "preload" console message shows; with the session held, the snapshot is asked before its release and the page shows from that one read; an early snapshot under another session tag is thrown away and the page shows from a second read; a list without 501 asks no snapshot and shows the plain message; with the early script held until the page shows, the boot asks for the session and the snapshot once each and the released script asks nothing; a branch list GitHub never answers still shows the linked site on the linked branch (open for Lex). Also: an early snapshot GitHub refuses (403) is read afresh and the page shows from the second read, with no notice; an early snapshot that never answers is given up after the read timeout and the next try opens the site, with no toast; with the editor's script held, an address changed after the early snapshot was asked opens the new address (native-routing) from its own read, the first address's snapshot unused.
- `tests/workspace-boot.test.ts`: a record the early script names but the boot rejects (a bad commit) runs the guess on the early snapshot alone, taken only with the same name and tag, seeding nothing. `tests/read-retry.test.ts`: a first try that answers leaves no abort listener behind.
- `scripts/agents/kit unit --affected`: RESULT: ok unit 350/350 (23 files). `scripts/agents/kit specs --affected`: RESULT: ok specs 12/12 passed. `scripts/agents/kit size`: RESULT: ok size boot 355 KB (+1 KB) vs dev@428e793, budget 355 KB (363,520-byte budget; about 190 bytes to spare). `npm run check` and `npm run lint` pass.

Feature list: no change (nothing a person sees changes except that the editor opens sooner; the one failure-path change is described under Behaviour).

### UX follow-ups

- UX (looks off): F-setup-09 The project menu shows "Sign out of native-demo-user" at the bottom, and the try passed. But at 390 px the refresh button is 24 px and the menu rows are 32 px tall, which is under the 44 px a touch target needs. The Share rows also have grey dots on them. No image shows the sign-in screen after signing out. (.scratch/ux/fleet-lead/20261110-003118-Q98Brn/F-setup-09-contact.webp)
- UX (looks off): F-repo-01 The repository ends on the preview of its home page ("Routed by folders"). Before that, on a phone, the first three frames show "Select a page" and a Files panel saying "Loading files…" that fills the screen. Then frame 4 shows an empty preview. So the site does not open straight into the preview, and the first thing shown is something nobody asked for. (.scratch/ux/fleet-lead/20261110-003118-Q98Brn/editor-F-repo-01-390-light-open-strip.webp)
- UX (looks off): F-repo-06 The branch is read again and the same home page comes back. In the first frame, the "Loading files…" panel covers the page being worked on. (.scratch/ux/fleet-lead/20261110-005716-DtbFHi/editor-F-repo-06-390-dark-refresh-strip.webp)
