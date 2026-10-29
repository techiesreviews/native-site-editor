#!/usr/bin/env bash
# Forwarder: scripts/agents/agent.sh (named in the docs and briefs) runs the shared kit's agent.sh.
home=${KIT_HOME:-$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home)} || { printf '%s\n' "$home"; exit 2; }
exec "$home/agent.sh" "$@"
