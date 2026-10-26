---
title: Toasts are opt-in, and a lint rule stops new ones
status: ready-for-agent
assignee:
blocked_by: []
---

# Toasts are opt-in, and a lint rule stops new ones

## What

Learning 2026-10-26, correction 2 ("No toasts; show the result in place", given 2026-10-23 and
2026-10-25). UX rule S4 already forbids new toasts, but nothing checks it, and the code makes a toast the
default: `announce(text, as?)` in `src/announce.ts` writes `#status` and then shows a toast unless `as` is
`"quiet"`. About 97 `announce(` calls in about 45 files pass no `"quiet"` (4 do), plus direct
`showToast`/`say` calls in `background-page.ts`, `github-reads.ts`, `main.ts`, `media-insert.ts`,
`media-library-view.ts` and `media-spot-popup.ts`. So any new announcement shows a toast unless its
author remembers to opt out. (The learning file's "20 files import toast.ts" was a rough grep; this
count replaces it.) Lex picked this check on 2026-10-26.

## Fix

- Flip the default: a bare `announce(text)` only writes `#status` (the screen-reader line). Showing a
  toast takes an explicit `"toast"` (or `{ toast: true, undo }`) argument; every call that shows one today
  gets it, so nothing visible changes in this ticket. `"quiet"` goes away.
- A lint rule in `eslint.config.mjs` (`no-restricted-syntax`): the `"toast"` argument and direct
  `showToast`/`say` calls are allowed only in the files that use them today, listed in an override that
  may only shrink, with the message "No toasts (UX rule S4): show the result where the action happened".
  A comment points at the atomic catalogue build that removes the rest.
- Add the check to S4's **Check** line in `docs/agents/ux-rulebook.md` and to `docs/agents/guardrails.md`.

## Done when

- A bare `announce(text)` shows no toast (unit test on `createAnnounce`).
- Every toast shown today still shows (the native-save specs that expect a toast pass unchanged).
- `npm run lint` fails on a `"toast"` argument or a `showToast` call in a file not on the list.
