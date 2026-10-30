---
title: "Connect to MCP works after a failed takeover too (follow-up on 51)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [51-connect-after-being-away]
---

## Goal

Slice 51 (PR #272) fixed the dead Connect to MCP press after time away. Its review left the same kind of fault in one more state ([ticket 51 Follow-ups](51-connect-after-being-away.md#follow-ups)): after an earlier failed attempt to make this tab the one that receives agent changes (the takeover), the problem dot is red but pressing Connect to MCP does nothing.

## Decided behaviour

- Every press of Connect to MCP copies a fresh, working prompt or shows the problem dot (ticket 99's rule), in this state too: the press retries the takeover, then copies.

## Files

- `src/components/agent-menu.ts`, `src/agent-resume.ts` and the takeover code they call, their tests
- `tests/native-save/native-mcp-menu.spec.ts`

## Done when

- A unit test or spec for "takeover failed, then press" fails before the fix.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.
