---
title: "Exact-part edits: second-look fixes (follow-up on 10)"
type: task (AFK)
status: closed
assignee: am-40
builder: claude
blocked_by: [10-exact-part-edits]
---

## Goal

Slice 10's catch-up second look (OpenCode `deepseek-v4.1-flash-free`, 2026-10-29, evidence `.scratch/reviews/unknown/20261029T033943Z` in the main checkout; see [ticket 10 Done](10-exact-part-edits.md#done-2026-10-28)) found five P2 faults that are not in ticket 10's Follow-ups. The reviewer checked each line against the code at `fab35e042`; each one holds.

## Decided behaviour

1. **A stale page command keeps its read when the text cache is full** (`src/agent-tools-edit.ts` about line 189, `prepareNow`). `rememberText(file.hash, file.content)` runs before `readText(expected)`. When the cache is at its cap (200 texts / 16 MB), today's text is not cached yet (a cached text only moves to the front, `src/agent-part.ts` `rememberText`) and the agent's read is the oldest entry, storing today's text evicts it. Then the command is refused for its old hash instead of having its element ids mapped. Look up `expected` first, or pin it for the lookup.
2. **A count mismatch is not offered as a safe retry** (`shared/agent-edit.ts` about line 164, `wordsMoved`). When the words occur a different number of times now than in the read, `{ index, at: was[0] }` points at the first copy as read. That is usually the unchanged original. `editClash` then offers it "as it is now" and invites a retry. A unique edit retried from it is still not unique, and an `all` retry can replace a copy another agent added since. Refuse with "read again" and no part, or find the copy that actually changed. The retry wording must be safe for `all`.
3. **A cut part does not invite a retry from its text** (`shared/agent-edit.ts` about line 196, `editClash`). `partOf` cuts a part over `PART_LIMIT` (4,000 characters) and marks it `truncated`, but the message always says "send the edit again with oldText from part.text". When `part.truncated`, say to read the file again instead.
4. **The catch-up works out sections only for the files it shows** (`shared/agent-read.ts` about line 59, `catchUpOf`). `sections` (parse and compare) runs for every changed file before the list is cut to `CATCH_UP_FILES` (20). With many changed pages, every read stalls the tab. Work out sections only for files that can be shown: at most `CATCH_UP_FILES`, and ideally only those left after the 2 KB cut.
5. **A draft named `__proto__` is listed in the catch-up like any other file** (`src/agent-part.ts` about line 126, `markOf`). `files[draft.path] = …` on a plain object sets the prototype for that path, so the file never shows in the catch-up. Use `Object.create(null)` or a `Map`, or refuse `__proto__` as a path. (Unlikely in practice; fix it with the rest.)

## Files

- `src/agent-tools-edit.ts`, `shared/agent-edit.ts`, `shared/agent-read.ts`, `src/agent-part.ts` and their unit tests (`tests/agent-tools-edit.test.ts`, `tests/agent-part.test.ts`)

## Done when

- One unit test per item, each failing before its fix:
  - Cache full with the agent's read oldest: a stale page command has its element ids mapped, or is clearly told to read again, never refused for a stale hash.
  - One copy read, another agent adds a copy elsewhere: the conflict's part is not the unchanged original, and an `all` retry does not touch the added copy.
  - Changed `oldText` longer than `PART_LIMIT`: the refusal says to read again.
  - 60 changed pages with a spy on `sections`: it runs for at most `CATCH_UP_FILES` files.
  - Draft path `__proto__`: the catch-up lists it, or the write is refused.
- A test (gap, no fix expected): a read reply just under the relay's 8 MB limit (`worker/agent-relay.ts` `maxBytes`) plus a full catch-up (20 files, 2 KB) still fits, or the size check counts the catch-up.
- `kit unit --affected`, `kit specs --affected` (the exact-part spec) and `kit doctor` pass.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`. Quote the RESULT lines in Done.

## Done (2026-10-29)

1. A stale page command looks up the agent's read before the tab keeps the page's text now (`src/agent-tools-edit.ts` `prepareNow`): with the text cache full and that read oldest, its element ids are still mapped to the page now.
2. Words found a different number of times now than in the read (`shared/agent-edit.ts` `wordsMoved`, marked `recounted`) are refused with no part and "Read the file again.", so neither a unique nor an `all` retry starts from the unchanged original or takes a copy added since. Words gone altogether still get their part as before.
3. A clash whose part is cut at `PART_LIMIT` says to read the file again instead of retrying with `oldText` from `part.text`.
4. `catchUpOf` (`shared/agent-read.ts`) cuts the list to `CATCH_UP_FILES` and 2 KB first, works out sections only for the files left, then cuts again with them.
5. A mark keeps its files in an object with no prototype (`src/agent-part.ts` `markOf`): a draft named `__proto__` is told in the catch-up.

Commits: Exact-part edits: second-look fixes (follow-up on 10)

Tests: one per item in `tests/agent-part.test.ts` (items 2 to 5) and `tests/agent-tools-edit.test.ts` (item 1); each failed on the code before its fix (54/59 with the four source files at the claim commit). Gap test, no fix needed: a read reply exactly at the read tool's limit (relay `maxBytes` less 4096) plus a full catch-up and the transport's largest envelope stays within `maxBytes`. Also covered: a copy removed since the read is refused with no part like one added, and a catch-up cut to its files without sections is cut again once their sections are added. Words gone altogether keep their part (ticket 10's test "the same words changed meanwhile are refused with the part as it is now").

- `RESULT: ok unit 3891/3891 (252 files)` (`kit unit --affected`)
- `RESULT: ok specs 1/1 passed` (`kit specs tests/native-save/native-agent-exact-part.spec.ts`; `--affected` selects 152 specs through the shared imports, left to `kit pr`)
- `RESULT: ok doctor 11/11 checks passed`; `npm run check` and `npm run lint` pass.

Feature list: no change (only what agents are told in refusals and catch-ups changes; nothing the user sees).
