#!/usr/bin/env bash
set -euo pipefail
# Run the report inside the existing API container to use its actual DB and timezone.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
config=deploy/.env.production
format=text
config_set=false
for arg in "$@"; do
  case "$arg" in
    --json) format=json ;;
    --help|-h)
      echo "Usage: bash deploy/scripts/status.sh [deploy/.env.production] [--json]"
      echo "Bilan agrégé en lecture seule. Les services API et PostgreSQL doivent fonctionner."
      exit 0 ;;
    -*) echo "Option inconnue : $arg" >&2; exit 2 ;;
    *)
      if "$config_set"; then echo "Un seul fichier de configuration est accepté." >&2; exit 2; fi
      config="$arg"; config_set=true ;;
  esac
done
load_config "$config"
compose exec -T api node --input-type=module - "$format" < "$ROOT/deploy/scripts/status.mjs"
