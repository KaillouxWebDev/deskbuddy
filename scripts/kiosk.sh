#!/usr/bin/env bash
# Lancé automatiquement sur tty1 (voir ~/.bash_profile) : Chromium plein écran via le compositeur cage.
URL="http://localhost:8080/?kiosk=1"
PROFILE="$HOME/.config/deskbuddy-chromium"
BROWSER="$(command -v chromium || command -v chromium-browser)"

# Attend que le conteneur réponde (jusqu'à 3 min au premier démarrage).
for _ in $(seq 1 90); do
  curl -fs http://localhost:8080/health >/dev/null && break
  sleep 2
done

# Évite le bandeau « Chromium ne s'est pas fermé correctement » après une coupure de courant.
mkdir -p "$PROFILE/Default"
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' \
  "$PROFILE/Default/Preferences" 2>/dev/null || true

# Curseur invisible : cage affiche sinon une flèche fixe au centre de l'écran tactile.
ICONS="$HOME/.local/share/icons"
export XCURSOR_THEME="$(python3 "$(dirname "$0")/hide-cursor.py" "$ICONS" 2>/dev/null || echo default)"
export XCURSOR_PATH="$ICONS:/usr/share/icons"
export XCURSOR_SIZE=24

cage -d -s -- "$BROWSER" \
  --kiosk \
  --user-data-dir="$PROFILE" \
  --ozone-platform=wayland \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=Translate,TouchpadOverscrollHistoryNavigation \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  "$URL"

# Si le navigateur s'arrête, la session se ferme et l'autologin le relance.
sleep 3
