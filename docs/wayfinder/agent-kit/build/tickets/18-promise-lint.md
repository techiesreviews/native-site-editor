---
title: "Lint: no floating or misused promises"
type: task (AFK)
status: closed
assignee: ak-18
blocked_by: [17-media-kinds, 26-files-adding-stale-message, 27-media-kinds-boot-bytes]
builder: sol
---

## What

- Enable `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` (with `checksVoidReturn: { attributes: false }` only if needed) for all TS.
- Fix every finding: `await` where the caller is async and order matters; otherwise `void p.catch(report)` through the existing error reporter, never a bare `void` that swallows a rejection the user should see. Event-listener async callbacks get a wrapper that reports rejections.
- No behaviour change beyond surfacing errors; note any real bug found in the Done notes.
- guardrails.md is updated by ticket 24; put a two-line summary of the rules in the Done notes for it.

## Files

- `eslint.config.mjs`
- src/**, shared/**, worker/**, tests/** files with findings (fix in place)

## Scope (2026-10-16, before fixing)

Both rules on `'src/**/*.ts' 'shared/**/*.ts' 'worker/**/*.ts' 'tests/**/*.ts'` at dev 12465061:

| folder | no-floating-promises | no-misused-promises |
|---|---|---|
| src | 2 | 21 |
| shared | 0 | 0 |
| worker | 0 | 0 |
| tests | 3288 | 3 |

3286 of the tests findings are node:test `test()` calls; its promise never rejects (the runner
reports failures), so the rule allows them by name (`allowForKnownSafeCalls`). 28 real findings remain.

## Done when

- `npm run lint` clean with both rules on; check, unit and the touched specs pass.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Rules.** `eslint.config.mjs` turns on `no-floating-promises` and `no-misused-promises` for all TS
  (no `checksVoidReturn` relaxation needed). node:test's `test`/`it`/`describe`/`suite` are allowed by
  name (`allowForKnownSafeCalls`): their promise never rejects; the runner reports failures.
- **Wrapper.** New `src/ui/report-failure.ts` (no DOM or asset imports): `reported(handler)` runs the handler
  synchronously (preventDefault still works) and sends a rejection to `reportFailure`; main.ts points that at
  its notice bar (`setErrorReporter(errorMessage)`), console before boot. `button()` in `src/ui/dom.ts` wraps
  every action, so async button actions report too. It is one new file beyond the listed ones: a helper in
  dom.ts would pull icon SVG imports into controllers and node tests.
- **Fixes (28).** Submit/click listeners (create dialog, get started, pages tree, setup checklist, setup wizard,
  URL change, add panel, files tree), the change-status poll timer, `queueMicrotask` restore, `onSignOut`,
  `onDiscardChange` and the palette's `newPage` go through `reported`. `rememberFile` keeps a `void` with a
  comment: readers await the same promise. Tests: palette `open` awaited; `toBlob` callback made sync with
  `reject`; the fake server's async middleware routes rejections to `next(error)`.
- **Real bugs.** Async `button()` actions without their own catch (e.g. "Choose image…" in page-builder
  components, site settings' favicon/404/apply actions, "Finish adding") lost rejections silently; they now
  reach the notice bar. The fake GitHub server left a request hanging with an unhandled rejection when its
  worker middleware threw; it now answers through connect's error path.
- **Commits.** c19f79a9 (rules, scope), 8cf5fd79 (fixes; Sol built, Claude moved the helper to its own module).
- **Tests.** New `tests/report-failure.test.ts` (sync call, rejection reported, sync throw kept, console
  default). check, lint, unit 3924/0 green.
- **Review.** Sol via `kit review`: no defects. Rejected 1 validation gap (browser spec forcing a wrapped
  action to reject): the wiring is one typed line and the spec would need new fake-server plumbing outside
  the ticket. Evidence: main root `.scratch/reviews/ak-18/20261016T170222Z`.
- **For guardrails.md (ticket 24):** Lint fails on a promise nobody awaits or catches, and on an async
  function passed where `() => void` is expected (listeners, timers, callbacks).
  Fix: `await` it, or wrap the handler in `reported()` (src/ui/report-failure.ts) so rejections reach the notice bar; bare `void` only with a comment naming who handles the rejection.

