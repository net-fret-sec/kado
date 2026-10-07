#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_config "${1:-deploy/.env.production}"
DUMP_FILE="$(realpath "${2:?Supply a dump}")"
[[ -s "$DUMP_FILE" ]] || { echo "Missing dump" >&2; exit 1; }
lock_operations
compose exec -T db pg_restore --list < "$DUMP_FILE" >/dev/null
read -r -p "Restoration replaces data. Type RESTORE_KADO: " confirm
[[ "$confirm" == RESTORE_KADO ]] || { echo "Cancelled"; exit 1; }
compose stop api
# Fixed, validated identifier; terminate clients before drop, API remains stopped on failure.
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB' AND pid <> pg_backend_pid();"
compose exec -T db dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T db pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges < "$DUMP_FILE"
compose up -d --wait --wait-timeout 90 api
compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1))"
echo "Restoration verified"
