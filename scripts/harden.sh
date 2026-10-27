#!/usr/bin/env bash
# Durcissement du Pi, à lancer une fois depuis une session SSH : ./scripts/harden.sh
#  1. SSH par clé uniquement (mots de passe refusés), root interdit.
#  2. Pare-feu ufw : tout entrant refusé, sauf SSH et mDNS (deskbuddy.local) depuis ton réseau local actuel.
# Garde-fous : rien n'est coupé si aucune clé SSH n'est installée, et ta connexion en cours reste autorisée.
# En voyage, pour autoriser SSH depuis le réseau où tu es : ./scripts/harden.sh --allow-here
set -euo pipefail

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!! %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -ne 0 ] || die "Lance ce script sans sudo."

# Réseaux locaux auxquels le Pi est branché en ce moment (ex. 192.168.1.0/24).
subnets() { ip -o -4 route show scope link | awk '$1 ~ /\// && $3 != "docker0" {print $1}' | sort -u; }

allow_subnets() {
  for net in $(subnets); do
    sudo ufw allow from "$net" to any port 22 proto tcp comment 'SSH depuis le réseau local' >/dev/null
    sudo ufw allow from "$net" to any port 5353 proto udp comment 'mDNS deskbuddy.local' >/dev/null
    echo "   autorisé : $net"
  done
}

if [ "${1:-}" = "--allow-here" ]; then
  say "Autorisation de SSH depuis le réseau actuel"
  allow_subnets
  exit 0
fi

say "1/2 · SSH par clé uniquement"
if [ -s "$HOME/.ssh/authorized_keys" ] && grep -qE '^(ssh-|ecdsa-|sk-)' "$HOME/.ssh/authorized_keys"; then
  sudo tee /etc/ssh/sshd_config.d/10-deskbuddy.conf >/dev/null <<'EOF'
# Deskbuddy : connexion SSH par clé uniquement
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  sudo sshd -t || die "Configuration SSH invalide, rien n'a été rechargé."
  sudo systemctl reload ssh
  echo "   mots de passe désactivés (ta clé reste valable ; garde cette session ouverte et teste une nouvelle connexion)"
else
  warn "Aucune clé SSH installée : je ne désactive PAS les mots de passe (tu serais bloqué dehors)."
  echo "   Depuis ton PC : ssh-copy-id $(id -un)@$(hostname).local   puis relance ce script."
fi

say "2/2 · Pare-feu"
command -v ufw >/dev/null || sudo apt-get install -y -qq ufw
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
allow_subnets
# Ne jamais couper la session en cours, même si elle vient d'ailleurs.
if [ -n "${SSH_CLIENT:-}" ]; then
  me="${SSH_CLIENT%% *}"
  sudo ufw allow from "$me" to any port 22 proto tcp comment 'session de configuration' >/dev/null
  echo "   autorisé : $me (ta connexion actuelle)"
fi
echo
read -r -p "Activer le pare-feu maintenant ? [o/N] " ok
if [ "$ok" = "o" ] || [ "$ok" = "O" ]; then
  sudo ufw --force enable >/dev/null
  sudo ufw status numbered
  echo
  echo "Le dashboard n'écoute que sur le Pi lui-même : il n'a besoin d'aucune ouverture."
else
  echo "Pare-feu préparé mais pas activé (sudo ufw enable pour l'activer)."
fi
