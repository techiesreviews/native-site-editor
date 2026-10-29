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

Commits: "An all-copies edit whose copies all changed is told to read again (follow-up on 40)", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "docs: 41-all-copies-changed-reads-again commits by subject" and this commit.

Evidence:
- `RESULT: ok unit 3897/3897 (252 files)` (`kit unit --affected`, after the review fixes too); the new test failed with the source at the claim commit (22/23).
- `RESULT: ok specs 2/2 passed` (`kit specs` on `native-agent-exact-part.spec.ts` and `native-agent-edits.spec.ts`). `kit specs --affected` selects 131 specs through `shared/agent-edit.ts`'s imports; the builder's run of them used up its 90-minute limit unfinished; its RESULT line is the `kit pr` run's.
- `RESULT: ok doctor 11/11 checks passed`; `npm run check` passes.

### Follow-ups

- Standards (P2): 124050182:shared/agent-edit.ts:169 — P2 fault: an edit without `all` whose read had several copies is now told the user or another agent changed the words, when it was the agent's own mistake. Evidence: `prepareAgentEdit` calls `wordsMoved` (line 247) before the own-mistake check on line 251 ("Replacements that fail on the read itself are the agent's own mistake, not a clash"). An edit without `all` on words that appear twice in the read already fails on that read: `applyReplacements` returns "oldText occurs more than once … Include more surrounding text, or set all." (`shared/agent-replacements.ts:21`). Because `several` now sets `reread: "gone"` or `"moved"` whether or not the edit has `all`, the agent hears "the user or another agent changed them meanwhile" or "…moved them meanwhile. Read the file again." After a re-read it would send the same ambiguous edit and only then learn the real fault. The new test pins this wording: `tests/agent-part.test.ts:156-163` loops over `all` in `[true, false]` and asserts "are no longer there". The Done section repeats it ("with `all` or not"). Before this slice the same input got a part plus "changed meanwhile", so the misattribution is older. This slice extends it to the new `gone` and `moved` reasons and locks it in with a test. Fix: in `wordsMoved`, skip the count and moved checks for a replacement without `all` whose read had more than one copy, so it falls through to line 251's `refuse(edited.error)`. Alternatively, set `several` only when the edit has `all` and the read had more than one copy. Then change the test's `all: false` branch to expect `/occurs more than once/` as a 400 `HttpError`, not a `PartClash`.
- Validation gaps (gap): A test for an edit without `all` and several copies read. In `tests/agent-part.test.ts`: the read has "Welcome" twice and the text now has both as "Hello". Send `{ oldText: "Welcome", newText: "Hi" }` (no `all`) with the read's hash. Assert the rejection matches `/occurs more than once/` and is not a `PartClash`. Repeat with the text now keeping both copies but moving one (the `two`/`moved` fixture). This covers the fault above, and today's code fails it.

