---
title: "Browser checks on Playwright everywhere: one shared install, the touch moves it lacks (`gestures.mjs`), close-ups and suites by name"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [67-testing-and-review-rules, 77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the script-editor retro: every project gets one shared browser tester, so builders stop writing their own throwaway Chrome scripts and checks press, drag, touch and scroll the way a person does. In script-editor every builder wrote a Chrome-over-CDP script in `/tmp`; tests passed while the real gesture failed (a drag worked only when released over paragraph words; Lex dragged down the margin), and plain headless Chrome reports `pointer: none` and no hover, so everything behind `(hover: hover) and (pointer: fine)` was silently off until a builder found `--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2`.

The techies-prompter retro (Lex, 2026-10-30) adds two lessons, folded in here: one 30-second browser run was repeated about 10 times to fix a single control, and builders read ~200 KB full-page screenshots and then cropped them by hand. Its working answer is on techies-prompter branch `shared-kit` (`scripts/agents/prompter-kit.mjs`, the `specs` part; `test/browser/range-field.mjs`; read only).

## Check (ke-77, 2026-10-30): build smaller, on Playwright

Verdict on the [retro check](../retro-check-2026-10-30.md): build smaller. The shared tester Lex asked for mostly exists already.

- **Playwright has the right pointer.** Tried 2026-10-30 with the editor's Playwright: a desktop page reports `(hover: hover)` and `(pointer: fine)` true, and a phone page (`devices["iPhone 13"]`) reports coarse with no hover. The `pointer: none` trap belonged to script-editor's raw-Chrome scripts in `/tmp`.
- **Projects already use it through the kit.** The kit's `playwright` setting (`kit doctor` checks it) is set in techies-prompter, camframe and lexvd.nl. All three point into `~/Projects/native-site-editor-dev/node_modules/playwright`, which breaks if that checkout moves. The editor has 254 Playwright files. script-editor (raw CDP), chat and lexvd also carry their own Chrome scripts.
- **What Playwright lacks:** touch has only `tap` (no touch drag, swipe or hold-then-drag), there is no pen pointer, and nothing imitates a lost release. Real mouse input, desktop and phone contexts, colour scheme, reduced motion, clock control and element close-ups (`locator.screenshot()`) are built in.
- **Set the WIP aside.** Commit `a8eb190` (558-line `browser.mjs`, only syntax-checked) on agent-kit branch `browser-tester` re-creates Playwright. Copy only its touch, pen and lost-release parts, then drop the branch, its worktree and its `docs/work/retro-2026-10-30/` map and `maps` line (ticket 66). No `kit browser start|status|stop|shot`: no case needs a long-running shared Chrome, and `kit bg` plus Playwright cover one.

## Decided behaviour

- **One Playwright for every project:** the kit names one stable install on the machine (the builder picks it, for example a folder under `~/.local/share/agent-kit/`, documents it, and has `kit doctor` say how to install it). Projects without their own Playwright point `playwright` there; the three that point into the editor's dev checkout move over (a one-line settings change each, done in those projects' threads).
- **`gestures.mjs` beside `kit`** (reached through `scripts/agents/kit --home`): small helpers taking a Playwright `page`, sent through its CDP session (`Input.dispatchTouchEvent`, `Input.dispatchMouseEvent` with `pointerType: "pen"`): `touchDrag(page, from, to, steps)`, `swipe`, `hold`, `holdThenDrag`, `penDrag`, and `lostRelease(page, at)` (a move with no button held after a press). Nothing project-specific.
- **Station 7 (Checks)** says: browser checks use Playwright from the `playwright` setting, real input only (Playwright's mouse and keyboard, `gestures.mjs` for touch and pen), a desktop and a phone page, and the gestures the ticket names (ticket 67). Save an element close-up (`locator.screenshot()`) beside a full-page shot and read the close-up first. One file per suite in the project's browser-test folder; the project's `specs` command runs only the suites whose name holds its argument, picks suites from changed paths with `--affected`, and skips the server for a suite that exports `needsServer = false`. techies-prompter's `scripts/agents/prompter-kit.mjs` (branch `shared-kit`) is the example.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `gestures.mjs`, `tests/gestures.test.ts`, `kit.d/doctor` (the install hint, if the setting is missing or broken), `docs/kitchen.md` (station 7), `README.md` (layout table, the Playwright home).

## Done when

- A Playwright smoke test drives a small local page with every `gestures.mjs` move. It shows a touch drag released over empty margin, a swipe, a hold-then-drag, a pen drag with `pointerType` pen, and a lost release seen as a move with `buttons: 0`. It saves one close-up beside its full-page shot, and skips with a clear note when Playwright's Chromium is missing; CI's run says ran or skipped and why.
- Station 7 holds the Playwright, close-up and suite rules.
- `kit doctor` in a project whose `playwright` path is missing names the shared install.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass; the `browser-tester` branch and worktree are gone.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, one close-up from the smoke page, and that the `browser-tester` branch and worktree were removed. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
