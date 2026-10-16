---
title: "kit: the front door and shared helpers"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
---

## What

- `scripts/agents/kit` (bash): with no arguments lists every command in `scripts/agents/kit.d/` with its `# kit:` summary; `kit <command> [args]` runs it; `kit <command> --help` prints that command's usage; an unknown command prints the list and exits 2.
- `kit-lib.sh` / `kit-lib.mjs`: `kit_node` finds the Node ≥24 binary the same way `hooks/session-env.sh` does (system node first, then npx cache, then nvm) and puts it on PATH for the child, so callers never type PATH by hand; `kit_owner` returns `ASE_OWNER`, else the worktree's `.scratch/owner` owner, else the branch name; `kit_result <ok|fail> <one line>` prints exactly one final `RESULT: ok …` / `RESULT: fail …` line. The kit entry guarantees a `RESULT:` line even when a command crashes (trap).
- Root helpers: `kit_root` (worktree root) and `kit_main_root` (`/home/ubulex/Projects/native-site-editor`, the root checkout whose `.scratch/` survives worktree removal).
- Works the same from Claude and Codex (no reliance on SessionStart).

## Files

- `scripts/agents/kit`
- `scripts/agents/kit-lib.sh`
- `scripts/agents/kit-lib.mjs`
- scripts/agents/kit.d/ (new folder; no commands yet besides a `version` or `help` stub if needed)
- `tests/kit.test.ts`

## Done when

- `scripts/agents/kit` lists commands and `--help` works; a fake command folder in the test proves discovery, help, unknown command and the trap `RESULT:` line.
- Node lookup is unit-tested with `CLAUDE_NODE_SEARCH_ROOT` fakes (old system node → picks the highest ≥24).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
