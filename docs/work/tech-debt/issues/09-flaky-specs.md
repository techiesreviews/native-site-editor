---
title: Three flaky browser specs
status: closed
assignee: td-09
blocked_by: []
---

# Three flaky browser specs

## What

Pre-existing on dev, seen through Phase 5:

- `native-shared-link-host.spec.ts:82`: about 1 in 6 runs.
- `native-canvas.spec.ts:195`: the hover lands before Monaco paints the line (dev 3/30); a related canvas hint-on-pointer-leave spec failed once on 2026-10-08.
- `native-shared-authoring-host.spec.ts:282`: a fixed 1.5 s wait (dev 9/10).

Added 2026-10-17:

- `native-code-folding.spec.ts`: "a cursor placed before the folding ranges
  load stays put, and its section stays open" fails under heavy parallel load
  (a race with its worker loading; the spec's own comment admits it). Seen in
  tickets 38 and 39's `kit pr` runs.
- `tests/kit-wait.test.ts`: "output waits for a producer that closes the file
  and appends again before exiting" fails under full-suite load ("output ended
  before a line matching /^waiting /"). Ticket 28 fixed the other writer tests
  by stepping on wait scans instead of timers; apply the same approach.

## Done when

Each waits for an observable state instead of time or ordering luck, and
passes 30 of 30 runs.

## Done (2026-10-17)

Re-checked on dev 36fa1485. "Under load" below means two `port.sh` browser runs side by side
plus a full unit suite (load average 13 to 20 on 16 cores). Logs are in the worktree's `.scratch/td09/`.

- **`native-shared-link-host.spec.ts`, `native-shared-authoring-host.spec.ts`.** Already gone:
  90e89a7c ("Remove the masters code and Save shared") deleted both specs. Nothing to fix.
- **`native-code-folding` "a cursor placed before the folding ranges load".** *Cause (product):*
  Monaco's HTML mode, which registers the HTML folding provider, loads separately on the main
  thread. If it arrived after the folding controller's 200 ms debounce, Monaco folded by
  indentation, and the app's default fold used those ranges without waiting for the held
  worker, so the head was already folded. Reproduced 2 of 10 under load on dev. Holding only
  `htmlMode` reproduced it every time. *Fix:* `foldDefaults` (`src/components/code-editor.ts`)
  waits until the folding controller's own provider registry has a folding provider for the
  model, then folds. New spec "the default fold waits for the HTML folding ranges, not the
  indentation fallback" holds `htmlMode`. It fails on the old code and passes on the new.
  *Proof:* all three folding tests 40/40 under load (4 runs of 10).
- **`native-canvas.spec.ts:195`, now "the code pane's cursor selects ... a hovered line points
  at its element", and the pointer-leave hint test.** Both passed 10/10 under load on today's
  dev. `editorMounted` (since the ticket) already waits for Monaco. The fold fix makes the
  default fold land when the HTML ranges arrive, and that moves the code lines. So the spec's
  `beforeEach` now waits for the fold (head painted, `<title>` gone) before any hover or click.
  *Proof:* both 30/30 under load. The whole canvas spec ran 130/130 under load (10 of each test).
- **Found on the way: canvas "dragging a code range ...".** With the fold settled before the
  test, it failed 3 of 20 under load (dev 20/20). *Cause (test):* it focused Monaco's hidden
  helper `textarea`, so its unfold-all shortcut never ran. It passed on dev only because the hero
  was usually still unfolded at the click. Monaco's cursor reveal then opened the hero section
  200 ms later and moved the lines under the drag. *Fix:* it focuses Monaco's `[role=textbox]`,
  then waits for the h1 mark (section open) and the cards section (unfold-all applied) before
  measuring. *Proof:* 30/30 under load.
- **`tests/kit-wait.test.ts` producer close/append.** *Cause (product):* `kit wait output` scans
  every process's `/proc` files. A process reaped between opening its `/proc/<pid>/stat` and
  reading it fails the read with ESRCH, which the scan did not treat as "gone". The wait printed
  `RESULT: fail` and exited, and the test saw "output ended before a line matching /^waiting /".
  A probe beside a browser run hit ESRCH about once per 1000 full scans. *Fix:*
  `scripts/agents/kit.d/wait` treats ESRCH like ENOENT for stat, fd list and fdinfo. New test
  "output keeps tracking its producer while other processes vanish mid-scan" uses a preload
  (`syncBuiltinESMExports`) so that three processes the test owns lose their stat, fd list and
  fdinfo on every scan. It fails on the old script with the same error and passes on the new
  one. *Proof:* the file 30/30 under load (3 loops of 10), 25/25 tests each.

**Files.** `src/components/code-editor.ts`, `scripts/agents/kit.d/wait`,
`tests/native-save/native-code-folding.spec.ts`, `tests/native-save/native-canvas.spec.ts`,
`tests/kit-wait.test.ts`. No skips, raised timeouts, new fixed waits or known-failure entries.
**Commits.** 655f7769 (ticket), 7fafb559 (wait ESRCH), c7bb201a (fold waits for HTML ranges),
010669fc (canvas spec), 3600e6a5 and e781a3bf (ESRCH regression test).
**Tests.** `npm run check`, `npm run lint`, full unit suite 3951 pass (several runs under load).
**Review.** Sol via `kit review`, three rounds (main root `.scratch/reviews/td-09/`). 1: no
defects. Gap "no test forces ESRCH" was fixed with the preload test. 2: P2, the test relied on
unrelated pid parity. Fixed: each vanishing read belongs to a process the test owns. 3: no
defects. Gap "record 30/30" is answered by the runs above. Nothing rejected.

