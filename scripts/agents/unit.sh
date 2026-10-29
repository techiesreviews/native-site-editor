#!/usr/bin/env bash
# Forwarder: scripts/agents/unit.sh (named in the docs and briefs) runs the shared kit's unit.sh.
home=${KIT_HOME:-$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home)} || { printf '%s\n' "$home"; exit 2; }
exec "$home/unit.sh" "$@"
