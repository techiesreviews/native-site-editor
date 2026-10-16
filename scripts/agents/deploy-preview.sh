#!/usr/bin/env bash
# Usage: deploy-preview.sh [--dry-run] [--help]; deploy origin/dev through kit preview.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
exec "$script_dir/kit" preview "$@"
