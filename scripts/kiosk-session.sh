#!/usr/bin/env bash
# Exécuté À L'INTÉRIEUR de cage : lance Chromium, et gare le curseur dans le coin bas-droit
# toutes les 2 s (filet de sécurité si une forme de curseur restait visible malgré le thème invisible).
# Nécessite le paquet wlrctl ; sans lui, on lance simplement Chromium.

"$@" &
BROWSER_PID=$!

if command -v wlrctl >/dev/null 2>&1; then
  (
    while kill -0 "$BROWSER_PID" 2>/dev/null; do
      wlrctl pointer move 10000 10000 >/dev/null 2>&1
      sleep 2
    done
  ) &
fi

wait "$BROWSER_PID"
