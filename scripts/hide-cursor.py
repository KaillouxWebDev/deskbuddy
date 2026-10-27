#!/usr/bin/env python3
"""
Crée un thème de curseur entièrement transparent (format Xcursor) pour le kiosque.
Avec un écran tactile, aucune souris n'entre jamais dans la page : c'est le compositeur (cage)
qui dessine son curseur par défaut au centre. On lui donne un curseur invisible.
Usage : hide-cursor.py <dossier_icons>   (ex. ~/.local/share/icons)
"""
import os
import struct
import sys

THEME = "deskbuddy-invisible"
NAMES = [
    "default", "left_ptr", "arrow", "pointer", "hand1", "hand2", "text", "xterm", "ibeam",
    "watch", "wait", "progress", "left_ptr_watch", "crosshair", "move", "grabbing", "grab",
    "not-allowed", "help", "question_arrow", "all-scroll", "col-resize", "row-resize",
]


def xcursor_1px():
    size = 24  # taille nominale demandée par les compositeurs
    header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1)
    toc = struct.pack("<III", 0xFFFD0002, size, 16 + 12)
    image = struct.pack("<IIIIIIIII", 36, 0xFFFD0002, size, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
    return header + toc + image


def main():
    base = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.local/share/icons")
    cursors = os.path.join(base, THEME, "cursors")
    os.makedirs(cursors, exist_ok=True)
    with open(os.path.join(base, THEME, "index.theme"), "w") as f:
        f.write(f"[Icon Theme]\nName={THEME}\nComment=Curseur invisible pour le kiosque Deskbuddy\n")
    data = xcursor_1px()
    for name in NAMES:
        with open(os.path.join(cursors, name), "wb") as f:
            f.write(data)
    print(THEME)


if __name__ == "__main__":
    main()
