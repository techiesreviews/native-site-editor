# Chat learning routine

A scheduled session runs this at 11:00 Europe/Amsterdam on Mondays of even ISO weeks, two hours after the [sweep](sweep.md)
([kitchen.md](../kitchen.md#weekly-routines)). It turns corrections Lex gave more than once into
**proposals** for an automatic check or a UX rulebook line. **Nothing is added until Lex picks**
([factory 06](../../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22), item 2).

The chat project's sync is the only reader of chats; it records each correction in
`~/Projects/chat/memory/corrections/<slug>.md` ([factory 10](../../wayfinder/software-factory/tickets/10-grill-central-memory.md#resolution-2026-10-22), item 1).
This routine reads that list and never writes there.

In even ISO weeks the sweep holds its top 3 for this routine, so this routine **always sends that
Monday's one message to Lex**: the sweep's top 3, plus the learning proposals when there are any
([factory 06](../../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22), item 4).
Every stop after step 1 (an ✗ that `kit doctor` cannot fix, `kit learn` failing or finding nothing, `kit pr`
failing) still sends it: the sweep's top 3, then one plain line saying the learning list did not come
this time and why.

## Steps

1. **Week.** `date +%V`; an odd ISO week ends the routine here (the sweep sent its own message). After a
   53-week year, week 53 and week 1 are both odd, so learning waits three weeks once; that is accepted.
2. **Worktree.** `git -C /home/ubulex/Projects/native-site-editor-dev fetch -q origin`, then
   `ASE_OWNER=learning scripts/agents/worktree.sh docs/learning-YYYY-MM-DD origin/dev`. Work only there
   (`git -C <worktree>` or `cd <worktree> || exit 1`); run `scripts/agents/kit doctor` and fix every ✗ in
   the environment, never by editing repo files.
   **Sweep's top 3.** Wait for the sweep's merged file on `origin/dev`, checking every 5 minutes until
   13:00 (`kit pr` pushes the branch before review, and deletes it on merge):
   `scripts/agents/kit bg sweep-wait -- bash -c 'until git fetch -q origin && git cat-file -e origin/dev:docs/work/sweeps/YYYY-MM-DD.md; do [[ $(date +%H%M) < 1300 ]] || exit 1; sleep 300; done'`,
   then `scripts/agents/kit wait job sweep-wait --timeout 2h30m`. Keep the file's marked top 3 with their
   recommended fixes. If the wait fails, read the file from the sweep's branch `origin/docs/sweep-YYYY-MM-DD`
   instead, and the message says that list is not yet reviewed; only when neither has it does the
   message say the sweep's list is missing.
3. **Gather.** Find the newest learning file: the latest date among `docs/work/learning/YYYY-MM-DD.md` on
   `origin/dev` and the `origin/docs/learning-YYYY-MM-DD` branches holding that file (a learning PR may
   still be open: `git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/docs/learning-*'`).
   Run `scripts/agents/kit learn --since <its date>` (inclusive, so a correction from that Monday after
   its run is seen now); with no earlier learning file,
   plain `scripts/agents/kit learn` (default `--since 14d`). `RESULT: ok learn nothing recorded yet`
   or `RESULT: ok learn 0 repeated of N groups` ends the learning part: no file, no PR; go to step 8,
   which says in one line why there is no learning list (nothing recorded, or nothing asked twice). Otherwise read its bundle,
   `.scratch/learn/<date>/bundle.md` in the main root: groups given more than once with their count,
   kinds, dates, sources and `covered?`, then lines given once and malformed lines.
4. **Judge.** Apply the `retro` skill (`~/.codex/skills/retro/SKILL.md`) to the bundle instead of a
   session log. Confirm each group: split one that joined two different asks, join two that are the
   same ask, and drop a pair that is one correction recorded in both lists. Drop a group the newest
   learning file (read from wherever step 3 found it) already proposed unless it has a line dated on or
   after that file's date that the file does not list. Open each `covered?` rule: if it already says what Lex asked, the group is covered and the proposal asks why it did not hold.
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
8. **Tell Lex.** One short message in plain words: first the sweep's top 3, each with its recommended
   fix, and "Which of these become tickets?"; then each repeated correction, what would change for him,
   and "Which of these should I add?" (or the one line saying why there is no learning list). No file
   paths unless he asks. The lead opens the sweep tickets he picks. Checks he picks become tickets;
   rulebook lines he picks are added after his yes.
9. **Clean up.** After the PR merges, from outside the worktree:
   `git -C /home/ubulex/Projects/native-site-editor-dev worktree remove <worktree>`; keep the branch.

## Never

- Write to `~/Projects/chat/` or reread chats; the corrections list is the only source.
- Add a check, hook, lint rule or rulebook line before Lex picks it.
- Edit code, tests, configs or other docs; open, close or edit tickets; deploy.
