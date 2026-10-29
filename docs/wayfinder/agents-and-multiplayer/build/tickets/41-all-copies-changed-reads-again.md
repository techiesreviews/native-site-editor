---
title: "An all-copies edit whose copies all changed is told to read again (follow-up on 40)"
type: task (AFK)
status: closed
assignee: am-41
builder: claude
blocked_by: [40-exact-part-edits-second-look-fixes]
---

## Goal

Slice 40's final review left a P2 ([ticket 40 Follow-ups](40-exact-part-edits-second-look-fixes.md#follow-ups)): in `shared/agent-edit.ts` (about line 166) an `all` edit whose read had several copies, all of which have since changed (`was.length > 1`, `is.length === 0`), still gets `{ index, at: was[0] }` with no `recounted`, so `editClash` (about lines 188–204) offers a retry built around the first copy only. An agent that follows it changes one copy and leaves the others wrong, with no warning. Same kind of fault as ticket 40's item 2.

## Decided behaviour

- A clash offers the current part to retry from only when the read had exactly one copy; any `all` edit whose copy count changed, including down to zero, is told to read the page again (`recounted`).
- Also take ticket 40's three test gaps if they are small.

## Files

- `shared/agent-edit.ts` and its unit tests (`tests/agent-edit*.test.ts` or `tests/agent-tools-edit.test.ts`)

## Done when

- A unit test: `all` edit, read had two copies, both changed since → the reply says read again and carries no part; fails before the fix.
- Ticket 40's single-copy and still-there cases keep their answers.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-29)

- `wordsMoved` (`shared/agent-edit.ts`) offers no part for a count change whenever the read had more than one copy, so an edit (with `all` or not) whose copies read were several and are now all gone is refused with no part: "The words this edit changes in <path> are no longer there: … Read the file again." (`reread: "gone"`; "a different number of times" stays for words still there, `reread: "recounted"`). Only a read with exactly one copy, changed since, still gets the part as it is now to retry from.
- Several copies read, as many now, but one moved out of its stretch: also no part (ticket 10 offered the part around the moved copy, which an `all` retry would change alone). The refusal says "The words this edit changes in <path> are no longer all where they were read: … Read the file again." `wordsMoved` now says why with `reread: "recounted" | "gone" | "moved"`, and `editClash` picks its wording from that. Ticket 10's moved-copy test now asserts no part and that wording, and failed before this change (22/23).
- Test (`tests/agent-part.test.ts`, "an edit whose two copies read both changed since is refused as no longer there…"): read has "Welcome" twice, both now "Hello", with and without `all` → `PartClash` with no part and "are no longer there: … Read the file again."; failed before the fix (the part covered both copies and invited a retry). It also covers a later replacement ("The words replacement 2 changes in index.html are no longer there", no part), and a direct `wordsMoved` check pins `reread: "gone"` for two copies read and none left. The same test checks that a single copy read and changed keeps its part and retry. Ticket 40's single-copy, added-copy, removed-copy and later-replacement tests keep their answers.
- Ticket 40's other two test gaps (the read tool's size limit, the 2 KB cut with long paths) need `src/agent-tools-read.ts` and the catch-up, outside this ticket's files; they stay tracked in [ticket 40 Follow-ups](40-exact-part-edits-second-look-fixes.md#follow-ups).
- Feature list: no change (agent-facing clash wording only; nothing a user sees).

Commits: "An all-copies edit whose copies all changed is told to read again (follow-up on 40)".

Evidence:
- `RESULT: ok unit 3897/3897 (252 files)` (`kit unit --affected`, after the review fixes too); the new test failed with the source at the claim commit (22/23).
- `RESULT: ok specs 2/2 passed` (`kit specs` on `native-agent-exact-part.spec.ts` and `native-agent-edits.spec.ts`). `kit specs --affected` selects 131 specs through `shared/agent-edit.ts`'s imports; the builder's run of them used up its 90-minute limit unfinished; its RESULT line is the `kit pr` run's.
- `RESULT: ok doctor 11/11 checks passed`; `npm run check` passes.
