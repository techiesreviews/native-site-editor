# Context card

At session start every agent sees a short card of Lex's current thinking for the project, read
fresh from his central memory in `~/Projects/chat/memory/` and never copied into the project
([factory 10](../wayfinder/software-factory/tickets/10-grill-central-memory.md#resolution-2026-10-22)).
The chat project's memory sync writes the notes
(`~/Projects/chat/memory/project-notes/README.md`); this repo only reads them.

## What it prints

The kit's [`context-card.mjs`](https://github.com/techiesreviews/agent-kit/blob/main/context-card.mjs) is plain Node with no
imports from this repo, so any project can call it by absolute path. It matches the working
directory against the `Workspace` column of the README's project map (a folder inside the
workspace up to that folder's own repository, or a sibling worktree named `<workspace>-*`,
counts; the most specific row wins, so an unmapped repo under a catch-all row such as
`~/Projects` gets no card) and
prints at most 30 lines, each cut to 160 characters with `…`:

- a title line, then the note's Current thinking, Recent decisions (newest 5) and Open questions;
- `corrections (14 days): <n>, repeated: <m> — ~/Projects/chat/memory/corrections/<slug>.md` when
  that file exists;
- `More: ask for the full note.` Asked for more, read `project-notes/<slug>.md` in full.

No folder, no matching row or no note prints `context card: no notes for this project yet` and
exits 0. `CHAT_MEMORY_DIR` overrides the folder (tests). `--cwd DIR` picks another folder;
`--hook` reads a SessionStart payload on stdin (its `cwd` wins) and prints
`{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":…}}`.

## In this repo

`scripts/agents/kit card` prints the card for this worktree. The SessionStart hooks in
`.claude/settings.json` and `.codex/hooks.json` call `scripts/agents/hooks/run.sh context-card`
([Hooks](guardrails.md#hooks)).

## Every other project

The card is the kit's own `context-card.mjs` (in the [agent-kit repo](https://github.com/techiesreviews/agent-kit)),
so every project `kit init` sets up shows it through its own hook launcher. For a project without the kit, one
user-level SessionStart hook per CLI calls the machine copy by absolute path. It skips projects with a hook
launcher (`scripts/agents/hooks/run.sh`), so they do not show the card twice.

Claude, `~/.claude/settings.json` (merge into any existing `hooks`):

```json
{"hooks": {"SessionStart": [{"hooks": [{"type": "command", "command": "test -f \"$(git rev-parse --show-toplevel 2>/dev/null)/scripts/agents/hooks/run.sh\" || timeout 1 node \"${XDG_DATA_HOME:-$HOME/.local/share}/agent-kit/current/context-card.mjs\" --hook 2>/dev/null || true"}]}]}}
```

Codex, `~/.codex/hooks.json`: the same JSON. Interactive Codex asks once to approve the new hook.

Installing these is a change to Lex's own settings: the lead asks him first and installs after his
yes. Builders never edit files outside the repo.
