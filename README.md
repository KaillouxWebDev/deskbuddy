# Deskbuddy

Dashboard tactile de bureau pour Raspberry Pi 3B + écran officiel 7" (800x480), style radar phosphore.

**Onglets** : Radar (avions autour de chez toi via [adsb.lol](https://adsb.lol)), Imprimante (Bambu Lab A1 en lecture seule, alertes et notif de fin), Horloge (chrono et minuteurs), Système (thème clair/sombre/auto, couleurs, luminosité, stats du Pi), Claude (à définir).

Bouton lune dans la barre du haut : coupe l'écran, un toucher le rallume. Veille nocturne programmable.

## Architecture

```
Pi (Raspberry Pi OS Lite 64 bits)
├── conteneur deskbuddy (Node 22) : port 8080, WebSocket /ws
│   ├── modules : avions, imprimante (MQTT LAN), système, minuteurs, réglages
│   └── sert le front React buildé
├── Chromium en kiosque (cage) sur l'écran → http://localhost:8080/?kiosk=1
└── timer systemd : git pull + docker compose pull toutes les 5 min
```

Chaque push sur `main` déclenche GitHub Actions, qui construit l'image ARM64 et la publie sur `ghcr.io/kaillouxwebdev/deskbuddy`. Le Pi la récupère dans les 5 minutes, et l'écran se recharge tout seul sur la nouvelle version.

## Installation sur le Pi

Prérequis : Raspberry Pi OS Lite **64 bits**, Docker installé, utilisateur dans le groupe `docker`.

```bash
git clone https://github.com/KaillouxWebDev/deskbuddy.git ~/deskbuddy
cd ~/deskbuddy
./scripts/install-pi.sh      # crée .env et s'arrête
nano .env                    # coordonnées + infos de l'imprimante
./scripts/install-pi.sh      # installe tout
sudo reboot
```

Si le repo ou le paquet GHCR est privé, il faut s'authentifier sur le Pi (`docker login ghcr.io` avec un token `read:packages`, et un accès git pour le `git pull`).

## Développement sur ton PC

```bash
npm install
cp .env.example .env         # MOCK_PRINTER=1 pour simuler l'imprimante
npm run dev:server           # backend sur :8080 (lit .env)
npm run dev:web              # front sur http://localhost:5173
```

## Commandes utiles sur le Pi

```bash
docker logs -f deskbuddy                       # logs du serveur
systemctl list-timers deskbuddy-update.timer   # prochaine vérification de mise à jour
./scripts/update.sh                            # forcer une mise à jour
```
