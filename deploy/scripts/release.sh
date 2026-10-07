#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_config "${1:-deploy/.env.production}"
BUNDLE="$(realpath "${2:?Supply a validated release directory}")"
lock_operations
[[ -f "$BUNDLE/SHA256SUMS" && -f "$BUNDLE/images.tar.gz" && -f "$BUNDLE/version" ]] || { echo "Incomplete release" >&2; exit 1; }
(cd "$BUNDLE" && sha256sum --check --strict SHA256SUMS)
IMAGE_TAG="$(cat "$BUNDLE/version")"
[[ "$IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid version" >&2; exit 1; }
export IMAGE_TAG
trap 'echo "Release failed. Inspect service state; no automatic restoration or database downgrade was performed." >&2' ERR
# Always back up the initialized database, including an existing volume with no container.
compose up -d --wait --wait-timeout 90 db
backup_database "${KADO_BACKUP_DIR:-deploy/backups}"
docker load -i "$BUNDLE/images.tar.gz"
compose up -d --wait --wait-timeout 90 db
compose run --rm --no-deps api node dist/migrate.cjs
compose up -d --wait --wait-timeout 90 api caddy
compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1))"
echo "Release verified: $IMAGE_TAG. Persist IMAGE_TAG in the trusted environment file for future operations."
