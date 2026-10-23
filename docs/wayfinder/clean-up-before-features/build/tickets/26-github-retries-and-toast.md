---
title: "GitHub not answering: three automatic retries, then the toast"
type: task (AFK)
status: closed
assignee: lead-26
builder: sol
blocked_by: [25-boot-and-snapshot]
---

## Goal

[TD 06](../../../../work/tech-debt/issues/06-boot-memory-limits.md) limit 1: the editor has no read timeout. When GitHub stops answering while a site reopens, the page waits with no end. Also shrinks `main.ts` (about −145): status, errors and the GitHub read helpers (`api`, `apiResponse`, `postApi`, about lines 3066–3209 at `89ac5e0e`) move into a small module.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): when GitHub stops answering while a site reopens, **retry automatically up to 3 times, then tell the user in the existing toast**.

Lead decisions (check with Lex: the Try again button):

- A read that gets no answer (no response headers) within 8 seconds counts as a failed try, like a 502, 503 or a network error today.
- Three automatic retries, waiting about 1, 2 and 4 seconds; today's two retries become these three.
- After the last try the existing toast (`src/components/toast.ts`, through `announce`) says "GitHub isn't answering. Try again in a moment." with a **Try again** button that repeats the open; the page leaves its loading state for the state a failed read shows today, never an endless wait.
- Applies to every GET through `fetchWithReadRetry`; saves (non-GET) are never retried, as today.

## Files

- `src/read-retry.ts` (timeout, three retries), `tests/read-retry.test.ts`
- `src/main.ts` (3066–3209), new `src/github-reads.ts` (name is the builder's; `docs/agents/code-map.md` entry)
- `src/components/toast.ts` only if the action needs it
- Spec: `tests/native-save/native-boot-memory.spec.ts` or a new `native-github-silent.spec.ts` (hold the snapshot with `page.route` past the timeout three times: the toast shows; Try again with the route released opens the site)
- `tests/main-ts-ceiling.test.ts`

## Done when

- Settle matrix for a held read (answers, fails, never answers) in the commit message; timers are cleared on every path (CODING_STANDARDS "Racing and speculative reads").
- Unit tests with a fake clock: timeout counts as a failure; three retries; non-GET untouched.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-26 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/26-github-retries-and-toast.md --builder sol`; `kit wait job slice-26 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus the new or extended spec, `kit size`.
- `kit shots --steps .scratch/cbf-26-toast.json` (the toast after three failed tries).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: shots contact sheet, unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines and ceiling.

## Done (2026-10-23)

- `src/read-retry.ts`: every GET through `fetchWithReadRetry` gets 8 s to answer (response headers); a try with no answer is aborted and counts as failed, like a 502, 503 or network error. Three retries, 1, 2 and 4 s apart (was two, 0.6 and 1.5 s). After the last try a 502 or 503 is returned as before; no answer throws `ReadUnansweredError` ("GitHub isn't answering. Try again in a moment."). A caller's own abort ends the read at once, during a try or a wait, with no further try. Non-GET requests (saves) are passed through once, with no timeout.
- New `src/github-reads.ts` (`createGitHubReads`, `ApiError`): #status, the notice bar, `errorMessage`, `api`, `apiResponse` and `postApi`, moved out of `src/main.ts` with their bodies. Two changes to `errorMessage`: it takes an optional `retry`, and for a `ReadUnansweredError` with a `retry` it says the message in #status and the toast with **Try again** in place of "The last request did not complete." (the notice and failed state stay as today: "Your repository could not be opened.", Refresh enabled).
- Try again only for opens: `src/main.ts` wraps `chooseRepository` and `loadSnapshot` (choosing a repository or branch, Refresh, the first open); a read GitHub never answers during one offers Try again, which repeats that open with fresh reads (the same resume location; for a snapshot load, the file it was reopening). Any other read (a file, media, a blob) shows the plain notice. `announce` shows its toast through `showToast(text, action)`.
- `src/main.ts` 5345 → 5293 lines, ceiling 5300. Port budget: `createGitHubReads` takes 7 port names (`app`, `element`, `explorer`, `trackRead`, `handleChunkLoadFailure`, `expired`, `say`); `kit size` boot 344 KB (+1 KB vs dev), budget 355 KB. Code map: new row and shifted main.ts ranges.
- Settle matrix, per try of a held read: answers (headers in 8 s): timer cleared, answer used (502/503 retried); fails (network error): timer cleared, retried, after the last try `ReadUnansweredError`; never answers: the timer aborts it and the abort is the failure, timer cleared. Each wait between tries is one timer, cleared if the caller aborts. After the fourth failed try the page shows the failed-read state and the toast; it never stays loading.
- Tests: `tests/read-retry.test.ts` on a fake clock (node `mock.timers`): timeout counts as a failure, tries at 0, 9, 19 and 31 s, three retries then the error, answered and failed tries leave no timer, caller abort during a try and during a wait, non-GET untouched. New `tests/native-save/native-github-silent.spec.ts`, one test per matrix row plus the shown-site case: snapshot never answers (four tries past the timeout on the Playwright clock, toast, failed state, Try again opens the site, five snapshot reads in all); every try fails on the network (same toast and recovery); 503 twice then answered (opens, no toast, no notice); Refresh of a shown site never answered (Try again reloads it on index.html).
- Evidence: `RESULT: ok unit 13/13 (2 files)` (`kit unit --affected`); `npm test` 5076/5076 before the review fixes; `RESULT: ok specs 24/24 passed` (`kit specs --affected`, including native-github-silent with 4 tests); `RESULT: ok size boot 344 KB (+1 KB) vs dev@3152d0b, budget 355 KB`; shots of the toast at 390 and 1280, light and dark: main root `.scratch/shots/lead-26/20261023-053031/` (raw spec `.scratch/cbf-26-toast.spec.ts`; no contact sheet for raw specs).
