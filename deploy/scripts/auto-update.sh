#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE="${LOCK_FILE:-/tmp/kado-autodeploy.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] Another auto-update run is already in progress."
  exit 0
fi

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-deploy/.env.production}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
RELEASE_SCRIPT="$REPO_DIR/deploy/scripts/release.sh"

log() {
  echo "[$(date -Iseconds)] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

cd "$REPO_DIR"

[[ -x "$RELEASE_SCRIPT" || -f "$RELEASE_SCRIPT" ]] || fail "Missing release script: $RELEASE_SCRIPT"
[[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Directory is not a git repository: $REPO_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || fail "Checked out branch is '$CURRENT_BRANCH', expected '$BRANCH'."

git diff --quiet || fail "Working tree has unstaged changes. Refusing to auto-update."
git diff --cached --quiet || fail "Working tree has staged changes. Refusing to auto-update."

log "Fetching updates from $REMOTE/$BRANCH"
git fetch --prune "$REMOTE"

REMOTE_REF="refs/remotes/$REMOTE/$BRANCH"
git show-ref --verify --quiet "$REMOTE_REF" || fail "Remote branch not found: $REMOTE/$BRANCH"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE/$BRANCH")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  log "No updates detected."
  exit 0
fi

git merge-base --is-ancestor "$LOCAL_SHA" "$REMOTE_SHA" || fail "Local branch is not behind remote (fast-forward impossible). Manual intervention required."

log "Update detected: $LOCAL_SHA -> $REMOTE_SHA"
log "Pulling latest changes"
git pull --ff-only "$REMOTE" "$BRANCH"

log "Running deployment"
bash "$RELEASE_SCRIPT" "$ENV_FILE"

log "Deployment completed successfully"
