---
title: "\"Text size after Bold\" passes every time (flaky since 43)"
type: task (AFK)
status: closed
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
- found by the diagnosis below: `tests/native-save/native-component-tools-after-paint.spec.ts`

## Done when

- 30/30 runs alone and 30/30 under load, with the cause named in the Done.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted) pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit specs`, `kit review`, `kit pr`; report the cause and the run counts.

## Diagnosis (2026-10-30, am-55)

- **Which spec.** The failure on record (slice 42's `kit specs` run, artifacts in its worktree) is `tests/native-save/native-component-tools-after-paint.spec.ts` › "component tools that land right after a Bold leave the next bar change working": `Text size` expected `"l"`, received `"default"`. The other Bold-then-size spec, `native-text-size.spec.ts` › "Text size chosen in the same moment as Bold …", passed 30/30 alone and 30/30 under a 4-shard `kit specs` load (load average about 22); it is not the flaky one.
- **Runs before any change.** The after-paint spec failed 2/30 alone with the same symptom.
- **Cause: the test, not the app.** The test clicks the lead paragraph, then `getByRole("button", { name: "Paragraph" }).first()`, which is the Blocks rail's Paragraph (it adds a new `<p>Text</p>` after the lead, as the F-bar-03 UX steps do), then waits for the bar to say "Paragraph". The lead's bar already says "Paragraph", so that wait passes before the new paragraph is selected. A probe that logged the status line and the crumb on every change shows the failing run: Bold at 488 ms lands on the **lead's** bar (crumb `p.lead`), "Paragraph added" at 576 ms puts the new paragraph right after the lead, and the Text size pick in that same lead bar is then refused with "The source changed. Select the element again and try again." That refusal is ticket 43's decided rule (a change after the element is refused); the bar then redraws for the new paragraph with Default. The source at the end: `<p class="lead"><strong>…</strong></p><p>Text</p>`. In passing runs "Paragraph added" comes first, the crumb turns to `p`, and Bold and L both apply to the new paragraph.
- **Fix to build.** The test waits on what the user sees: after clicking the lead, the selected crumb (`.canvas-crumb[aria-current=true]`) is `p.lead`; it clicks the Paragraph button inside the "Blocks" navigation by name, then waits until the selected crumb is `p` (the new paragraph) before Bold. No app change. With that change the spec passed 30/30 alone and 30/30 under a 4-shard `kit specs` load (load average about 28).
- **`native-lazy-panels.spec.ts` › "Files works again after a failed chunk load and recovery"** (failed twice in slice 53's `kit pr` run, passed alone). Under a 4-shard `kit specs` load it failed 4/30 with slice 53's symptom; the screenshot shows the rename refused with "The repository changed meanwhile. Try again." under the name field. With logs added to the rename's stale checks it then passed 0 failures in 185 runs (alone, under load, with the browser CPU slowed 4×, and beside the same load as the failing batch), so which check moved (route, generation, the file list or the text index's scope) is not pinned. Not small: not fixed here, a follow-up.

## Done (2026-10-30)

- **Cause: the test.** `native-component-tools-after-paint.spec.ts` › "component tools that land right after a Bold leave the next bar change working" waited for the bar to say "Paragraph" after adding a paragraph, but the lead's bar already said "Paragraph", so Bold sometimes landed on the lead before the new paragraph was selected; the Text size pick in that stale bar was then refused by ticket 43's rule ("The source changed…"). The app behaved as decided; no app change.
- **Fix.** The spec now waits on what the user sees: the selected crumb reads `p.lead` after clicking the lead, the Paragraph button is the one in the "Blocks" navigation, and Bold waits until the selected crumb reads `p` (the new paragraph).
- **Runs.** A second pair of runs after the build, separate from the diagnosis's pair (30/30 alone, 30/30 under load at a load average of about 28): 30/30 alone; 30/30 beside a 4-shard `kit specs` load of 60 native-save specs (load average about 22; the load run passed 60/60).
- **Checks.** `kit unit --affected`: `RESULT: ok unit none affected`. `kit specs --affected`: `RESULT: ok specs 3/3 passed`. `npm run lint` passed.
- Feature list: no change (test-only fix).
- The `native-lazy-panels.spec.ts` rename refusal from the diagnosis stays a follow-up.
