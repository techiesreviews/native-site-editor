# Chat learning routine

A scheduled session runs this every other Monday, after the [sweep](sweep.md), in even ISO weeks
([kitchen.md](../kitchen.md#weekly-routines)). It turns corrections Lex gave more than once into
**proposals** for an automatic check or a UX rulebook line. **Nothing is added until Lex picks**
([factory 06](../../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22), item 2).

The chat project's sync is the only reader of chats; it records each correction in
`~/Projects/chat/memory/corrections/<slug>.md` ([factory 10](../../wayfinder/software-factory/tickets/10-grill-central-memory.md#resolution-2026-10-22), item 1).
This routine reads that list and never writes there.

## Steps

1. **Week.** `date +%V`; an odd ISO week ends the routine here.
2. **Worktree.** `git -C /home/ubulex/Projects/native-site-editor-dev fetch -q origin`, then
   `ASE_OWNER=learning scripts/agents/worktree.sh docs/learning-YYYY-MM-DD origin/dev`. Work only there
   (`git -C <worktree>` or `cd <worktree> || exit 1`); run `scripts/agents/kit doctor` and fix every ✗ in
   the environment, never by editing repo files.
3. **Gather.** `scripts/agents/kit learn` (default `--since 14d`). `RESULT: ok learn nothing recorded yet`
   ends the routine: no file, no PR, and the sweep's message goes out alone. Otherwise read its bundle,
   `.scratch/learn/<date>/bundle.md` in the main root: groups given more than once with their count,
   kinds, dates, sources and `covered?`, then lines given once and malformed lines.
4. **Judge.** Apply the `retro` skill (`~/.codex/skills/retro/SKILL.md`) to the bundle instead of a
   session log. Confirm each group: split one that joined two different asks, join two that are the
   same ask, and drop a pair that is one correction recorded in both lists. Open each `covered?` rule:
   if it already says what Lex asked, the group is covered and the proposal asks why it did not hold.
5. **Propose.** For each correction given more than once, one action:
   - a **hook**, **lint rule** or **kit check** ([guardrails.md](../guardrails.md)) when the mistake is
     mechanical: name the check, what it catches and the file it lives in;
   - a **rulebook line** ([ux-rulebook.md](../ux-rulebook.md)) when it is a judgement call: give the exact
     wording, its **why** (the correction) and its **check**, and the section it goes under.
6. **Write the list.** `docs/work/learning/YYYY-MM-DD.md` in the worktree ([README](../../work/learning/README.md)):
   every repeated correction ranked by count, each with its evidence (dates and sources from the bundle),
   whether it is covered, and its one proposed action. Lines given once are left out.
7. **Land it.** Commit only that file, then `scripts/agents/kit pr --title "docs: learning YYYY-MM-DD"`
   (docs tier).
8. **Tell Lex.** Add the proposals to the sweep's single Monday message, in plain words: each repeated
   correction, what would change for him, and the question "Which of these should I add?". No file
   paths unless he asks. Checks he picks become tickets; rulebook lines he picks are added after his yes.
9. **Clean up.** After the PR merges, from outside the worktree:
   `git -C /home/ubulex/Projects/native-site-editor-dev worktree remove <worktree>`; keep the branch.

## Never

- Write to `~/Projects/chat/` or reread chats; the corrections list is the only source.
- Add a check, hook, lint rule or rulebook line before Lex picks it.
- Edit code, tests, configs or other docs; open, close or edit tickets; deploy.
