#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_config "${1:-deploy/.env.production}"
lock_operations
backup_database "${2:-deploy/backups}"
