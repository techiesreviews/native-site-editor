---
title: "GitHub not answering: three automatic retries, then the toast"
type: task (AFK)
status: open
assignee: lead-26 (this session)
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
