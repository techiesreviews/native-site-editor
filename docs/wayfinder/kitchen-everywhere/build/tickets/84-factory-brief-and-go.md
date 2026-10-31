---
title: "The factory: `kit brief` writes every child's brief, `kit go` starts and waits for a long job, a hook refuses hand-written briefs"
type: task (AFK)
status: closed
assignee: ke-84
builder: claude
blocked_by: [81-existing-projects-get-new-setup]
---

## Goal

Lex (2026-10-31): "I am thinking that we can create the right tools as part of the factory so that these mistakes don't happen." He had asked for one shared kit, skills and factory, "so there is one thing to update" (2026-10-30).

The mistakes, all from 2026-10-30/31:
- **Builders stop watching their own jobs.** am-21, ke-72 and am-24 (twice) ended their turn while their own slice or tests still ran (ticket 79). The same happened twice in CamFrame.
- **Each brief is a long hand-written text the lead retypes.** Items get dropped (the wait method, the style line, the "never end your turn" line), and fixing a rule means changing every future brief by memory.
- **Builders build the `systemd-run …` line and the wait loop themselves.** Some get it wrong.

The fix: the instructions and the waiting live in tools. A brief is generated, never typed, and a long job is one command that returns only when it is finished or tells the agent exactly what to run next.

## Decided behaviour

- **`kit brief <ticket> [--owner <id>] [--repo <path>]`** prints the full brief for a delegated child, from the ticket, `kit.json` and the rulebook:
  - owner, worktree setup, builder and review pins;
  - the commands to run and the evidence to report;
  - the house rules (paid skills never in a repo; second look never OpenAI; waiver after three rounds; no toasts, theme tokens);
  - the talk-style line (ticket 83), "finish in this turn, wait with `kit go`", and the report's last line.
  - Free text for this one job goes in with `--note "<text>"`.
  - It ends with a marker line (`kit-brief: <version> <ticket>`).
  - The lead passes its output to `delegate_task`; a rule change is made once, in the kit.
- **`kit go <job> -- <command>` / `kit go <job>`** starts the job in its own systemd scope (ticket 78's `kit bg` path) and then waits in the foreground. It never runs past 9 minutes per call (under the 10-minute tool limit).
  - While the job runs, it ends with `RUNNING: <job> (<elapsed>, step <step>). Run again: scripts/agents/kit go <job>` and exit code 75.
  - When the job ends, it prints the job's RESULT line and exits with the job's code.
  - `kit slice` and long `kit pr`/specs runs are started this way; the runner guide teaches only this.
- **Hooks as the backstop:**
  - A `PreToolUse` hook on `mcp__t3-code__delegate_task` (and `Agent|Task`) refuses a coding brief without a `kit-brief:` marker, naming `kit brief`. Research, review-only and question tasks are allowed by a first line `kit-brief: none (<reason>)`.
  - Ticket 79's Stop hook refuses a turn end while a `kit go` job of this worktree runs.
- **Same in every project and every new one:** commands and hook scripts come from the machine copy (15-minute timer); the hook entries are pieces `kit init` writes, rolled out by `kit init --all` (ticket 81).

## Folds in

- Ticket 79: its Stop hook and runner line are built here, so 79 closes as merged.
- Ticket 83: its style line comes from `kit brief` and the kit's prompts. Its own hook on `delegate_task` becomes this ticket's hook, so there is one hook, not two; 83 keeps the trial log, `talk-report` and the Chinese-text guard.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/brief`, `kit.d/go`, `kit.d/bg` (shared scope start), `hooks/brief-guard.sh`, `hooks/stop-guard.sh`, `kit.d/init` (hook entries), `docs/runner.md`, `docs/kitchen.md`, `tests/`.

## Done when

- Tests, failing first:
  - `kit brief` holds every house-rule line and the marker;
  - `kit go` returns `RUNNING` with code 75 before 9 minutes and the job's RESULT at the end;
  - the brief hook refuses an unmarked coding brief and allows a marked one or `kit-brief: none (…)`;
  - the Stop hook cases from ticket 79.
- The next three children the lead starts get their briefs from `kit brief`, and none of them ends its turn while its job runs (noted in Done).
- `kit init --all` has added the hooks to every project.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
- Lex, 2026-10-31: "Can the kit invoke skills etc? Like done through a cli?" Lead's check: yes. The kit starts builders and reviewers with `claude -p` (`agent-run.mjs`), which loads the skills in `~/.claude/skills` and plugins and runs one explicitly when the prompt names it as `/skill-name`. Codex reads `~/.agents/skills`; Grok and OpenCode have none. Today the kit names no skill anywhere. Add to this ticket: a **skills map** in the rulebook (job kind to skill names: talk style to caveman; CSS to good-css; UI review to emil-ui-review and break-ui; motion to animate; …, with a project override in `kit.json` `skills`), used by `kit brief` and by the kit's own build and review prompts. Each entry is an invocation by name (`/name`) for Claude, a mention for Codex, and a one-line own-words fallback for models without skills. Skills are only ever named, never copied, so paid skills stay on this machine (guard unchanged). A skill missing on a machine is a `kit doctor` note, not a failure.
- Lex, 2026-10-31: "also for styling or building ui elements look at emil skills that will be helpful during the front end development process." The skills map's front-end part (all names checked on this machine; Emil's skills are paid, so the kit names them and never copies them):
  - **Any UI build or styling:** good-css, emil-design-foundations, emil-ui-polish.
  - **By what the slice touches:**
    - forms, inputs and buttons: emil-forms-and-inputs;
    - type: emil-typography;
    - colour and tokens: emil-color;
    - menus, popovers, panels and dialogs: emil-surfaces;
    - touch and accessibility: emil-touch-and-accessibility;
    - phone layouts: emil-mobile-native;
    - motion: emil-animations, plus animate;
    - speed: emil-performance;
    - component APIs: emil-component-design;
    - the design system docs: emil-design-system-docs;
    - marketing pages: emil-marketing-pages.
  - **UI review** (`kit review` on a UI diff, and `kit ux`): emil-ui-review, emil-unslop-design, break-ui.
  - **Before a release:** emil-prep-for-prod.
  - **How skills are picked:** `kit brief` picks from the ticket's file list and kind (CSS and UI files bring the UI set). The project's `kit.json` `skills` adds to or removes from the set.
  - **House rules beat skill advice.** An example is the editor's "no toasts, feedback in place", which wins over any skill that suggests a toast. The brief says this in one line.
  - **Where the skills aren't installed** (CI, another computer), the brief carries a one-line plain fallback, and `kit doctor` notes which skills are missing.
- Lead, 2026-10-31: Lex wants T3 Code's own way of running agents used where it fits. [Ticket 85](85-t3-native-factory-check.md) checks which factory parts T3 already does (agents as T3 threads that wake their parent, PR watch, schedules) and updates this plan before it is built.
- Lead, 2026-10-31: Lex, "Replace the parts of the factory to use t3 code native way". Ticket 85 is now the T3 build, after this one. Here `kit brief` also takes `--stage build|review|second-look|fix` (one brief per stage, used by 85's T3 mode and by the headless runs). `kit go` covers only long shell jobs (agents are T3 threads in 85). The Stop hook stays as the backstop.

## Done (2026-10-31)

- **The kit PRs**, each through the kit's own `kit pr`, Claude review (claude-opus-5-5) and CI (the kit's tests and this editor's from `dev`):
  - https://github.com/techiesreviews/agent-kit/pull/14 → `RESULT: ok merged #14 ed29ab6` (landed `59c7813`, the squashed build, and `ed29ab6`, a test isolation fix). Nine Claude review rounds; every P0/P1 found was fixed; the last round left three P2 and four P3 notes, landed with the lead's waiver (listed under Follow-ups).
  - https://github.com/techiesreviews/agent-kit/pull/16 → `RESULT: ok merged #16 44e1a35`: found by the rollout below. `kit brief --task "<title>" --owner <id> --note "<the task>"` for a project that keeps its work in GitHub Issues (CamFrame's review showed brief-guard would otherwise block every coding brief there), and agent-cap books no slot for a brief that brief-guard refuses. Four Claude rounds, the last with two P3 notes, landed with the lead's waiver.
  - Second look on both: skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model gave no session within 300 s).
- **What it does:**
  - `kit brief <ticket> [--stage build|review|second-look|fix] [--owner] [--repo] [--model] [--note]` prints the whole brief for one child: owner, setup, the builder and review pins from the rulebook's "Who cooks" rows (a project's extras win), the exact slice line (`kit go slice-<prefix><NN> -- kit slice …`, the job name `kit next` gives), the commands and evidence, the house rules (paid skills never in a repo, second look never OpenAI, the waiver after three rounds, no toasts and theme tokens, house rules beat skill advice, never a borrowed git name), the wait rule (`kit go`, a 10-minute tool limit, never in the background), the skills, the talk style, the note and the report's last line. It ends with `kit-brief: <kit version> <ticket> <stage>` and keeps a copy in `.scratch/kit-briefs/`. It refuses a group ticket (kit next runs a group as one job) and a ticket with no assignee and no `--owner`.
  - The skills map: `skills.json` in the kit names skills per job (the front-end set from Lex's list, the UI review set, caveman for the talk style) with the kit's own one-line fallback for each, never a skill's text; Claude gets `/name`, Codex `$name`, a model without skills the fallback. `kit brief`, `kit slice`'s build brief and `kit review`'s brief (also without a ticket, from the diff's files) use it; `"skills": { "add", "remove" }` in `kit.json` changes the set; `kit doctor` notes missing skills as optional. The rulebook's new "Skills map" section has the table.
  - The talk style (ticket 83's line): each agent start takes the next of `en` and `wenyan` (a counter under a lock in the kit's state folder); `KIT_TALK_STYLE=en|wenyan|plain` forces one. It is in `kit brief` and in the headless build contract, says that files, GitHub and messages for Lex stay plain English and that the kit's report keywords (`Declined:`, `RESULT:`, `REVIEW_STATUS:`) stay English. Review briefs stay plain English (their findings go to GitHub).
  - `kit go <job> [--max D] -- <command>` / `kit go <job>` starts a job with `kit bg` and waits in the foreground, at most 9 minutes per call: `RUNNING: <job> (<elapsed>, step <step>). Run again: … kit go <job>` with exit 75 (keeping `KIT_ROOT` when called from another folder), or the job's RESULT line and its code at the end. A job is never started twice; a time limit that ended it is named.
  - `kit bg` starts its launcher in a user systemd scope (`systemd-run --user --scope`, `--max` as `RuntimeMaxSec`, default 6h, `0` for none), else as before with `note: no user systemd; this job ends with the session` (this builds ticket 78's scope start).
  - Hooks, written by `kit init` and checked by `kit doctor`: `brief-guard` (Claude PreToolUse on `mcp__t3-code__delegate_task|Agent|Task`) refuses a brief without the marker, allows `kit-brief: none (<reason>)` as the first line and the Explore and Plan agents; `stop-guard` (Claude and Codex Stop) refuses a turn end while a `kit go` job of the worktree, or a `kit-*` unit working in it, runs, naming the job and the wait command, and gives way past the time limit, after six refusals in a row, or with `KIT_ALLOW_STOP=1`. The kit's own headless agents set `KIT_ALLOW_STOP=1`. Codex gets no brief-guard (its PreToolUse sees only Bash).
  - `kit next --start` marks its slice job as a kit go job and prints `wait: KIT_ROOT=<worktree> scripts/agents/kit go <job>`; a group job has no time limit.
  - Docs: the kit's rulebook (house rules "Briefs come from the kit" and "Finish the job in the turn", stations 5 and 6, the Skills map), README and AGENTS.md; this repo's `docs/agents/runner.md` (long jobs only through `kit go`, in the foreground) and `docs/agents/guardrails.md` (the two hooks). The ticket's Files named a kit `docs/runner.md`, which does not exist: the runner guide is each project's own.
- **Tests** (agent-kit): `tests/kit-brief.test.ts`, `tests/kit-go.test.ts`, `tests/agent-hooks-factory.test.ts`, with additions to the bg, init, doctor, review, slice, next, scripts, resume, front door and clean-guard tests. The first set (brief, go, both hooks, bg scope, init pieces) failed before the change: 14 failing, 49 passing. Tests never touch the real state folder, systemd or skill folders (`KIT_TALK_STYLE`, `KIT_BG_SCOPE`, `KIT_SKILL_HOME` in `kitEnv`; the clean guard fails when a test moves the talk-style counter).
- **Kit commands:** agent-kit `kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `npm test` 1496/1496, `npm run lint` exit 0, `npm run test:kit-clean` 15/15 at `44e1a35`; every long run (tests, reviews, both `kit pr`) ran under `kit go`, waited for in the foreground. `kit update` → `RESULT: ok update ed29ab6 (was ab13d2b)`, then `already on 44e1a35`.
- **Rollout:** `kit init --all` at `ed29ab6`: `RESULT: fail init --all: 0 updated, 1 up to date, 1 skipped (TechiesTools), 9 failed (camframe, chat, idea-board, lexvd-site, native-site-editor, prompter, script, techies-playground, techies-reviews)`. agent-kit was up to date; TechiesTools was skipped (`no scripts/agents/kit.json naming a landing branch, here or on origin`); the editor's run stopped at a dependency check that passes now; the other eight opened PRs whose reviews found the two kit defects fixed in #16, plus doc notes. Each waiting PR was then finished in its worktree with the project's own `kit pr` on the new kit (`44e1a35`); where only P2/P3 notes and test gaps were left, with the lead's waiver (camframe, chat, lexvd-site, script, techies-playground), as in ticket 81:
  - https://github.com/techiesreviews/camframe/pull/29 → `RESULT: ok merged #29 622c023` (its `docs/agents/agent-scripts.md` names the hooks and `kit brief --task`; #27 closed in its favour)
  - https://github.com/techiesreviews/chat/pull/6 → `RESULT: ok merged #6 a4eb2ab` (fresh doctor evidence; #3 closed in its favour)
  - https://github.com/techiesreviews/lexvd-site/pull/5 → `RESULT: ok merged #5 14fbf09`
  - https://github.com/techiesreviews/prompter/pull/3 → `RESULT: ok merged #3 f0313b5`
  - https://github.com/techiesreviews/script/pull/4 → `RESULT: ok merged #4 62a4fbe`
  - https://github.com/techiesreviews/techies-playground/pull/14 → `RESULT: ok merged #14 027551e` (a change record, indexed; #12 closed in its favour)
  - https://github.com/techiesreviews/techies-reviews/pull/15 → `RESULT: ok merged #15 6140db2`
  - idea-board: https://github.com/techiesreviews/idea-board/pull/3 closed unmerged, its main already had both entries (`38465ed`, from its own thread).
  - native-site-editor: not landed yet. Its run stopped at a dependency check (passes now), and a PR with the three entries runs the full suite, where `tests/agent-port.test.ts` hangs on this machine under `kit go` (it passes alone; the same file hung twice, unrelated to this change). The next `kit init --all` adds them (ticket 92).
  - TechiesTools: skipped, no `scripts/agents/kit.json` on its landing branch.
- **Follow-ups** (waived P2/P3 notes, kept for ticket 92): stop-guard's refusal count is kept per set of jobs, so "six in a row" means since the set last changed; `brief-lib.mjs` repeats the second-look pins that `second-look.json` holds; `reviewBrief`'s default reviewer is a fixed name, not the rulebook pin; an `opencode/claude-…` model would get `/skill` lines; two starts can both take over the same stale talk-style lock; two long task titles can share a slug; agent-cap reads a hook matcher as a jq regex; the ui set's wider words (buttons, forms, dialogs, menus, popovers) change picks for ticket briefs too; without a kit, the hook launcher's warning now shows at every turn end and twice on an Agent call, and its usage comment lists four hooks; `kit ux` and a release brief do not use the skills map yet (**planned** in the rulebook).
- **Not shown yet:** "the next three children the lead starts get their briefs from `kit brief`" is the lead's to record.
- **Closed with two items moved on** (the lead's call, 2026-10-31): the kit work is merged and rolled out to every other project; the Native Site Editor's hook entries and the lead's record of the next three children are tracked in [ticket 92](92-factory-follow-ups.md).
