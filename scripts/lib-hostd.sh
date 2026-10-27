# Installe ou met à jour le service hôte (seule partie qui tourne en root). Sourcé par install-pi.sh et update.sh.
# Le script est copié dans /usr/local/lib/deskbuddy (propriété de root) : le service n'exécute jamais
# directement un fichier du dépôt modifiable par l'utilisateur.

install_hostd() {
  local repo="$1" user="$2"
  local group
  group="$(id -gn "$user")"
  local src="$repo/scripts/hostd.py" dst=/usr/local/lib/deskbuddy/hostd.py
  local unit=/etc/systemd/system/deskbuddy-hostd.service
  local want_unit
  want_unit="[Unit]
Description=Deskbuddy : service hôte (écran, Wi-Fi, fuseau horaire)
After=NetworkManager.service
Before=docker.service

[Service]
ExecStart=/usr/bin/python3 $dst
Environment=HOSTD_GROUP=$group
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target"

  local changed=0
  if ! sudo cmp -s "$src" "$dst" 2>/dev/null; then
    sudo install -D -o root -g root -m 0755 "$src" "$dst" && changed=1
  fi
  if [ "$(sudo cat "$unit" 2>/dev/null)" != "$want_unit" ]; then
    echo "$want_unit" | sudo tee "$unit" >/dev/null && changed=1
    sudo systemctl daemon-reload
  fi
  sudo systemctl enable deskbuddy-hostd.service >/dev/null 2>&1
  if [ "$changed" = 1 ] || ! systemctl is-active --quiet deskbuddy-hostd.service; then
    sudo systemctl restart deskbuddy-hostd.service
    echo "[hostd] service hôte (re)démarré"
  fi
}

# Les fichiers de data/ écrits par l'ancien conteneur (root) doivent appartenir à l'utilisateur.
fix_data_owner() {
  local repo="$1"
  mkdir -p "$repo/data"
  if [ -n "$(find "$repo/data" ! -user "$(id -u)" -print -quit 2>/dev/null)" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$repo/data"
  fi
}

# UID/GID de l'utilisateur pour docker-compose.yml.
ensure_ids_in_env() {
  local env="$1"
  grep -q '^DESKBUDDY_UID=' "$env" 2>/dev/null || printf '\n# Utilisateur du conteneur (rempli automatiquement)\nDESKBUDDY_UID=%s\nDESKBUDDY_GID=%s\n' "$(id -u)" "$(id -g)" >> "$env"
}
