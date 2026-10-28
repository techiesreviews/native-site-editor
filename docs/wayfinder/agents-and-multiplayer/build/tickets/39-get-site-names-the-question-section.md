---
title: "`get_site` names the section an agent is asking about (follow-up on 11)"
type: task (AFK)
status: open
assignee: am-39
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Slice 11's final review left a P2 ([ticket 11 Follow-ups](11-several-agents-presence.md#follow-ups)): in `src/agent-presence.ts` (about line 148) `atWork()` fills `told` from `latest` (any change in the last ten minutes) and then drops the question's section whenever that agent has a recent change, while `marks()` lets only a *running* change win over the question. So after an agent's change on Home ends and it asks about About, the page draws it on About's section but `get_site` tells other agents `{ file: "index.html", section: <Home section>, asking: true }`, the wrong section to keep away from.

## Decided behaviour

- `atWork()` uses the same rule as `marks()`: a running change wins; otherwise an open question's section wins over an ended change.
- Also take ticket 11's P3: one batched request carrying two agent names labels each change with its own agent.

## Files

- `src/agent-presence.ts` and its unit tests (and the batch labelling code the P3 names)

## Done when

- A unit test for "change on Home ended, question on About" gives `get_site` About's section, matching `marks()`; fails before the fix.
- The P3 batch case labels each change with its own agent, with a test.
- `kit unit --affected`, `kit specs --affected` (the several-agents spec), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.
