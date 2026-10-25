# Agents

Start here: `docs/agents/kitchen.md` (the kitchen rulebook) gives every station from idea to release, who decides, and the builder and reviewer pins.
Finding code: read `docs/agents/code-map.md`.
Running a build slice: follow `docs/agents/runner.md` (order of steps: build, review, `kit pr`, report).
Agent commands: `scripts/agents/kit <command> --help`; one line each in `docs/agents/agent-scripts.md#kit`.

## Agent skills

### Issue tracker

Issues, specs and wayfinder maps are markdown files in the repo (`docs/work/`, `docs/wayfinder/`), committed on `dev`. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), used as a ticket's `status`. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Testing

Running tests or timing: read `docs/agents/local-testing.md`. Automated checks and hooks: `docs/agents/guardrails.md`.

## Review

The repo's review and model-routing rules in docs/agents/ take priority over global skills.
Running a review: `scripts/agents/kit review` (see `docs/agents/agent-scripts.md#kit`).
Reviewing a diff: apply `CODING_STANDARDS.md`.
UX: `docs/agents/ux-rulebook.md`.
