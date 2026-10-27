#!/usr/bin/env python3
"""
Service hôte Deskbuddy : seul composant qui tourne en root sur le Pi.

Le conteneur du dashboard n'a plus aucun privilège. Pour piloter l'écran, le Wi-Fi ou le fuseau horaire,
il envoie une commande sur un socket Unix ; ce service n'accepte qu'une liste fermée de commandes,
vérifie chaque paramètre et n'utilise jamais de shell. Une faille dans le dashboard ne donne donc
accès qu'à ces quelques actions, pas au Pi entier.

Protocole : une ligne JSON {"cmd": "...", "args": {...}} -> une ligne JSON {"ok": true, "data": ...}.
"""
import glob
import grp
import json
import os
import re
import socketserver
import subprocess
import sys
import threading

SOCKET_PATH = os.environ.get("HOSTD_SOCKET", "/run/deskbuddy/hostd.sock")
SOCKET_GROUP = os.environ.get("HOSTD_GROUP", "deskbuddy")
IFACE = os.environ.get("HOSTD_WIFI_IFACE", "wlan0")
BACKLIGHT_GLOB = os.environ.get("HOSTD_BACKLIGHT_GLOB", "/sys/class/backlight/*")
ZONEINFO = "/usr/share/zoneinfo"
NMCLI_LOCK = threading.Lock()  # une seule opération Wi-Fi à la fois


class Refused(Exception):
    pass


# ---------- Rétroéclairage ----------

def _backlight():
    dirs = sorted(glob.glob(BACKLIGHT_GLOB))
    return dirs[0] if dirs else None


def _read(path):
    with open(path) as f:
        return f.read().strip()


def _write(path, value):
    with open(path, "w") as f:
        f.write(str(value))


def backlight_info(_):
    d = _backlight()
    if not d:
        return {"present": False}
    return {"present": True, "max": int(_read(os.path.join(d, "max_brightness")))}


def backlight_set(args):
    pct = args.get("pct")
    if not isinstance(pct, (int, float)) or not 0 <= pct <= 100:
        raise Refused("pct doit être entre 0 et 100")
    d = _backlight()
    if not d:
        raise Refused("pas de rétroéclairage")
    mx = int(_read(os.path.join(d, "max_brightness")))
    _write(os.path.join(d, "brightness"), max(1, round(mx * pct / 100)) if pct > 0 else 0)
    return True


def backlight_power(args):
    on = args.get("on")
    if not isinstance(on, bool):
        raise Refused("on doit être un booléen")
    d = _backlight()
    if not d:
        raise Refused("pas de rétroéclairage")
    p = os.path.join(d, "bl_power")
    if os.path.exists(p):
        _write(p, 0 if on else 1)
    elif not on:
        _write(os.path.join(d, "brightness"), 0)
    return True


# ---------- Wi-Fi (NetworkManager) ----------

def _ssid(args):
    s = args.get("ssid")
    if not isinstance(s, str) or not s or len(s.encode()) > 32 or "\x00" in s or s.startswith("-"):
        raise Refused("nom de réseau invalide")
    return s


def _nmcli(*a, timeout=45):
    with NMCLI_LOCK:
        r = subprocess.run(["nmcli", *a], capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise Refused((r.stderr or r.stdout).strip().replace("Error: ", "") or "échec nmcli")
    return r.stdout


def _terse(out):
    rows = []
    for line in out.splitlines():
        if line:
            rows.append([f.replace("\\:", ":").replace("\\\\", "\\") for f in re.split(r"(?<!\\):", line)])
    return rows


def wifi_status(_):
    dev = _terse(_nmcli("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"))
    conns = _terse(_nmcli("-t", "-f", "NAME,TYPE", "connection", "show"))
    wl = next((r for r in dev if r[0] == IFACE or (len(r) > 1 and r[1] == "wifi")), None)
    return {
        "available": bool(wl),
        "current": wl[3] if wl and len(wl) > 3 and wl[2] == "connected" else None,
        "saved": [r[0] for r in conns if len(r) > 1 and r[1] == "802-11-wireless"],
    }


def wifi_scan(_):
    out = _nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "yes", timeout=40)
    best = {}
    for r in _terse(out):
        if len(r) < 4 or not r[1].strip():
            continue  # réseau masqué
        n = {"ssid": r[1], "signal": int(r[2] or 0), "secure": r[3] not in ("", "--"), "active": r[0] == "*"}
        prev = best.get(n["ssid"])
        if not prev or n["signal"] > prev["signal"] or n["active"]:
            n["active"] = n["active"] or bool(prev and prev["active"])
            best[n["ssid"]] = n
    return sorted(best.values(), key=lambda n: (not n["active"], -n["signal"]))


def wifi_connect(args):
    ssid = _ssid(args)
    pw = args.get("password")
    if pw is not None and (not isinstance(pw, str) or not 8 <= len(pw) <= 63 or not pw.isprintable()):
        raise Refused("mot de passe Wi-Fi : 8 à 63 caractères")
    saved = wifi_status({})["saved"]
    if not pw and ssid in saved:
        _nmcli("connection", "up", "id", ssid)
        return True
    if pw and ssid in saved:
        try:
            _nmcli("connection", "delete", "id", ssid)
        except Refused:
            pass
    cmd = ["device", "wifi", "connect", ssid, "ifname", IFACE]
    if pw:
        cmd[4:4] = ["password", pw]
    try:
        _nmcli(*cmd)
    except Refused:
        # Essai raté : on supprime le profil créé pour pouvoir retaper le mot de passe.
        if ssid not in saved:
            try:
                _nmcli("connection", "delete", "id", ssid)
            except Refused:
                pass
        raise
    return True


def wifi_forget(args):
    _nmcli("connection", "delete", "id", _ssid(args))
    return True


# ---------- Fuseau horaire ----------

def timezone_set(args):
    zone = args.get("zone")
    if not isinstance(zone, str) or not re.fullmatch(r"[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}", zone):
        raise Refused("fuseau invalide")
    if not os.path.isfile(os.path.join(ZONEINFO, zone)):
        raise Refused("fuseau inconnu")
    subprocess.run(["timedatectl", "set-timezone", zone], check=True, capture_output=True, timeout=15)
    return zone


COMMANDS = {
    "ping": lambda _: "pong",
    "backlight.info": backlight_info,
    "backlight.set": backlight_set,
    "backlight.power": backlight_power,
    "wifi.status": wifi_status,
    "wifi.scan": wifi_scan,
    "wifi.connect": wifi_connect,
    "wifi.forget": wifi_forget,
    "timezone.set": timezone_set,
}


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        line = self.rfile.readline(4096)  # requête bornée
        try:
            req = json.loads(line)
            fn = COMMANDS.get(req.get("cmd"))
            if not fn:
                raise Refused("commande inconnue")
            args = req.get("args") or {}
            if not isinstance(args, dict):
                raise Refused("arguments invalides")
            res = {"ok": True, "data": fn(args)}
        except Refused as e:
            res = {"ok": False, "error": str(e)}
        except subprocess.TimeoutExpired:
            res = {"ok": False, "error": "délai dépassé"}
        except Exception as e:  # noqa: BLE001
            print(f"[hostd] erreur : {e!r}", file=sys.stderr, flush=True)
            res = {"ok": False, "error": "erreur interne"}
        self.wfile.write((json.dumps(res, ensure_ascii=False) + "\n").encode())


class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True


def main():
    # Le dossier n'est jamais supprimé (le conteneur le monte : s'il était recréé, il ne verrait plus le socket).
    sock_dir = os.path.dirname(SOCKET_PATH)
    os.makedirs(sock_dir, exist_ok=True)
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    srv = Server(SOCKET_PATH, Handler)
    # Accessible uniquement à root et au groupe de l'utilisateur du dashboard (le conteneur tourne sous cet utilisateur).
    try:
        gid = grp.getgrnam(SOCKET_GROUP).gr_gid
        os.chown(sock_dir, 0, gid)
        os.chown(SOCKET_PATH, 0, gid)
    except KeyError:
        print(f"[hostd] groupe {SOCKET_GROUP} introuvable", file=sys.stderr)
    os.chmod(sock_dir, 0o750)
    os.chmod(SOCKET_PATH, 0o660)
    print(f"[hostd] à l'écoute sur {SOCKET_PATH}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
