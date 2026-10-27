#!/usr/bin/env bash
# Installation de Deskbuddy sur le Raspberry Pi (à lancer depuis le dossier du repo, sans sudo).
# Ré-exécutable sans risque : chaque étape vérifie ce qui est déjà en place.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Lance ce script sans sudo : ./scripts/install-pi.sh"
command -v docker >/dev/null || die "Docker n'est pas installé."
docker info >/dev/null 2>&1 || die "Ton utilisateur n'a pas accès à Docker (reconnecte-toi après 'sudo usermod -aG docker $USER_NAME')."
cd "$REPO_DIR"
chmod +x scripts/*.sh

say "Fichier de configuration .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Je viens de créer .env : remplis-le (nano .env), puis relance ce script."
  exit 0
fi
mkdir -p data

say "Paquets du kiosque (cage + chromium)"
sudo apt-get update -qq
sudo apt-get install -y -qq cage curl git python3
sudo apt-get install -y -qq wlrctl || echo "(wlrctl indisponible : le curseur ne sera pas garé dans le coin, seulement rendu invisible)"
sudo apt-get install -y -qq chromium 2>/dev/null || sudo apt-get install -y -qq chromium-browser

say "Service hôte (écran, Wi-Fi, fuseau horaire) et droits du dossier data"
# shellcheck source=lib-hostd.sh
. "$REPO_DIR/scripts/lib-hostd.sh"
install_hostd "$REPO_DIR" "$USER_NAME"
fix_data_owner "$REPO_DIR"
ensure_ids_in_env "$REPO_DIR/.env"

say "Image Docker"
if ! docker compose pull; then
  die "Impossible de récupérer l'image. Si le paquet GHCR est privé : docker login ghcr.io -u <ton-user-github> (token avec le droit read:packages), puis relance."
fi
docker compose up -d --remove-orphans

say "Mise à jour automatique toutes les 5 minutes"
sudo tee /etc/systemd/system/deskbuddy-update.service >/dev/null <<EOF
[Unit]
Description=Deskbuddy : mise à jour automatique
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$USER_NAME
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/scripts/update.sh
EOF
sudo tee /etc/systemd/system/deskbuddy-update.timer >/dev/null <<EOF
[Unit]
Description=Deskbuddy : vérification des mises à jour

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now deskbuddy-update.timer

say "Kiosque au démarrage (autologin console sur l'écran)"
sudo raspi-config nonint do_boot_behaviour B2
MARK="# >>> deskbuddy kiosk >>>"
if ! grep -q "$MARK" "$HOME/.bash_profile" 2>/dev/null; then
  # Si .bash_profile n'existait pas, bash ne lirait plus .profile : on le garde chargé.
  [ -f "$HOME/.bash_profile" ] || echo '[ -f "$HOME/.profile" ] && . "$HOME/.profile"' > "$HOME/.bash_profile"
  cat >> "$HOME/.bash_profile" <<EOF

$MARK
if [ -z "\${WAYLAND_DISPLAY:-}" ] && [ "\$(tty)" = "/dev/tty1" ]; then
  exec $REPO_DIR/scripts/kiosk.sh
fi
# <<< deskbuddy kiosk <<<
EOF
fi

say "Terminé. Redémarre le Pi : sudo reboot"
echo "Logs du serveur : docker logs -f deskbuddy"
