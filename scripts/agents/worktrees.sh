#!/usr/bin/env bash
# Forwarder: scripts/agents/worktrees.sh (named in the docs and briefs) runs the shared kit's worktrees.sh.
home=${KIT_HOME:-$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home)} || { printf '%s\n' "$home"; exit 2; }
exec "$home/worktrees.sh" "$@"
