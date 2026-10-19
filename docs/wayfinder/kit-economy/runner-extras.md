# Runner extras: kit-economy build

Read with [runner.md](../../agents/runner.md). Where they differ, this file wins
for this build only. The lead's notes live in `lead-log.md` next to the [map](map.md).

- **Base.** Branch from `origin/dev`; land into `dev` with
  `scripts/agents/kit pr --ticket <ticket>` (or `kit slice`, which ends with it).
- **Owner.** `ke-NN` (the ticket number); the lead is `ke-lead`.
- **Builder.** Sol builds every ticket:
  `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model gpt-6.1-sol --effort high`.
- **Review.** `scripts/agents/kit review --ticket <ticket>` (Sol, medium, read-only).
- **Out of bounds.** App code (`src/`, `worker/`, `shared/`), production, `main`, preview deploys.
  Only `scripts/agents/`, its tests, agent docs and the files your ticket lists.

## Economy rules (this build, from the first ticket on)

- **Findings go back to the builder.** Never hand-edit code for a review finding. Send the
  findings to the builder: `scripts/agents/agent.sh --resume <out-dir>` with a short brief
  until ticket 03 lands, then `scripts/agents/kit fix`. You may decline a finding with a
  one-line reason; the builder fixes the rest.
- **Never open full Playwright results or error-context files** (`results-*.json`,
  `error-context.md`, trace folders). Read the `kit specs` lines; after ticket 05, its digest.
  Need more? `grep -n` the one assertion, at most 20 lines.
- **Screenshots only through the contact sheet** (`contact.webp`); open a single PNG only for a
  specific finding, and never the same image twice.
- **Focused unit files, not the full suite.** Run `scripts/agents/unit.sh <files>` for what you
  touched (after ticket 07: `kit unit --affected`). `kit pr` runs the full set for the tier.
- **Waiting.** Claude: start long jobs with `run_in_background: true` and wait for the notice.
  Never find pids with `ps | grep`; never write `until … sleep` or `pgrep -f` loops. After ticket
  02: `kit bg <name> -- …` and `kit wait job <name> --timeout 2h` in the background.
- **Dogfood.** Once a command from an earlier ticket has landed on `origin/dev` (`kit bg`,
  `kit wait job`, `kit fix`, `kit slice`, …), use it. In your ticket's `## Done` section, add a
  line "Dogfood:" naming where it helped or failed.
- **Report once, at the end**, with the seven-line report. Never end your turn while your own
  background job is still running.
