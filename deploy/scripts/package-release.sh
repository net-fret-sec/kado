#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
TAG="$(git rev-parse HEAD)"
[[ -z "$(git status --porcelain)" ]] || { echo "Release packaging requires a clean commit" >&2; exit 1; }
OUT="${1:-release-artifacts/$TAG}"
mkdir -p "$OUT"
docker build --pull -f deploy/docker/api.Dockerfile -t "kado-api:$TAG" .
docker build --pull -f deploy/docker/caddy.Dockerfile --build-arg "VITE_DONATION_URL=${VITE_DONATION_URL:-}" -t "kado-web:$TAG" .
KADO_IMAGE_TAG="$TAG" pnpm release:smoke
docker save "kado-api:$TAG" "kado-web:$TAG" | gzip > "$OUT/images.tar.gz"
printf '%s\n' "$TAG" > "$OUT/version"
(cd "$OUT" && sha256sum images.tar.gz version > SHA256SUMS)
echo "Release bundle: $OUT"
