#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-deploy/.env.production}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DUMP_FILE="${2:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: $0 [env-file] /path/to/backup.dump"
  exit 1
fi

echo "This will overwrite database data."
read -r -p "Type RESTORE_KADO to continue: " CONFIRM

if [[ "$CONFIRM" != "RESTORE_KADO" ]]; then
  echo "Restore cancelled."
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges < "$DUMP_FILE"

echo "Restore completed from $DUMP_FILE"
