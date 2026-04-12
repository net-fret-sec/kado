#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-deploy/.env.production}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
BACKUP_DIR="${2:-deploy/backups}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/kado-$TS.dump"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT_FILE"

echo "Backup written to $OUT_FILE"
