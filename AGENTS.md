# Agents

Start here: `docs/agents/kitchen.md` (the kitchen rulebook) gives every station from idea to release, who decides, and the builder and reviewer pins; `scripts/agents/kit rulebook` prints the shared rulebook with this repo's extras.
Finding code: read `docs/agents/code-map.md`.
Running a build slice: follow `docs/agents/runner.md` (order of steps: build, review, `kit pr`, report).
Agent commands: `scripts/agents/kit --help`; `scripts/agents/kit <command> --help` for one; one line each in `docs/agents/agent-scripts.md#kit`.

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

Review loop: `scripts/agents/kit rulebook`, section "Review loop" (3 fix rounds, 5 only for risk; stop when only nits are left; one reviewer; a findings ledger in the PR).

## Messages to Lex
<!-- messages-to-lex:start v1 -->
- Only what matters to him. Start with the question, or what he must do (test, do or answer).
- Add a recommendation when it fits.
- Caveman style, short bullets, plain words (he is not technical). He asks if he wants more context.
- Leave out internal process (review rounds, waivers, SHAs, file paths) unless he must act on it.
- Example: "Keep the old export button or remove it?" / "Both do the same." / "Recommend: remove it."
<!-- messages-to-lex:end -->
