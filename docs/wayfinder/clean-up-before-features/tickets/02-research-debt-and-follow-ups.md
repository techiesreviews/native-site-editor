---
title: Re-check the tech-debt notes and small follow-ups on today's code
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Which of these still happen on today's `dev`, how big each is now, and what fixing it would mean (rough size S/M/L, files touched, any behaviour a user would see change, with a recommended answer for each such behaviour)? Use `mattpocock-skills:diagnosing-bugs` to reproduce defects and flaky tests before judging them; run every command through Agent Kit (`scripts/agents/kit`).

Tech-debt notes in `docs/work/tech-debt/issues/`:

- 01 `main.ts` size: measure today's line count and its largest regions.
- 02 byte budget headroom: measure today's bundle against the budget.
- 04 test server on 5216 died mid-suite: any recurrence or cause visible now?
- 06 boot memory known limits, 10 preview preload and Page Structure limits: does each listed limit still hold?
- 11 silent Undo/Redo: the 2026-10-09 comment says only Redo is silent after new typing; confirm.

Follow-ups seen 2026-10-17 (not tickets yet):

- Media rebuilds every tile on each library refresh (slow for big libraries).
- `discardFile()` asks its question when no user is signed in, then does nothing.
- `tests/kit-wait.test.ts` case "producer closes the file and appends again" fails under heavy load.
- `native-code-folding.spec.ts` races with its worker under heavy parallel load.
- `tests/kit-preview.test.ts` old-bundle case can time out under full load.
- `kit specs --affected` does not map changes to `tests/native-save/server.ts` to the MCP specs.

Say for each which tickets of [Re-check the architecture review on today's code](01-research-architecture-review.md)'s candidates it would naturally ride with, if any.
