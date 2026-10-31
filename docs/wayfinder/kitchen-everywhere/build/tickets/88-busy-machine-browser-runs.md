---
title: "Full browser runs stop failing when the machine is busy: one full run at a time per machine, and a lone retry for a failed file"
type: task (AFK)
status: open
assignee: ke-88
builder: claude
blocked_by: []
---

## Goal

Ke-60's editor PR #289 couldn't land on 2026-10-31. Of nine full browser runs (207 spec files), only three passed. Each failure hit one or two spec files the change doesn't touch, and each failed file passed when rerun alone. They are the timing-sensitive ones, failing while other slices' builds load the machine (load 10–36):
- `native-mcp-menu` (3 times)
- `native-boot-memory` (3)
- `native-edit-latency` (2; for example the next keystroke at 81 ms against 100, the longest task at 54 ms against 50)
- `native-history`
- `native-edit-bar`
- `native-structure-inplace`
- `native-resize-toggle`

The same thing happened to am-21 (one boot-speed failure) and ke-80 (the prompter's file-picker step). A waiver can't help, because a failed browser run always stops `kit pr`. So the more slices run at once, the less any of them can land.

## Decided behaviour

- **One full browser run at a time per machine.** The full run in `kit pr` and `kit specs` (all files) takes a machine-wide lock (in the kit's state folder) and waits for it, printing `waiting for <owner>'s full browser run`. `--affected` runs and unit tests don't take the lock.
- **A lone retry for a failed file.** After a full run, each failed spec file is rerun once on its own, with no other spec running.
  - It passes alone: the run counts as passed. The file is listed on the RESULT line as `flaky under load: <file>`, and one line is appended to `<kit state>/flaky.jsonl` (file, test, load, time).
  - It fails alone too: the run fails as today.
  - A file the change itself touched is never forgiven this way: it must pass in the full run.
- **Timing tests marked.** A project's `kit.json` can list spec files as `timing` (the editor: edit-latency, boot-memory). They run after the rest, alone, with no other kit job allowed to start meanwhile.
- **Report.** `kit status` names files that are flaky three or more times in 7 days, so they get a real fix (a ticket per file).

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/specs` (or the specs runner), `kit.d/pr`, `kit-lib.mjs` (lock), `kit.d/status`, `tests/`. In the editor: `scripts/agents/kit.json` (`timing` list), docs-tier PR.

## Done when

- Tests, failing first:
  - two full runs at once: the second waits;
  - a file that fails in the full run but passes alone: pass, plus the flaky line;
  - one that fails alone: fail;
  - a touched file: no forgiveness;
  - `timing` files run last and alone.
- PR #289 (ke-60's editor half) lands with it; ticket 60 closes.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
