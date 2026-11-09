#!/usr/bin/env bash
set -euo pipefail
# Host-side reporting stays available when the API or PostgreSQL is down.
# shellcheck source=deploy/scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
config=deploy/.env.production
format=text
config_set=false
options=()
for arg in "$@"; do
  case "$arg" in
    --json) format=json ;;
    --read-only|--history) options+=("$arg") ;;
    --help|-h)
      echo "Usage: bash deploy/scripts/status.sh [deploy/.env.production] [--json] [--read-only] [--history]"
      echo "Échanges lus sans modification ; état des services et totaux serveur et demandes classées; historique sur 90 jours."
      exit 0 ;;
    -*) echo "Option inconnue : $arg" >&2; exit 2 ;;
    *)
      if "$config_set"; then echo "Un seul fichier de configuration est accepté." >&2; exit 2; fi
      config="$arg"; config_set=true ;;
  esac
done
load_config "$config"
python3 "$ROOT/deploy/scripts/monitor.py" "$ROOT" "$ENV_FILE" --format "$format" "${options[@]}"
