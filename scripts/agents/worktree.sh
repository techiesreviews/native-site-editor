#!/usr/bin/env bash
# Forwarder: scripts/agents/worktree.sh (named in the docs and briefs) runs the shared kit's worktree.sh.
home=${KIT_HOME:-$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home)} || { printf '%s\n' "$home"; exit 2; }
exec "$home/worktree.sh" "$@"
