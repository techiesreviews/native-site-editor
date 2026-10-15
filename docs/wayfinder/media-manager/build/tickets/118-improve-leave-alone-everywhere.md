---
title: "Improve images: leave a picture alone everywhere"
type: task (AFK)
status: open
assignee:
blocked_by: [111-sub-screens-one-layout]
builder: claude
phase: 8
---

## What

Lex's answer to the audit's [Q4](../ux-ui-audit.md#questions-for-lex) (2026-10-15).

- A picture's row in Improve images gets "Leave alone everywhere". Once set, Improve images skips that picture on every page and component, and agents' Improve images run (slice 75) skips it too and lists it as left alone.
- Remembered for the whole site in the media records (`.editor/media.json`), next to the other per-file settings; ticking it again undoes it. Part of the same Undo as the tick.
- The page-by-page untick stays for one-off cases.

## Done when

- Unit tests of the skip rule (editor and agent paths share it); a `tests/mcp-runtime.test.ts` case for the agent run.
- Spec: leave a picture used on two pages alone everywhere; both rows skip it; Undo restores.
- Shots at 390, 768 and 1280, light and dark, before and after.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
