#!/usr/bin/env bash
# Exécuté toutes les 5 min par le timer systemd deskbuddy-update : récupère la dernière version et redémarre si besoin.
set -u
cd "$(dirname "$0")/.."
REPO="$(pwd)"

if [ "${1:-}" != "--after-pull" ]; then
  before="$(sha1sum scripts/update.sh)"
  git pull --ff-only -q 2>/dev/null || echo "[update] git pull impossible, on continue avec l'image"
  # Ce script vient peut-être d'être mis à jour : on relance la nouvelle version.
  [ "$(sha1sum scripts/update.sh)" != "$before" ] && exec "$REPO/scripts/update.sh" --after-pull
fi

# shellcheck source=lib-hostd.sh
. "$REPO/scripts/lib-hostd.sh"
install_hostd "$REPO" "$(id -un)" || echo "[update] service hôte : installation impossible (sudo ?)"
fix_data_owner "$REPO"
ensure_ids_in_env "$REPO/.env"

docker compose pull -q && docker compose up -d --remove-orphans
docker image prune -f >/dev/null
