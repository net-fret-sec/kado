#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_config "${1:-deploy/.env.production}"
python3 "$ROOT/deploy/scripts/monitor.py" "$ROOT" "$ENV_FILE" --collect
