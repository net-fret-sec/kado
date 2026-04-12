#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-deploy/.env.production}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [[ ! -f "deploy/env/api.env" ]]; then
  echo "Missing API env file: deploy/env/api.env"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

echo "==> Building images"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull

echo "==> Starting PostgreSQL"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db

echo "==> Applying migrations"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api pnpm --dir apps/api run db:migrate

echo "==> Starting API and Caddy"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api caddy

echo "==> Current service status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
