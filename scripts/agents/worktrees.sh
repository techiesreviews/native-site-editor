#!/usr/bin/env bash
# Forwarder: scripts/agents/worktrees.sh (named in the docs and briefs) runs the shared kit's worktrees.sh.
# The launcher picks the kit as for a kit command (a person's KIT_HOME wins; a removed pinned one is picked again).
home=$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home) || { printf '%s\n' "$home"; exit 2; }
# The helper and everything below it keep this kit (one command never mixes two kits); a kit the launcher picked
# keeps its marker, a person's KIT_HOME stays theirs.
if [[ -z ${KIT_HOME:-} || $KIT_HOME == "${KIT_HOME_DEFAULT:-}" || $KIT_HOME == "${KIT_HOME_PINNED:-}" ]]; then export KIT_HOME_PINNED=$home; fi
export KIT_HOME=$home
exec "$home/worktrees.sh" "$@"
