#!/usr/bin/env bash
# Forwarder: scripts/agents/worktrees.sh (named in the docs and briefs) runs the shared kit's worktrees.sh.
# The launcher picks the kit as for a kit command (a person's KIT_HOME wins; a removed pinned one is picked again).
home=$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home) || { printf '%s\n' "$home"; exit 2; }
exec "$home/worktrees.sh" "$@"
