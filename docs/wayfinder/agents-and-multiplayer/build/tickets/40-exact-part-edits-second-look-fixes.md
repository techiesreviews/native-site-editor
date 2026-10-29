---
title: "Exact-part edits: second-look fixes (follow-up on 10)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-exact-part-edits]
---

## Goal

Slice 10's catch-up second look (OpenCode `deepseek-v4.1-flash-free`, 2026-10-29, evidence `.scratch/reviews/unknown/20261029T033943Z` in the main checkout; see [ticket 10 Done](10-exact-part-edits.md#done-2026-10-28)) found five P2 faults that are not in ticket 10's Follow-ups. The reviewer checked each line against the code at `fab35e042`; each one holds.

## Decided behaviour

1. **A stale page command keeps its read when the text cache is full** (`src/agent-tools-edit.ts` about line 189, `prepareNow`). `rememberText(file.hash, file.content)` runs before `readText(expected)`. When the cache is at its cap (200 texts / 16 MB), today's text is not in it yet (a hit returns early, `src/agent-part.ts` `rememberText`) and the agent's read is the oldest entry, storing today's text evicts it. Then the command is refused for its old hash instead of having its element ids mapped. Look up `expected` first, or pin it for the lookup.
2. **A count mismatch is not offered as a safe retry** (`shared/agent-edit.ts` about line 164, `wordsMoved`). When the words occur a different number of times now than in the read, `{ index, at: was[0] }` points at the first copy as read. That is usually the unchanged original. `editClash` then offers it "as it is now" and invites a retry. A unique edit retried from it is still not unique, and an `all` retry can replace a copy another agent added since. Refuse with "read again" and no part, or find the copy that actually changed. The retry wording must be safe for `all`.
3. **A cut part does not invite a retry from its text** (`shared/agent-edit.ts` about line 196, `editClash`). `partOf` cuts a part over `PART_LIMIT` (4,000 characters) and marks it `truncated`, but the message always says "send the edit again with oldText from part.text". When `part.truncated`, say to read the file again instead.
4. **The catch-up works out sections only for the files it shows** (`shared/agent-read.ts` about line 59, `catchUpOf`). `sections` (parse and compare) runs for every changed file before the list is cut to `CATCH_UP_FILES` (20). With many changed pages, every read stalls the tab. Cut the list first, then work out sections for the files shown.
5. **A draft named `__proto__` is listed in the catch-up like any other file** (`src/agent-part.ts` about line 126, `markOf`). `files[draft.path] = …` on a plain object sets the prototype for that path, so the file never shows in the catch-up. Use `Object.create(null)` or a `Map`, or refuse `__proto__` as a path. (Unlikely in practice; fix it with the rest.)

## Files

- `src/agent-tools-edit.ts`, `shared/agent-edit.ts`, `shared/agent-read.ts`, `src/agent-part.ts` and their unit tests (`tests/agent-tools-edit.test.ts`, `tests/agent-part.test.ts`)

## Done when

- One unit test per item, each failing before its fix:
  - Cache full with the agent's read oldest: a stale page command has its element ids mapped, or is clearly told to read again, never refused for a stale hash.
  - One copy read, another agent adds a copy elsewhere: the conflict's part is not the unchanged original, and an `all` retry does not touch the added copy.
  - Changed `oldText` longer than `PART_LIMIT`: the refusal says to read again.
  - 60 changed pages with a spy on `sections`: it runs for the shown files only.
  - Draft path `__proto__`: the catch-up lists it, or the write is refused.
- `kit unit --affected`, `kit specs --affected` (the exact-part spec) and `kit doctor` pass.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`. Quote the RESULT lines in Done.
