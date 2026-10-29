---
title: Replace the kit's hand-made record lock with a system lock
status: ready-for-agent
assignee:
blocked_by: []
---

# Replace the kit's hand-made record lock with a system lock

> **The kit moved (ticket 30, 2026-10-29):** this work happens in the kit's own repo,
> [techiesreviews/agent-kit](https://github.com/techiesreviews/agent-kit) (checked out at `~/Projects/agent-kit`;
> paths below without `scripts/agents/` are from its top folder), and lands there through its own `kit pr`.

## What

Sweep 2026-10-26, item 3. The record lock in the kit's `kit-lib.mjs` (`takeLock`, line 297: a lock
folder with an owner file and stale-lock takeover) was found broken five times in one week, each fix opening
the next hole: no lock (38e24241 :283), never stale after a crash (310808b7 :292), and three ways the
takeover lets two writers in (ed0364de :323, 1331c210 :321, 36961d73 :312).

## Fix

Replace `takeLock` with a lock the operating system releases when its process dies: `flock` on the record
file (through `flock(1)` or a small, maintained locking package; pick one and say why in the PR). Keep one
shared helper in `kit-lib.mjs` used by every kit writer. Add a lint rule in `eslint.config.mjs`
(`no-restricted-syntax` on `mkdirSync`/`renameSync` of paths ending `.lock` in the kit's files) so new
locks go through that helper, and note it in `docs/agents/guardrails.md`.

## Done when

- A unit test runs two writers on one record many times and loses no update.
- A writer killed with SIGKILL while holding the lock does not block the next writer.
- No stale-lock takeover code is left; the lint rule fails on a new hand-made `.lock` folder.
