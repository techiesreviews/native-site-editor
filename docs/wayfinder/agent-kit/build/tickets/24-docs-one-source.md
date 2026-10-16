---
title: "Docs: one source of truth for runners, review, landing and waiting"
type: task (AFK)
status: closed
assignee: ak-24 (runner draft + lead finish)
blocked_by: [01-kit-front-door, 02-ci-pull-requests, 03-kit-doctor, 04-kit-wait, 05-kit-review, 06-kit-shots-core, 07-kit-shots-layout, 08-kit-shots-compare, 09-kit-specs, 10-kit-size, 11-kit-deps, 12-kit-status, 13-kit-preview, 14-kit-pr, 15-agent-resume, 16-unit-timeout, 17-media-kinds, 18-promise-lint, 19-colour-check, 20-unused-exports, 21-await-race-helper, 22-scenario-helpers-in-specs, 23-known-failures-refresh, 25-shots-proof, 26-files-adding-stale-message, 27-media-kinds-boot-bytes, 28-kit-wait-test-load, 29-kit-specs-lazy-imports, 30-shots-print-findings, 31-shots-compare-current-tooling, 32-add-card-spec-page-switch, 33-codex-model-check]
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
- `docs/agents/github-settings.md` (token step, merge-queue note)
- `tests/agent-scripts.test.ts` (runner.md wording it pins)
- `scripts/check-types.mjs` (dead `src/prototype/` exemption)
- `docs/wayfinder/agent-kit/lead-log.md` (the lead's build notes)

## Done when

- Docs read cleanly; `grep -rn "land.sh\|prototype/" docs/agents` shows only the intended mentions; PR merged into dev with its Sol review on the PR and CI green.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **runner.md** holds the runner rules and step order: `kit doctor` first, build (Sol via `agent.sh`),
  `kit review`, close the ticket, finish with `kit pr --ticket` and report the PR number; wait with
  `kit wait`; recover from an app restart with `agent.sh --resume` and `kit status`; no own subagents,
  no preview deploys, one report at the end, at most one screenshot retake.
- **One place each:** commands in `agent-scripts.md` (a Kit section, one line per command, from each
  `--help`; `land.sh` marked as replaced by `kit pr`), the order of steps in `runner.md`; duplicates
  removed from `local-testing.md`.
- **guardrails.md:** colour, media-kind, `kit wait` loop guard, promise lint and unused-export rules (with
  their known limits); `src/prototype/` lines gone, and the dead exemption removed from
  `scripts/check-types.mjs`.
- **code-map.md:** a Media section, one line per `media-*` module plus `shared/media-kinds.ts`.
- **issue-tracker.md / template:** each build keeps `docs/wayfinder/<build>/lead-log.md` and a short
  `runner-extras.md` (`docs/agents/runner-extras-template.md`). AGENTS.md pointers updated.
- **github-settings.md:** the Pull requests token step, and the merge-queue note (personal account:
  `kit pr` waits for checks and merges).
- **Lead log** moved into the repo with the build's last entries. Ticket 34 (newest-spec flake) filed open.
- **Review:** Sol via `kit review` on the draft (no defects); `kit pr` reviews the final branch.
- **Tests:** check, lint, tickets check, doc unit tests (code-map, agent-scripts, agents-md drift) pass.
- **Merged through `kit pr`**, the build's proof of the feature → PR → dev flow.
