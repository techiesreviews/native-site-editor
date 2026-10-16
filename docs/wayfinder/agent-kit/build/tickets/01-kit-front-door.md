---
title: "kit: the front door and shared helpers"
type: task (AFK)
status: closed
assignee: ak-01
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

## Done (2026-10-16)

- **Behaviour.** `scripts/agents/kit` lists every executable in `kit.d/` (name = file name minus one extension, summary from `# kit:` or `// kit:` in the first 15 lines), forwards `<command> --help`, and answers an unknown command with the list on stderr, `RESULT: fail unknown command <x>` and exit 2. A command run streams stdout line by line; if the last line is not a `RESULT:` line the kit adds `RESULT: ok <cmd> finished`, `RESULT: fail <cmd> exited <n> without a RESULT line` or, on INT/TERM/HUP (forwarded to the child), `RESULT: fail <cmd> interrupted`. Before running, the kit calls `kit_node` and exports `KIT_ROOT`, `KIT_MAIN_ROOT`, `KIT_LIB`, `KIT_LIB_MJS`.
- **Helpers** (same rules in `kit-lib.sh` and `kit-lib.mjs`): `kit_root`/`kitRoot` (KIT_ROOT, else git toplevel of cwd, else the kit's repo), `kit_main_root`/`kitMainRoot` (KIT_MAIN_ROOT, else `/home/ubulex/Projects/native-site-editor`), `kit_owner`/`kitOwner` (ASE_OWNER, else `.scratch/owner` field 2 unless `unknown`, else branch, else `unknown`), `kit_node_find` + `kit_node`/`findNode` + `nodeEnv` (system node if ≥24, else highest ≥24 in npx cache and nvm under `CLAUDE_NODE_SEARCH_ROOT`/HOME), `kit_result`/`kitResult`. Empty override variables count as unset.
- **Stub.** `kit.d/version` prints commit, owner and Node version.
- **Commits.** 93e396ce (built by Sol; empty-override fix by the runner).
- **Tests.** `tests/kit.test.ts` (16 tests: discovery, help, unknown, RESULT guarantee incl. crash/no-newline/signal, Node lookup bash + mjs with fakes, owner, result, roots, real `kit version`). `npm run check`, `npm run lint`, `unit.sh tests/kit.test.ts tests/agent-hooks.test.ts` (187 pass); Sol's run of the full `npm test` passed 3,512.
- **Review.** One Sol review: no defects, no gaps. Saved at `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-01/review/`.
