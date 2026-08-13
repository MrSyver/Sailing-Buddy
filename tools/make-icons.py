#!/usr/bin/env python3
"""Erzeugt die PNG-App-Symbole aus derselben Beschreibung wie icons/icon.svg.

iOS braucht für den Home-Bildschirm ein PNG (apple-touch-icon); SVG genügt dort
nicht. Damit kein Bildbearbeitungsprogramm nötig ist, zeichnet dieses Skript die
Symbole mit vierfacher Überabtastung selbst und schreibt sie ohne Fremdmodule
als PNG heraus.

    python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (11, 32, 51)       # tiefes Marineblau
BG_BOTTOM = (5, 16, 28)
SAIL = (245, 249, 252)
HULL = (200, 214, 226)
PORT = (255, 69, 58)        # rot, Backbord
STARBOARD = (50, 215, 75)   # grün, Steuerbord
SEA = (26, 62, 92)

SS = 4  # Überabtastung je Achse


def lerp(a, b, f):
    return tuple(round(x + (y - x) * f) for x, y in zip(a, b))


def inside_triangle(px, py, a, b, c):
    def sign(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])

    p = (px, py)
    d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def shade(x, y, n):
    """Farbe eines Punktes im Einheitsquadrat 0..n (bereits überabgetastet)."""
    u, v = x / n, y / n

    # Hintergrund mit senkrechtem Verlauf
    color = lerp(BG_TOP, BG_BOTTOM, v)

    # Wasserlinie unten
    if v > 0.74:
        color = SEA

    # Rumpf: Trapez knapp über der Wasserlinie, aus zwei Dreiecken gesetzt
    deck_l, deck_r, keel_l, keel_r, deck_y, keel_y = 0.17, 0.83, 0.29, 0.73, 0.735, 0.815
    if (inside_triangle(u, v, (deck_l, deck_y), (deck_r, deck_y), (keel_r, keel_y))
            or inside_triangle(u, v, (deck_l, deck_y), (keel_r, keel_y), (keel_l, keel_y))):
        color = HULL

    # Großsegel: hohes Dreieck rechts vom Mast
    if inside_triangle(u, v, (0.515, 0.16), (0.515, 0.71), (0.80, 0.71)):
        color = SAIL

    # Vorsegel: kleineres Dreieck links vom Mast
    if inside_triangle(u, v, (0.485, 0.24), (0.485, 0.71), (0.26, 0.71)):
        color = SAIL

    # Mast
    if 0.492 <= u <= 0.508 and 0.14 <= v <= 0.735:
        color = SAIL

    # Positionslaternen als farbige Punkte an den Bordseiten
    for cx, cy, tint in ((0.205, 0.727, PORT), (0.795, 0.727, STARBOARD)):
        if (u - cx) ** 2 + (v - cy) ** 2 <= 0.034 ** 2:
            color = tint

    return color


def rounded(u, v, radius):
    """iOS maskiert selbst; abgerundet wird nur für Android und Favicon."""
    for cx, cy in ((radius, radius), (1 - radius, radius),
                   (radius, 1 - radius), (1 - radius, 1 - radius)):
        if ((u < radius and cx == radius) or (u > 1 - radius and cx != radius)) and \
           ((v < radius and cy == radius) or (v > 1 - radius and cy != radius)):
            return (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2
    return True


def render(size, radius=0.0):
    n = size * SS
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    px, py = x * SS + sx, y * SS + sy
                    u, v = px / n, py / n
                    if radius and not rounded(u, v, radius):
                        continue
                    cr, cg, cb = shade(px, py, n)
                    r, g, b, a = r + cr, g + cg, b + cb, a + 255
            total = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                cnt = a // 255
                row += bytes((r // cnt, g // cnt, b // cnt, a // total))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(
            ">I", zlib.crc32(payload) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    print(f"{path.name}: {size}x{size}, {len(png)} Bytes")


def main():
    OUT.mkdir(exist_ok=True)
    # apple-touch-icon: ohne Transparenz und ohne eigene Rundung,
    # iOS legt die Maske selbst darüber.
    write_png(OUT / "icon-180.png", 180, render(180))
    write_png(OUT / "icon-192.png", 192, render(192, radius=0.20))
    write_png(OUT / "icon-512.png", 512, render(512, radius=0.20))
    # Maskierbares Symbol für Android: Motiv innerhalb des sicheren Kreises.
    write_png(OUT / "icon-maskable-512.png", 512, render(512))


if __name__ == "__main__":
    main()
