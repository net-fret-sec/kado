#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
load_config() {
  ENV_FILE="$(realpath "${1:-deploy/.env.production}")"
  [[ -f "$ENV_FILE" ]] || { echo "Missing configuration" >&2; exit 1; }
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${POSTGRES_DB:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}"
  [[ "$POSTGRES_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || { echo "Invalid database name" >&2; exit 1; }
  COMPOSE_FILE="${KADO_COMPOSE_FILE:-$ROOT/deploy/docker-compose.prod.yml}"
  export IMAGE_TAG="${IMAGE_TAG:-unselected}"
}
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
lock_operations() {
  local lock_file="${KADO_OPERATION_LOCK:-$ROOT/deploy/.operation.lock}"
  exec 9>"$lock_file"
  flock -n 9 || { echo "Another database or release operation is running" >&2; exit 1; }
}
backup_database() {
  local dir="$1" temp out
  umask 077
  mkdir -p "$dir"
  temp="$(mktemp "$dir/.kado-XXXXXXXX.dump")"
  if ! compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$temp"; then rm -f "$temp"; return 1; fi
  if [[ ! -s "$temp" ]] || ! compose exec -T db pg_restore --list < "$temp" >/dev/null; then rm -f "$temp"; return 1; fi
  out="$dir/kado-$(date -u +%Y%m%dT%H%M%S)-$(basename "$temp" .dump).dump"
  mv "$temp" "$out"
  # Keep a successful daily snapshot for each of the most recent fourteen days.
  python3 - "$dir" <<'ROTATE'
import sys
from pathlib import Path
files=sorted(Path(sys.argv[1]).glob('kado-*.dump'),reverse=True)
seen=set()
for file in files:
    day=file.name[5:13]
    if day in seen or len(seen)>=14: file.unlink()
    else: seen.add(day)
ROTATE
  echo "Backup verified: $out"
}
