#!/usr/bin/env bash
# Exécuté toutes les 5 min par le timer systemd deskbuddy-update : récupère la dernière version et redémarre si besoin.
set -u
cd "$(dirname "$0")/.."

git pull --ff-only -q 2>/dev/null || echo "[update] git pull impossible, on continue avec l'image"
docker compose pull -q && docker compose up -d --remove-orphans
docker image prune -f >/dev/null
