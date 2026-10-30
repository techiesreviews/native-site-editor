---
title: "One shared browser tester: real mouse, pen, touch, drag and screenshots, desktop and phone (`browser.mjs`, `kit browser`)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the script-editor retro: every project gets one shared browser tester, so builders stop writing their own throwaway Chrome scripts and checks press, drag, touch and scroll the way a person does. In script-editor every builder wrote a Chrome-over-CDP script in `/tmp`; tests passed while the real gesture failed (a drag worked only when released over paragraph words; Lex dragged down the margin), and plain headless Chrome reports `pointer: none` and no hover, so everything behind `(hover: hover) and (pointer: fine)` was silently off until a builder found `--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2`.

The techies-prompter retro (Lex, 2026-10-30) adds two lessons, folded in here: one 30-second browser run was repeated about 10 times to fix a single control, and builders read ~200 KB full-page screenshots and then cropped them by hand. Its working answer is on techies-prompter branch `shared-kit` (`scripts/agents/prompter-kit.mjs`, the `specs` part; `test/browser/range-field.mjs`; read only).

## Start from the work in progress

A builder started this on 2026-10-30 and was stopped by the one-board rule (ticket 66). Its WIP commit `a8eb190` is on agent-kit branch `browser-tester` (worktree `~/Projects/agent-kit-browser-tester`, not pushed). Start the slice's branch from it (rebased on agent-kit `main`). What it holds: `browser.mjs` (finds Chrome or `KIT_CHROME`; headless with the mouse-and-hover setting and a throwaway profile in its own process group, `close()` stops the group and deletes the profile; connect to a running Chrome; desktop 1280×900 and phone 390×844 with mobile and touch; light/dark and reduced motion; `eval`, `until`, `go`, `reload`; mouse and pen with the right `buttons` while held, `drag(from, to)` in steps, touch tap, hold, hold-then-drag and swipe, wheel and key combinations; screenshots, a `Date.now` shift, page errors, and dropping a held button to imitate a lost release). Only a syntax check ever ran on it. Drop its `docs/work/retro-2026-10-30/` map and the `maps` line in agent-kit's `scripts/agents/kit.json` (this board holds kit tickets, ticket 66). Its decisions stand unless a test shows otherwise: Chrome runs without its sandbox only as root or with `KIT_BROWSER_NO_SANDBOX=1`; headless Chrome cannot really switch tabs or leave the window, so `page.leave()` and `page.back()` send the page's own leave and return events (said in a code comment). The reference harness it started from is `/tmp/stepm/e2e.mjs` (read it; its MCP-over-fetch connect is script-editor's own and stays out).

## Decided behaviour

- `browser.mjs` beside `kit`, reached through `scripts/agents/kit --home`; a project's own check script calls `` const { launch } = await import(`${home}/browser.mjs`) ``. Real input only, through `Input.dispatchMouseEvent`, `Input.dispatchTouchEvent` and key and wheel events; nothing project-specific (no app selectors, no agent connection).
- `kit browser start|status|stop|shot`: one shared Chrome per worktree as a `kit bg` job named `browser`, a small record at `.scratch/browser/<name>.json`, stopped by its process group, never by a name pattern; `shot <url> <file>` takes a screenshot in one line.
- **Close-ups:** `browser.mjs` saves an element close-up (`page.shot(selector, file)`, clipped to the element's box) beside full-page shots, and station 7 says to read the close-up first.
- **Browser checks by suite** (a kitchen rule for every project's own `specs` command, station 7): one file per suite in the project's browser-test folder; `kit specs <name>` runs only the suites whose file name holds it; `--affected` picks suites from the changed paths; a suite that exports `needsServer = false` runs without starting the project's server; a failure names its `error.txt` (ticket 74). techies-prompter's `prompter-kit.mjs` is the example to point to.
- `docs/kitchen.md` station 7 (Checks) names it as the way to do browser checks (and ticket 67's gesture rule points to it); README's layout table lists it.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `browser.mjs`, `kit.d/browser`, `tests/browser.test.ts`, `tests/kit-browser.test.ts`, `docs/kitchen.md` (station 7), `README.md` (layout table), `scripts/agents/kit.json` (the `maps` line removed).

## Done when

- The pure parts (Chrome flags, devices, drag steps, mouse buttons, keys, the clock shift, finding Chrome, the close-up clip box) have unit tests.
- Station 7 holds the suite rule; the smoke test saves one close-up beside its full-page shot.
- A Chrome smoke test drives a small local page with every kind of input (it shows `(hover: hover) and (pointer: fine)` true on desktop and coarse with no hover on the phone, a drag released over empty margin, a lost release) and skips with a clear note when no Chrome is found; CI's run is named (ran or skipped, and why).
- `kit browser start`, `status`, `shot` and `stop` work against a real Chrome, and stop leaves no process or profile behind.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, one screenshot from the smoke page (desktop and phone), and that the `browser-tester` branch and worktree were removed after the merge. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
