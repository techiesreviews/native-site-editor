---
title: "Docs: one source of truth for runners, review, landing and waiting"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-front-door, 02-ci-pull-requests, 03-kit-doctor, 04-kit-wait, 05-kit-review, 06-kit-shots-core, 07-kit-shots-layout, 08-kit-shots-compare, 09-kit-specs, 10-kit-size, 11-kit-deps, 12-kit-status, 13-kit-preview, 14-kit-pr, 15-agent-resume, 16-unit-timeout, 17-media-kinds, 18-promise-lint, 19-colour-check, 20-unused-exports, 21-await-race-helper, 22-scenario-helpers-in-specs, 23-known-failures-refresh, 25-shots-proof]
builder: claude
---

## What

- runner.md absorbs this build's runner rules ([runner-extras.md](../../runner-extras.md)): no own subagents; no preview deploys; the merged PR is the finish line (`kit pr`); report once at the end and never end a turn with your own background work running; at most one screenshot retake; `kit doctor` first; `kit wait` for waiting; `kit shots` for screenshots.
- Each of **review**, **landing (kit pr)** and **waiting** is described in exactly one place (agent-scripts.md for commands, runner.md for the order of steps); other docs link there. Remove the duplicates in local-testing.md and runner.md.
- agent-scripts.md: a kit section (every command, one line each, pointing to `--help`), land.sh marked as replaced by `kit pr`.
- guardrails.md: new checks (colours, unused exports, media-kind guard, promise rules, kit wait guard), `src/prototype/` exemption lines removed.
- local-testing.md: delete the stale CI token note; point to `docs/agents/github-settings.md`.
- code-map.md: a Media section covering the `media-*` modules (one line each) and `shared/media-kinds.ts`.
- issue-tracker.md: each build keeps `docs/wayfinder/<build>/lead-log.md` (not /tmp) and a short `runner-extras.md`; new template file.
- **This ticket lands through `kit pr`** as the proof of the PR flow.

## Files

- `docs/agents/runner.md`
- `docs/agents/local-testing.md`
- `docs/agents/agent-scripts.md`
- `docs/agents/guardrails.md`
- `docs/agents/code-map.md`
- `docs/agents/issue-tracker.md`
- docs/agents/runner-extras-template.md (new)
- `AGENTS.md`

## Done when

- Docs read cleanly; `grep -rn "land.sh\|prototype/" docs/agents` shows only the intended mentions; PR merged into dev with its Sol review on the PR and CI green.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
