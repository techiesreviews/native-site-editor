#!/usr/bin/env bash
# Forwarder: scripts/agents/worktrees.sh (named in the docs and briefs) runs the shared kit's worktrees.sh, in the kit
# kit-pick.sh picks and hands down.
# shellcheck source=scripts/agents/kit-pick.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/kit-pick.sh"
exec "$KIT_HOME/worktrees.sh" "$@"
