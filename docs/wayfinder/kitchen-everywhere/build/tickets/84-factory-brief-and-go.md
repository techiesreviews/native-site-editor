---
title: "The factory: `kit brief` writes every child's brief, `kit go` starts and waits for a long job, a hook refuses hand-written briefs"
type: task (AFK)
status: open
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
