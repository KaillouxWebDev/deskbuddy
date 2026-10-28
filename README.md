# Deskbuddy

Dashboard tactile de bureau pour Raspberry Pi 3B + écran officiel 7" (800x480), style radar phosphore.

**Onglets** : Radar (avions autour de chez toi via [adsb.fi](https://adsb.fi), avec [adsb.lol](https://adsb.lol) en secours, départ/arrivée via [adsbdb](https://www.adsbdb.com), fréquences des aéroports proches via [OurAirports](https://ourairports.com)), Météo (radar pluie animé [RainViewer](https://www.rainviewer.com), éclairs Meteosat MTG d'[EUMETSAT](https://view.eumetsat.int), prévisions et qualité de l'air [Open-Meteo](https://open-meteo.com), vigilances [MeteoAlarm](https://meteoalarm.org), villes [GeoNames](https://www.geonames.org)), Espace (passages de l'ISS et des satellites radioamateurs avec visibilité à l'œil nu et Doppler, orbites [Celestrak](https://celestrak.org), conditions solaires [N0NBH](https://www.hamqsl.com), lancements [The Space Devs](https://thespacedevs.com)), Imprimante (Bambu Lab A1 en lecture seule, alertes, notif de fin, stock de filament alimenté par les puces RFID des bobines, décompte et coût par impression, historique des 10 dernières impressions ; noms de couleurs officiels Bambu tirés du catalogue de Bambu Studio), Horloge (chrono et minuteurs). Réglages (roue crantée en haut à droite) : thème clair/sombre/auto, couleurs, luminosité, stats du Pi, **lieu** (pavé numérique, pour emmener le dashboard en vacances) et **Wi-Fi** (liste des réseaux et clavier tactile, par exemple pour le partage de connexion du téléphone). Nom du lieu et zone de vigilance via [Nominatim](https://nominatim.openstreetmap.org) (© contributeurs OpenStreetMap).

Bouton lune dans la barre du haut : coupe l'écran, un toucher le rallume. Veille nocturne programmable, avec un thème de nuit au choix et un écran de veille optionnel (horloge et message du thème).

**Thèmes** (22, avec écran de démarrage) : Base et Modern aux couleurs personnalisables, puis des ambiances inspirées du cinéma, des séries et des jeux vidéo (aucun logo ni personnage repris) et de métiers réels (contrôle aérien, salle de contrôle Apollo, mode nuit rouge pour l'observation du ciel). Polices libres embarquées.

## Architecture

```
Pi (Raspberry Pi OS Lite 64 bits)
├── service hôte deskbuddy-hostd (root, socket /run/deskbuddy/hostd.sock) : écran, Wi-Fi, fuseau
├── conteneur deskbuddy (Node 22, sans privilèges) : 127.0.0.1:8080, WebSocket /ws
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

## Sécurité

- Le conteneur tourne **sans aucun privilège** (ton utilisateur, aucune capacité Linux, système de fichiers en lecture seule).
  Écran, Wi-Fi et fuseau horaire passent par un petit service hôte (`scripts/hostd.py`, root) qui n'accepte qu'une liste
  fermée de commandes vérifiées, sur un socket Unix réservé à ton groupe.
- Le dashboard n'écoute que sur `127.0.0.1` et refuse les connexions venant d'autres sites (`BIND` dans `.env` pour le dev).
- Les actions GitHub sont figées par empreinte de commit ; Dependabot propose les mises à jour.
- `./scripts/harden.sh` (une fois, en SSH) : SSH par clé uniquement et pare-feu ufw. En voyage, `./scripts/harden.sh --allow-here`
  autorise SSH depuis le réseau où tu es.
- Point d'attention : tout ce qui arrive sur `main` est déployé sur le Pi en 5 min. Protège ton compte GitHub (2FA)
  et la branche `main`.

## Commandes utiles sur le Pi

```bash
docker logs -f deskbuddy                       # logs du serveur
journalctl -u deskbuddy-hostd -f               # logs du service hôte (écran, Wi-Fi, fuseau)
systemctl list-timers deskbuddy-update.timer   # prochaine vérification de mise à jour
./scripts/update.sh                            # forcer une mise à jour
```
