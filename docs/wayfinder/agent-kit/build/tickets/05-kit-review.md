---
title: "kit review: clean Codex home, sturdy scope, retry, saved evidence"
type: task (AFK)
status: closed
assignee: ak-05
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- Codex reviews run with a fresh `CODEX_HOME` per run (temp dir holding only `auth.json` copied or symlinked from `~/.codex` and a minimal `config.toml`: no skills, no MCP servers, no user AGENTS.md), mirroring the Claude adapter's isolation. Build runs keep the normal home.
- Base: resolve `--base` with `git rev-parse --verify <ref>^{commit}` (so `HEAD~3`, `abc^`, SHAs work); drop the `/^[\w./-]+$/` regexes in `reviewBase` and `reviewBrief`. Add `--commit <sha>` (scope = that one commit, `<sha>^..<sha>`). A brief with no scope and no flag is an error, not a silent `origin/dev`.
- Fail before calling the model when the diff is empty (`problem: empty diff for <scope>`).
- Every brief gets the standard `REVIEW_STATUS: complete` footer appended by the runner (whatever wrote the brief). If the reply lacks the line, re-ask once in the same session/model with a short "start your reply with REVIEW_STATUS: complete" follow-up; then fail.
- Evidence: `result.md`, `run.log`, `diff.patch`, `refs.txt` copied to `/home/ubulex/Projects/native-site-editor/.scratch/reviews/<owner>/<time>/` (kit-lib main root) — printed in the RESULT line. `kit review --pr <n>` also posts result.md as a PR comment (gh), headed with model, scope and SHAs.
- `kit review [--base REF | --commit SHA] [--ticket FILE] [--pr N]` builds the brief (review-brief.mjs) and runs it in one go; `review.sh` stays as a thin compatible wrapper.
- AGENTS.md gains one line: the repo's review and model-routing rules take priority over global skills.

## Files

- `scripts/agents/agent-run.mjs`
- `scripts/agents/review.sh`
- `scripts/agents/review-brief.mjs`
- `scripts/agents/review-brief.sh`
- `scripts/agents/kit.d/review`
- AGENTS.md (one line)
- `tests/agent-scripts.test.ts`
- `tests/kit-review.test.ts`

## Done when

- Unit tests: base resolution with `~`/`^`/SHA, `--commit`, empty-diff refusal, missing scope error, footer always present, one retry then fail (fake CLI), evidence path, CODEX_HOME contents (no skills, no mcp_servers).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- Behaviour: `kit review [--base REF | --commit SHA] [--ticket FILE] [--pr N]` builds the brief,
  runs it and saves `result.md`, `run.log`, `diff.patch`, `refs.txt` under the main root
  `.scratch/reviews/<owner>/<UTC time>/` (named in the RESULT line; usage errors and bad refs
  save nothing and say `evidence none`). Codex reviews get a fresh `CODEX_HOME`: symlinked
  `auth.json` plus a config with `[skills] include_instructions = false`,
  `[skills.bundled] enabled = false` and `plugins`/`apps`/`memories` off. A rotated `auth.json`
  is copied back. Builds keep the normal home. Bases resolve with
  `git rev-parse --verify <ref>^{commit}`; `--commit` reviews one commit; no scope is an error; an
  empty diff fails before the model. The runner appends the REVIEW_STATUS footer exactly once and
  re-asks once in the same session (`codex exec resume <id>` / `claude --resume <id>`).
  `review.sh` is a thin wrapper. AGENTS.md: repo review/model rules beat global skills.
- Lead check (codex-cli 0.163.0, live): with only `model` in config, Codex still unpacked bundled
  skills into `$CODEX_HOME/skills` and loaded `~/.agents/skills` via HOME. With the config above,
  the model reported no skills, no MCP servers, no apps and only the repo AGENTS.md. A live resume
  kept the session, printed `model: gpt-6.1-sol` and stayed read-only.
- Commits: 852cd849 (Sol build; Claude fixes: show the review text, no empty evidence folders,
  Commit/Parent labels in the PR header).
- Tests: `tests/kit-review.test.ts` (new) plus `tests/agent-scripts.test.ts` updates; check, lint and
  unit 3542/3542 pass.
- Review (dogfooded through `kit review`, evidence
  `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-05/20261016T120954Z`): one finding,
  rejected. It asked `review.sh` to save main-root evidence too. The ticket ties evidence to
  `kit review` and keeps `review.sh` a thin compatible wrapper; its callers copy the folder by hand.
