# shellcheck shell=bash
# Sourced by this editor's forwarders and kit shots: the kit the launcher picks for a kit command (a person's
# KIT_HOME wins; a front door's KIT_HOME_DEFAULT or a removed pinned one is picked again), exported as KIT_HOME so
# the helper and everything below it keep it (one command never mixes two kits). A kit the launcher picked gets the
# marker KIT_HOME_PINNED, so a child whose folder kit update removed picks again; a person's KIT_HOME stays theirs.
# Without a kit it prints the launcher's RESULT line and exits 2. kitChildEnv (kit-home.mjs) is the Node twin.
kit_pick_home=$("$(dirname -- "${BASH_SOURCE[0]}")/kit" --home) || { printf '%s\n' "$kit_pick_home"; exit 2; }
if [[ -z ${KIT_HOME:-} || $KIT_HOME == "${KIT_HOME_DEFAULT:-}" || $KIT_HOME == "${KIT_HOME_PINNED:-}" ]]; then export KIT_HOME_PINNED=$kit_pick_home; fi
export KIT_HOME=$kit_pick_home
unset kit_pick_home
