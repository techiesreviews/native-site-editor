---
title: "kit review: clean Codex home, sturdy scope, retry, saved evidence"
type: task (AFK)
status: open
assignee:
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
