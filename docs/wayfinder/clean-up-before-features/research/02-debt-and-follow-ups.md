# Research 02: the tech-debt notes and small follow-ups on today's code

Ticket: [Re-check the tech-debt notes and small follow-ups on today's code](../tickets/02-research-debt-and-follow-ups.md).
Read on `dev @ 89ac5e0e` (2026-10-22), in a worktree with the shared `node_modules` linked in
(`kit doctor` 7/7). Every command went through Agent Kit (`scripts/agents/kit`). "Measured" means
a command run for this note; "inferred" means read from the code or older notes, not run.

## Summary

| Item | Status today | Size | Rides with (ticket 01 candidate) |
| --- | --- | --- | --- |
| TD 01 `main.ts` size | Still real: 5,650 lines | L (spread over slices) | #2, #8, #1, #4 |
| TD 02 byte budget | Still real, worse: 355 of 355 KB, 0–0.5 KB left | S to M | Every slice that touches boot code |
| TD 04 test server died on 5216 | Can't reproduce; the "Needs" step is done | none (close) | none |
| TD 06 boot memory limits | All seven limits still hold | S each (M for a read timeout) | #1 Workspace session |
| TD 10 preload and Page Structure limits | All still hold (inferred) | S each | #2 (preload), #5 (Page Structure) |
| TD 11 silent Undo/Redo | The 2026-10-09 comment is confirmed, plus the buttons grey out | S if wanted | none |
| Media rebuilds every tile | Still real; about 0.1 ms per tile per redraw, on each search keystroke too | S (search) / M (in place) | none |
| `discardFile()` with no user | Still real in the controller; not reachable from the UI today | S | #8 (with TD 08) |
| `kit-wait` producer test flake | Can't reproduce (22/22 under load 13–35); fixed by TD 09 | none | none |
| `native-code-folding` race | Can't reproduce (16/16 under load 10–28); fixed by TD 09 | none | none |
| `kit-preview` old-bundle timeout | Can't reproduce (22/22 under load); fixed by agent-kit 42 | none | none |
| `kit specs --affected` and `server.ts` | Fixed (agent-kit ticket 43, 2026-10-17); re-checked | none | none |

## Tech-debt notes

### 01 `main.ts` size: still real

- **Measured.** `wc -l src/main.ts` gives **5,650** lines. It was 5,994 after the 2026-10-08 quick
  wins and 5,833 at the architecture review's base `edc0f76f`, so the later builds took off about
  180 lines. A TypeScript AST pass over the top-level statements gave 521 statements: 126 import
  lines, 3,989 lines of function declarations, 835 of `const`/`let` statements (mostly controller
  wiring objects), 62 of top-level expressions.
- **Largest single statements (measured):** `mountWorkspace` 325 (318–642), `loadSnapshot` 134
  (4836–4969), `makeAgentSiteActions` 130 (4476–4605), `chooseRepository` 128 (5027–5154),
  `mountSource` 123 (4251–4373), `activateNativeSite` 117 (2704–2820), `loadRepositories` 113
  (5331–5443), `renderLogin` 99 (3210–3308), `openEntry` 80, `mediaPorts` 79, `loadNativeAssets` 66,
  `restoreFile` 66.
- **Regions by line range (measured ranges, grouping inferred from names):**
  - Imports and lazy-module wiring, code editor open/close: 1–317 (about 320).
  - `mountWorkspace`: 318–646 (about 330).
  - Palette, component tools, rail, block moves, history controller: 647–1043 (about 400).
  - Version view and restore: 1044–1167 (about 125).
  - Linked styles, secondary pane, rule chips: 1168–1518 (about 350).
  - Preview selection, variants, CSS workspace, Page Structure controller: 1519–1768 (about 250).
  - Native site state, routes, effective sources, preview sources, shown-file reads: 1769–2227 (about 460).
  - Native assets, uploads, media text: 2228–2436 (about 210); media ports and controller 2437–2548 (about 110).
  - Native activation, component styles, site files, text index, paint waiters, page-title pointer,
    current page: 2549–3065 (about 520).
  - Status, errors, `api`/`postApi`: 3066–3209 (about 145).
  - Login and setup: 3210–3439 (about 230).
  - Files and Pages trees, explorer tabs: 3440–3601 (about 160).
  - Pages controller, Create: 3602–3839 (about 240).
  - File actions, file operations, resync, Undo of file changes, save/publish: 3840–4169 (about 330).
  - `openEntry`, `mountSource`, component linked style: 4170–4411 (about 240).
  - Agent context, site actions, agent commands: 4412–4768 (about 355).
  - `restoreFile`, snapshot and boot guess, `chooseRepository`: 4769–5164 (about 400).
  - Wizard, partial start, Get Started: 5165–5330 (about 165).
  - Repository list, account, disconnect, `boot`, global listeners: 5331–5650 (about 320).
- **Judgement.** The note's "realistic floor about 1,200–1,800" still looks right. The biggest
  movable blocks are exactly ticket 01's candidates: the native site runtime block (1769–2869,
  about 1,100 lines) is candidate #2; the agent block (about 355) is #4; the boot/snapshot block
  (about 400) is #1's natural home (generation, `takenGuess`); the controller ports and forwarders
  scattered through 647–1043 and 3602–4169 are #8.
- **Fix size:** L in total, but only as a by-product of #1, #2, #4 and #8. Not a slice of its own.
- **Files:** `src/main.ts` plus the new modules each candidate creates.
- **Behaviour a user would notice:** none.

### 02 Byte budget headroom: still real, now none left

- **Measured.** `kit size --no-base` on 89ac5e0e: `boot 355 KB, total 1444 KB, requests 35, budget
  355 KB`, `RESULT: ok size boot 355 KB, budget 355 KB` (cold median of 3; 222 KB is `index.js`,
  31 KB the preview runtime, 22 KB `index.css`). The kit rounds to whole KB and its cache stores
  `boot: 363520` (355 × 1024), so the exact figure lies between 363,008 and 363,520 bytes:
  **0 to 0.5 KB of headroom.**
- **Trend (measured, from the kit's per-commit cache in the main root `.scratch/size-cache/`):**
  the last 23 measured commits all read 355 KB; earlier ones 352–354 KB. Recent work has been
  trimming to stay under (for example ak-27 "media-kinds boot bytes 353 → 352 KB").
- **What it means now.** Any slice that adds boot code fails `kit size`. Every architecture slice
  that adds a module boundary (ports and API names survive minification, about 1 KB per
  controller slice per the note) will hit it unless it also moves code out of the first load.
- **Fix options (inferred sizes):** lazy-load controllers not needed before first paint (file
  operations, Pages actions; the note estimated 8–10 KB freed): M. Raise the budget: S, but it
  is a product decision (first-load speed). Shorter ports: small wins only.
- **Files:** `tests/perf/byte-budget.ts` (budget), `src/main.ts` and the controllers made lazy.
- **Behaviour question for Lex:** "The editor's first load is at its size limit. Should we keep
  that limit (and load rarely used parts, such as file actions and page actions, a moment later
  when first used), or let the first load grow a little?"
  **Recommended:** keep the limit and load rarely used parts later; the first visit stays as
  fast as today, and the first use of a file or page action may take a fraction of a second longer.
- **Rides with:** every candidate slice that touches boot code; best decided before #2 and #8
  start, since they will otherwise need a budget raise mid-build.

### 04 A test server on 5216 died mid-suite: can't reproduce

- **Measured / searched.** The "Needs" step is done: since c9944e64 (2026-10-08 23:12, after the
  incident) `playwright.config.ts:41` tees every test server's output to
  `.scratch/<project>/server-<port>.log` and writes `server … exited <status>` when the server ends
  by itself. Of the 12 server logs still on disk since 2026-10-01 (other worktrees were tidied),
  none has an `exited` line, that is, no server ended on its own; their only errors are browser
  client errors (`ResizeObserver loop`, `deps.canvasComponent is not a function`). No note or
  ticket since 2026-10-08 reports `ERR_CONNECTION_REFUSED` mid-suite; `tests/known-failures.json`
  is empty. My own runs today (about 30 spec runs and 6 full unit suites under load) lost no server.
- **Inferred cause candidates, now guarded.** On 2026-10-08 5216 was a shared default port
  without locks. Since 2026-10-11 the suites use the locked pool (5226–5296) and `5216` is
  reserved for `timing.sh`/`cold.sh`; `reap.sh` only kills listeners on unlocked slots. A second
  run starting on 5216, or a clean-up killing it, would have produced exactly this; neither can
  happen the same way now.
- **Recommendation:** close as can't reproduce; the server log will name the cause if it recurs.
- **Size:** none. **Behaviour:** none. **Rides with:** nothing.

### 06 Boot memory known limits: all still hold

Read in `src/main.ts:4976–5154` (`dropBootGuess`, `startBootGuess`, `takeBootGuess`,
`chooseRepository`), `src/boot-memory.ts`, `src/read-retry.ts`, `tests/native-save/native-boot-memory.spec.ts`
(all inferred from code, not run):

1. **No read timeouts.** Still holds. `apiResponse` (`main.ts:3121`) uses `fetchWithReadRetry`
   with no timeout. When the branch list arrives first, the guessed snapshot becomes `prefetched`
   and `loadSnapshot` waits on it unbounded (`main.ts:5064`, 5111); the branch picker is usable
   (spec "a stalled guessed snapshot does not hold the branch picker"), the page is not. The only
   bound is `GUESS_AFTER_FAILED_LIST_MS = 5000` (`main.ts:4976`).
2. **A guess taken before the repository selection is cleared is not abandoned.** Still holds.
   `dropBootGuess()` runs in `renderLogin` (`main.ts:3213`), on `hashchange` (5617) and in
   `takeBootGuess`; `loadRepositories` (5331) resets the selection (`appStore.reset()`) without
   it, so a landed guess still seeds the clean-source cache (right content by SHA).
3. **Sign-out clearing has no browser test; `sessionTag()` has no unit test.** Still holds.
   `disconnect()` calls `forgetBootMemory` (`main.ts:5530`); no spec posts `/auth/logout`, and no
   test calls `boot.sessionTag()` directly (`tests/boot-controller.test.ts` only feeds tags in).
4. **A boot without repo and branch in the hash does not use the memory.** Holds
   (`startBootGuess` returns without a workspace link).
5. **Subfolder paths proven only from a snapshot with the full tree.** Holds
   (`provenFiles(memory, snapshot.tree ?? snapshot.entries)`).
6. **A stale guess costs one wasted snapshot and one batch read.** Holds by design.
7. **The memory is readable by scripts on the editor origin and cleared only by sign-out.** Holds
   (`localStorage`; `forgetBootMemory` runs in `disconnect`, and at 4909 for one repository that
   opens as not native, which is not a user's way to clear it).

- **Fix sizes (inferred):** 2 and 3 are S each (one call, two tests). 1 is M: a timeout means a
  new "GitHub is slow" state with a way to retry. 4–7 are accepted design.
- **Behaviour questions for Lex:**
  - "If GitHub stops answering while the editor reopens your last site, the page waits with no
    end. Should it give up after about 15 seconds and offer Try again?" **Recommended:** yes, but
    as its own small slice after the Workspace session work, since it changes what a user sees.
  - "To reopen fast, the editor keeps your last site's name, branch and file list (no content) in
    this browser until you sign out. Keep that?" **Recommended:** keep it.
- **Rides with:** #1 Workspace session (one owner for generation and the guess token would make
  "selection cleared" abandon the guess for free).

### 10 Preview preload and Page Structure limits: all still hold (inferred)

- **Deploy auto-reload of a parked frame.** Holds: `src/chunk-recovery.ts:72–73` still skips
  frames inside `[inert]`, so a deploy can reload a tab whose preview is parked (drafts flushed,
  loop-guarded).
- **The stale-predicted-read test passes with or without its fix.** Holds as written in
  `docs/wayfinder/lean-fast-editor/build/p5-15-preview-preload.md:42`; not re-run with the fix removed.
- **Typing flicker on an unrelated file change.** Holds: `holdsPaint` in
  `src/components/structure-editing.ts:431–435` holds only when the painted source is the field's
  own; not reproduced in a browser.
- **Two suggestions with the same title refocus the first.** Holds: `focus()` takes the first
  field whose id starts with the prefix (`structure-editing.ts:441–447`).
- **`<br>` allowance misses SVG/MathML and obsolete raw-text elements.** Holds:
  `takesBreaks` (`src/page-builder/component-model.ts:227`) excludes neither `svg`/`math` nor
  `xmp`, `iframe`, `noembed`, `noframes`, `plaintext` (`source-tree.ts:80` knows them as raw text).
- **Live-patching specs use a stub.** Not re-checked.
- **Fix sizes:** each S; none urgent.
- **Behaviour questions for Lex:** "While you type in Page Structure, if another file changes at
  that moment, the text you typed can flicker for an instant (nothing is lost). Fix now or leave?"
  **Recommended:** leave it unless you have seen it. "A deploy can reload a browser tab that is
  showing a non-editable site, after saving your drafts. OK?" **Recommended:** OK.
- **Rides with:** the preload items with #2 Native site runtime; the Page Structure items with #5
  One Page Structure model (the `<br>` rule with #6 if rules move to `rules/`).

### 11 Silent Undo/Redo: the 2026-10-09 comment is confirmed

- **Measured.** A throwaway spec (`kit specs`, 1/1, deleted after) on the native-save fixture: a
  page edit plus stylesheet typing, then four Undos returned everything to the start; a fifth
  Undo returned `false` and showed no new notice; Redo worked; new typing then dropped the redo
  step and Redo returned `false` with no notice. In every "cannot move" state the toolbar's
  Undo or Redo **button was disabled**. So nothing is stuck: the buttons grey out, and only the
  keyboard shortcut (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) says nothing. The silence is deliberate:
  `src/components/source-editor.ts:499–500` ("Nothing to move stays quiet"), with the button
  state at 886–889. The probe used a single-file page edit, not Add section; the multi-file
  refusal path (`RECEIPT_REFUSAL`, `draft-store.ts:193`) still shows its notice and sets the
  button title.
- **Fix size:** S if wanted (a short status line for the keyboard case).
- **Behaviour question for Lex:** "When there is nothing left to undo or redo, the Undo and Redo
  buttons turn grey. Should pressing the keyboard shortcut also show a short 'Nothing to undo'
  message?" **Recommended:** no; the grey buttons are enough. Close the note as wontfix.
- **Rides with:** nothing.

## Follow-ups seen 2026-10-17

### Media rebuilds every tile on each library refresh: still real

- **Code.** `drawLibraryGrid` (`src/page-builder/media-library-grid.ts:48`) disconnects every
  observer, empties the grid (`grid.replaceChildren()`, line 64) and builds every card again. It
  runs on each library refresh (`media-library-view.ts:254`), on every search keystroke
  (`media-library-input.ts:17`, no pause), and on filter and selection changes. File bytes are
  cached (`createMediaByteCache`), so a redraw re-reads nothing from GitHub; tiles in view get
  their picture again from the cache.
- **Measured.** A throwaway browser probe (`kit specs`, deleted after) called `drawLibraryGrid`
  with synthetic libraries in headless Chromium on an idle machine, without the app's CSS
  (median of 5 redraws, including two animation frames of about 33 ms):
  100 tiles 33 ms, 500 tiles 60 ms, 1,000 tiles 100 ms, 3,000 tiles 268 ms (max 323 ms).
  So about 0.08–0.09 ms per tile above the frame floor: a 1,000-file library spends about a tenth
  of a second per keystroke in search; 3,000 files about a quarter of a second.
- **Fix sizes:** S: redraw search after a short pause in typing. M: update tiles in place by path
  (keep cards whose file, usage and marks did not change).
- **Files:** `src/page-builder/media-library-grid.ts`, `media-library-input.ts`, `media-library-view.ts`.
- **Behaviour question for Lex:** "With a very large Media library (a thousand files or more),
  search and refresh feel slightly sluggish because every tile is redrawn. Make it smoother now,
  or wait until a real site gets that big?" **Recommended:** do the small part now (search waits
  for a pause in typing); leave the in-place update until a real library is that large.
- **Rides with:** none of the candidates; a stand-alone S slice.

### `discardFile()` with no signed-in user: still real in the controller, unreachable from the UI

- **Measured.** A throwaway unit test (`kit unit`, 1/1, deleted after) on
  `createSavePublishController` with `scope()` returning nothing and `change(path)` returning a
  change: `questions ["Discard the changes to a.html?"]`; after "yes" the draft was still there
  and nothing was announced. So the controller asks, then does nothing and says nothing
  (`src/controllers/save-publish-controller.ts:240–247`; `confirmed` returns 0 without a scope).
- **Inferred.** In the app the `change` port is `treeState().changes.get(path)` (`main.ts:4139`),
  and `treeState()` lists no drafts without `draftScope()` (`main.ts:3451–3452`), so today the
  question cannot open with no user. Scope lost while the question is open is caught by the
  proof check in `confirmed`. The existing unit test "without a user scope or row change"
  (`tests/save-publish-controller.test.ts:426`) covers only the case with no change.
- **Fix size:** S (return before asking when `scope()` is empty; one unit test).
- **Files:** `src/controllers/save-publish-controller.ts`, `tests/save-publish-controller.test.ts`.
- **Behaviour:** none a user can reach today.
- **Rides with:** #8 (pass-throughs) together with tech-debt 08 (controller API tidy-ups).

### `tests/kit-wait.test.ts` "producer closes the file and appends again": can't reproduce

- **History.** Agent-kit ticket 28 (2026-10-16) fixed the test's timing; tech-debt 09
  (2026-10-17, 7fafb559 and e781a3bf) fixed the remaining cause in `kit wait` itself: a process
  vanishing mid-scan (ESRCH) ended the wait with `RESULT: fail`.
- **Measured.** `kit unit tests/kit-wait.test.ts tests/kit-preview.test.ts` 3/3 alone, then 12/12
  beside a looping full `kit unit` (load average 13–23), then 10/10 beside two full `kit unit`
  runs (load average 16–35): 65/65 tests every run. The six full unit suites run as load were all
  4925/4925.
- **Recommendation:** close; no fix needed. **Size:** none.

### `native-code-folding.spec.ts` race with its worker: can't reproduce

- **History.** Tech-debt 09 (c7bb201a, 2026-10-17) found the cause (Monaco's HTML mode loading
  after the fold debounce) and made the default fold wait for the HTML folding provider; the
  failures in agent-kit tickets 38 and 39 were on 2026-10-16, before that fix.
- **Measured.** `kit specs native-code-folding.spec.ts` (3 tests) 10/10 beside a full unit-suite
  loop (load average 10–28), then 6/6 more beside another unit suite. A second loop started in
  the same worktree at the same time failed 6/6 with `browserContext.close: ENOENT … traces/…`:
  two `kit specs` runs in one worktree share `.scratch/native-save/results`, so that was my
  harness, not the spec (the runner guide already says to leave a worktree alone while a suite
  runs). No run showed the old symptom (head already folded).
- **Recommendation:** close; no fix needed. **Size:** none.

### `tests/kit-preview.test.ts` old-bundle case times out under full load: can't reproduce

- **History.** Agent-kit ticket 37 widened its deadline (1.5 s); ticket 42 (2026-10-17) fixed the
  real cause in `scripts/agents/kit.d/preview` (a poll cut by the deadline reset the bundle name to
  "unreachable").
- **Measured.** In the same 22 loaded runs as `kit-wait` above, and in 6 loaded full unit suites:
  never failed.
- **Recommendation:** close; no fix needed. **Size:** none.

### `kit specs --affected` and `tests/native-save/server.ts`: fixed

- **History.** Agent-kit ticket 43 (closed 2026-10-17) added a `server` reason kind.
- **Measured.** With a one-line comment edit to `tests/native-save/server.ts` (reverted),
  `kit specs --affected --list` selected 15 specs, all `server: agent paths
  (tests/native-save/server.ts)`, including `native-mcp.spec.ts`, `native-mcp-media.spec.ts` and the
  six `native-agent-*` specs. `RESULT: ok specs 15 selected (list only)`.
- **Recommendation:** close. **Size:** none.

## Side finding

- Two `kit specs` runs started from one worktree at the same time collide on Playwright's output
  folder (`.scratch/native-save/results`), and the second fails with a trace ENOENT. Documented
  as "leave a worktree untouched while a suite runs", but `kit specs` does not refuse or warn. A
  lock or per-run output folder would be an S kit change; low priority.

## Kit commands run

- `kit doctor` (7/7 after linking the shared `node_modules`; the agent worktree was not made by
  `worktree.sh`, so the link was missing).
- `kit size --no-base`: `RESULT: ok size boot 355 KB, budget 355 KB`.
- `kit specs` on two throwaway probes (Undo/Redo, media grid timing): 1/1 each; probes deleted.
- `kit unit` on a throwaway `discardFile` probe: 1/1; probe deleted.
- `kit specs --affected --list` with a reverted `server.ts` edit: 15 selected.
- Flake loops under load through `kit bg`: `kit unit` (6 full suites 4925/4925; 25 focused runs
  65/65), `kit specs native-code-folding.spec.ts` (16/16 valid runs; 6 harness collisions).
- All `kit bg` jobs ended; no test server left listening.
