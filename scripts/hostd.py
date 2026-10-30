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
# Incrémenté à chaque changement du service : le dashboard prévient si le Pi tourne encore une ancienne version.
HOSTD_VERSION = 3
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


def ssid_from_name(name):
    """Profils générés par netplan (Raspberry Pi OS récent) : « netplan-wlan0-MonReseau » -> « MonReseau »."""
    m = re.fullmatch(r"netplan-[^-]+-(.+)", name)
    return m.group(1) if m else name


def _saved_profiles():
    """Profils Wi-Fi enregistrés par NetworkManager, avec le vrai nom du réseau (SSID).
    Le nom du profil peut différer du SSID (« preconfigured » pour le Wi-Fi saisi à l'installation, « Box 1 »...)."""
    rows = _terse(_nmcli("-t", "-f", "UUID,TYPE,NAME", "connection", "show"))
    out = []
    for r in rows:
        if len(r) < 3 or r[1] != "802-11-wireless":
            continue
        try:
            ssid = _nmcli("-g", "802-11-wireless.ssid", "connection", "show", "uuid", r[0]).strip()
        except Refused:
            ssid = ""
        out.append({"uuid": r[0], "name": r[2], "ssid": ssid or ssid_from_name(r[2])})
    return out


def _harden_profile(uuid):
    """Comme un téléphone : reconnexion automatique sans limite d'essais, et pas d'économie d'énergie Wi-Fi
    (sur le Pi 3, elle provoque des décrochages)."""
    try:
        _nmcli("connection", "modify", "uuid", uuid,
               "connection.autoconnect", "yes", "connection.autoconnect-retries", "0",
               "802-11-wireless.powersave", "2")
    except Refused as e:
        print(f"[hostd] profil {uuid} : {e}", file=sys.stderr, flush=True)


def harden_all():
    try:
        for p in _saved_profiles():
            _harden_profile(p["uuid"])
    except Exception as e:  # noqa: BLE001 (NetworkManager absent hors Pi)
        print(f"[hostd] Wi-Fi : {e}", file=sys.stderr, flush=True)


def wifi_status(_):
    dev = _terse(_nmcli("-t", "-f", "DEVICE,TYPE,STATE", "device"))
    wl = next((r for r in dev if r[0] == IFACE or (len(r) > 1 and r[1] == "wifi")), None)
    current = None
    if wl and len(wl) > 2 and wl[2] == "connected":
        for r in _terse(_nmcli("-t", "-f", "ACTIVE,SSID", "device", "wifi", "list", "--rescan", "no")):
            if len(r) > 1 and r[0] == "yes":
                current = r[1]
                break
    return {
        "available": bool(wl),
        "country": _country_now(),
        "current": current,
        "saved": sorted({p["ssid"] for p in _saved_profiles()}),
    }


def wifi_scan(_):
    try:
        out = _nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "yes", timeout=40)
    except Refused:
        # Balayage refusé (déjà en cours, ou trop rapproché) : on attend et on relit la liste fraîche.
        import time
        time.sleep(4)
        out = _nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "auto", timeout=40)
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
    """Réseau déjà enregistré : on réutilise son mot de passe. Nouveau mot de passe : on met à jour le profil
    existant (pas de doublon). Échec : le profil est GARDÉ (un échec vient souvent d'un signal faible ou d'un
    partage de connexion endormi, pas forcément du mot de passe)."""
    ssid = _ssid(args)
    pw = args.get("password")
    if pw is not None and (not isinstance(pw, str) or not 8 <= len(pw) <= 63 or not pw.isprintable()):
        raise Refused("mot de passe Wi-Fi : 8 à 63 caractères")
    profiles = [p for p in _saved_profiles() if p["ssid"] == ssid]
    if profiles:
        uuid = profiles[0]["uuid"]
        for extra in profiles[1:]:  # doublons laissés par les anciennes versions
            try:
                _nmcli("connection", "delete", "uuid", extra["uuid"])
            except Refused:
                pass
        if pw:
            _nmcli("connection", "modify", "uuid", uuid, "wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", pw)
        _harden_profile(uuid)
        _nmcli("connection", "up", "uuid", uuid)
        return True
    cmd = ["device", "wifi", "connect", ssid, "ifname", IFACE]
    if pw:
        cmd[4:4] = ["password", pw]
    try:
        _nmcli(*cmd)
    finally:
        # Réussi ou non, le profil créé est réglé pour se reconnecter tout seul.
        for p in _saved_profiles():
            if p["ssid"] == ssid:
                _harden_profile(p["uuid"])
    return True


# Pays Wi-Fi (domaine réglementaire) : sans lui, le Pi n'écoute que les canaux 1 à 11. Les box françaises
# passent souvent seules sur les canaux 12 ou 13 : le réseau « disparaît » alors de la liste.
def _country_now():
    try:
        out = subprocess.run(["iw", "reg", "get"], capture_output=True, text=True, timeout=10).stdout
        m = re.search(r"^country (\w\w):", out, re.M)
        return m.group(1) if m else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def wifi_country(args):
    cc = args.get("cc")
    if not isinstance(cc, str) or not re.fullmatch(r"[A-Z]{2}", cc):
        raise Refused("code pays invalide")
    if _country_now() == cc:
        return cc
    if os.path.exists("/usr/bin/raspi-config"):
        # Réglage persistant (survit au redémarrage), comme raspi-config > Localisation > Pays Wi-Fi.
        subprocess.run(["raspi-config", "nonint", "do_wifi_country", cc], capture_output=True, timeout=30)
    subprocess.run(["iw", "reg", "set", cc], capture_output=True, timeout=10)
    print(f"[hostd] pays Wi-Fi : {cc}", flush=True)
    return _country_now() or cc


def wifi_forget(args):
    ssid = _ssid(args)
    found = [p for p in _saved_profiles() if p["ssid"] == ssid]
    if not found:
        raise Refused("réseau inconnu")
    for p in found:
        _nmcli("connection", "delete", "uuid", p["uuid"])
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
    "version": lambda _: HOSTD_VERSION,
    "backlight.info": backlight_info,
    "backlight.set": backlight_set,
    "backlight.power": backlight_power,
    "wifi.status": wifi_status,
    "wifi.scan": wifi_scan,
    "wifi.connect": wifi_connect,
    "wifi.forget": wifi_forget,
    "wifi.country": wifi_country,
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
    # Profils Wi-Fi existants (dont celui de l'installation) : reconnexion automatique illimitée, sans économie d'énergie.
    threading.Thread(target=harden_all, daemon=True).start()
    # Pays Wi-Fi par défaut si aucun n'est réglé (le dashboard l'ajuste ensuite selon le lieu).
    if _country_now() in (None, "00"):
        try:
            wifi_country({"cc": os.environ.get("HOSTD_WIFI_COUNTRY", "FR")})
        except Exception as e:  # noqa: BLE001
            print(f"[hostd] pays Wi-Fi : {e}", file=sys.stderr, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
