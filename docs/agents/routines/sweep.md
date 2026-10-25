# Weekly sweep routine

A scheduled session runs this every Monday at 09:00 Europe/Amsterdam ([kitchen.md](../kitchen.md#weekly-routines)).
It **lists bad patterns and changes nothing**: no code edits, no tickets. Lex picks which items become
tickets ([factory 06](../../wayfinder/software-factory/tickets/06-grill-sweeps-and-learning.md#resolution-2026-10-22), items 1 and 4).

## Steps

1. **Worktree.** `git -C /home/ubulex/Projects/native-site-editor-dev fetch -q origin`, then
   `ASE_OWNER=sweep scripts/agents/worktree.sh docs/sweep-YYYY-MM-DD origin/dev`. Work only there
   (`git -C <worktree>` or `cd <worktree> || exit 1`); run `scripts/agents/kit doctor` and fix every ✗.
2. **Numbers.** `scripts/agents/kit sweep` (default `--since 7d`). Read its bundle,
   `.scratch/sweep/<date>/bundle.md` in the main root: biggest source files and growth, `src/main.ts`
   lines, hand-typed CSS values, tests that failed then passed in `kit pr` runs, known failures, review
   findings by kind, Lex's corrections and stale tech-debt issues. Trust the bundle's numbers; read code
   only to back an item.
3. **Architecture, list only.** Apply `improve-codebase-architecture`
   (`~/.codex/skills/improve-codebase-architecture/SKILL.md`) step 1, Explore, scoped by the bundle's
   biggest and fastest-growing files. Stop there: no HTML report, no grilling, no refactor.
4. **Guardrail candidates.** A mistake seen twice (two review findings of one kind on one pattern, a
   correction kind Lex gave twice, a test that flipped in two runs) becomes a candidate check
   ([guardrails.md](../guardrails.md): hook, lint rule or kit check). Name the check and where it lives.
5. **Write the list.** `docs/work/sweeps/YYYY-MM-DD.md` in the worktree ([README](../../work/sweeps/README.md)):
   every item ranked, each with evidence (bundle line, file and line, finding or correction) and one
   recommended fix. Mark the top 3.
6. **Land it.** Commit only that file, then `scripts/agents/kit pr --title "docs: sweep YYYY-MM-DD"`
   (docs tier). Nothing else changes.
7. **Tell Lex.** One short message in plain words: the top 3, each with its recommended fix, and the
   question "Which of these become tickets?". No file paths unless he asks. The lead opens the tickets he
   picks.

## Never

- Edit code, tests, configs or other docs; open, close or edit tickets; deploy.
- Fix an item "while you are there", even a one-liner. It goes on the list.
- Run `--since` wider than 7d unless the last sweep was missed; then say so in the list's first line.
