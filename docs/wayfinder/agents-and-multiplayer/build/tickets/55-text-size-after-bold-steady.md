---
title: "\"Text size after Bold\" passes every time (flaky since 43)"
type: task (AFK)
status: open
assignee: am-55
builder: claude
blocked_by: []
---

## Goal

The spec that picks a Text size right after pressing Bold (added around slice 43, the phone edit bar fixes) failed once in a full `kit pr` run on slices 49 and 42 and passed on its rerun. Slice 43 fixed a real timing fault in the same path (about one run in five refused with "The source changed…"); a remaining failure may be the same race in a rarer form or the test itself.

## Decided behaviour

- Diagnose first: run the spec 30 times alone and under `kit specs` load, name whether the app or the test is at fault.
- If the app: Text size after Bold always applies (the same promise as ticket 43). If the test: it waits on what the user would see, not on time.

## Files

- the spec file holding "Text size after Bold" (find it), and the edit-bar text-size code if the app is at fault, with a unit test

## Done when

- 30/30 runs alone and 30/30 under load, with the cause named in the Done.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted) pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit specs`, `kit review`, `kit pr`; report the cause and the run counts.
