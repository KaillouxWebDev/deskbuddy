#!/usr/bin/env python3
"""
Crée un thème de curseur entièrement transparent (format Xcursor) pour le kiosque.
Avec un écran tactile, c'est le compositeur (cage) qui dessine le curseur, avec la forme
demandée par Chromium (flèche, main, texte...). Si une seule forme manque dans le thème,
il retombe sur le thème système, visible. On rend donc TOUTES les formes transparentes :
la liste CSS complète + tous les noms trouvés dans les thèmes installés sur le Pi,
et on fait du thème "default" un alias du thème invisible pour les replis.
Usage : hide-cursor.py <dossier_icons>   (ex. ~/.local/share/icons)
"""
import glob
import os
import struct
import sys

THEME = "deskbuddy-invisible"

# Formes CSS / protocole Wayland cursor-shape, plus les anciens noms X11.
NAMES = {
    "default", "context-menu", "help", "pointer", "progress", "wait", "cell", "crosshair", "text",
    "vertical-text", "alias", "copy", "move", "no-drop", "not-allowed", "grab", "grabbing",
    "e-resize", "n-resize", "ne-resize", "nw-resize", "s-resize", "se-resize", "sw-resize", "w-resize",
    "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "col-resize", "row-resize", "all-scroll",
    "zoom-in", "zoom-out", "dnd-ask", "all-resize",
    "left_ptr", "arrow", "top_left_arrow", "hand1", "hand2", "xterm", "ibeam", "watch",
    "left_ptr_watch", "question_arrow", "fleur", "crossed_circle", "X_cursor", "pirate",
    "sb_h_double_arrow", "sb_v_double_arrow", "fd_double_arrow", "bd_double_arrow",
    "top_side", "bottom_side", "left_side", "right_side", "top_left_corner", "top_right_corner",
    "bottom_left_corner", "bottom_right_corner", "dnd-move", "dnd-copy", "dnd-link", "dnd-none",
    "openhand", "closedhand", "pointing_hand", "size_all", "size_hor", "size_ver",
    "size_bdiag", "size_fdiag", "split_h", "split_v", "forbidden", "whats_this", "wayland-cursor",
}


def xcursor_1px(size=24):
    header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1)
    toc = struct.pack("<III", 0xFFFD0002, size, 16 + 12)
    image = struct.pack("<IIIIIIIII", 36, 0xFFFD0002, size, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
    return header + toc + image


def main():
    base = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.local/share/icons")
    names = set(NAMES)
    for folder in glob.glob("/usr/share/icons/*/cursors") + glob.glob(os.path.expanduser("~/.icons/*/cursors")):
        try:
            names.update(os.listdir(folder))
        except OSError:
            pass

    cursors = os.path.join(base, THEME, "cursors")
    os.makedirs(cursors, exist_ok=True)
    with open(os.path.join(base, THEME, "index.theme"), "w") as f:
        f.write(f"[Icon Theme]\nName={THEME}\nComment=Curseur invisible pour le kiosque Deskbuddy\n")
    data = xcursor_1px()
    for name in names:
        path = os.path.join(cursors, name)
        if os.path.islink(path):
            os.unlink(path)
        with open(path, "wb") as f:
            f.write(data)

    # Repli : toute recherche dans le thème "default" retombe aussi sur le thème invisible.
    os.makedirs(os.path.join(base, "default"), exist_ok=True)
    with open(os.path.join(base, "default", "index.theme"), "w") as f:
        f.write(f"[Icon Theme]\nName=default\nInherits={THEME}\n")

    print(THEME)


if __name__ == "__main__":
    main()
