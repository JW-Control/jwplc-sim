"""Variador Delta VFD-EL (VFD007EL21A, estructura A), vista frontal a 4 px/mm.

Medidas del manual del VFD-EL (§1.3: estructura A 72 x 174 mm) y del dibujo
de la estructura A (§1.1.4); colores de la foto del producto y del teclado
(§3.1). El cuerpo (288 x 696 px) va a la derecha de un viewBox de 580 x 700:
el margen de la izquierda lleva los puntos de conexión de la bornera de
control (cableado de referencia de JW Control, 26/10/2026).

  arriba:  R/L1 S/L2 (T/L3 sin tornillo: modelo monofásico) y tierra
  teclado: logo, pantalla de 7 segmentos de 4 dígitos (data-seg con out.lcd),
           LED RUN FWD REV y STOP, potenciómetro (acción pot, se arrastra en
           vertical) y las teclas RUN, ▲, MODE, STOP/RESET, ▼, ENTER
  abertura: conmutadores NPN/PNP y AVI/ACI, bornera de control en dos filas
           escalonadas (24V MI1 MI3 MI5 10V AVI / MI2 MI4 MI6 DCM AFM ACM),
           relé RA RB RC y el puerto RS-485 (RJ-45), subidos para dejar paso
           al cableado
  abajo:   U/T1 V/T2 W/T3, + y - (bus de CC) y la barra de tierra

Cableado de control: el punto de conexión de cada borne está fuera del cuerpo,
abajo a la izquierda, uno a continuación del otro (RA RB RC +24V MI2 MI1 MI4
MI3 MI6 MI5 DCM SG+ SG-). El cable interno (baja del borne, corre a la
izquierda por su carril y baja por el costado sin cruzarse con los demás)
solo se dibuja si el borne tiene un cable en la escena (data-show con
wired.<borne>). El RS-485 sale del RJ-45 como par trenzado SG+ (amarillo) y
SG- (azul). 10V, AVI, AFM y ACM no se conectan (sin entradas analógicas).

Uso: gen_vfd_el.py <salida.svg>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, INK, F

OUT = sys.argv[1]
W, H = 580, 700
OX, OY = 276, 2           # esquina del cuerpo (U/T1 y R/L1 caen en múltiplos de 20)
BW, BH = 288, 696         # 72 x 174 mm


def X(mm):
    return OX + mm * 4


def Y(mm):
    return OY + mm * 4


p = header("Variador Delta VFD-EL (VFD007EL21A, estructura A, 72 x 174 mm). Vista frontal. Escala 4 px/mm (manual VFD-EL §1.3 y §3.1).", W, H)
defs = p.index('</defs>')
p[defs:defs] = [
    '<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f6266"/><stop offset=".1" stop-color="#777a7e"/><stop offset=".9" stop-color="#74777b"/><stop offset="1" stop-color="#5c5f63"/></linearGradient>',
    '<linearGradient id="PFX-house" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c6f73"/><stop offset="1" stop-color="#55585c"/></linearGradient>',
    '<linearGradient id="PFX-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#303236"/><stop offset="1" stop-color="#232528"/></linearGradient>',
    '<linearGradient id="PFX-run" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc495"/><stop offset="1" stop-color="#3e9c6b"/></linearGradient>',
    '<linearGradient id="PFX-stp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8505a"/><stop offset="1" stop-color="#c41f2b"/></linearGradient>',
    '<linearGradient id="PFX-gry" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4d6d9"/><stop offset="1" stop-color="#a7aaae"/></linearGradient>',
    '<linearGradient id="PFX-ent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb0ee"/><stop offset="1" stop-color="#1f86cf"/></linearGradient>',
    '<radialGradient id="PFX-knob" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#7c8086"/><stop offset=".6" stop-color="#4a4e53"/><stop offset="1" stop-color="#2a2d31"/></radialGradient>',
    '<linearGradient id="PFX-grn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3e2a6"/><stop offset="1" stop-color="#93c272"/></linearGradient>',
    '<linearGradient id="PFX-rj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dcdf"/><stop offset=".5" stop-color="#9ea3a8"/><stop offset="1" stop-color="#c6cacd"/></linearGradient>',
]

# ---------------------------------------------------------------- cuerpo
p.append(f'<rect x="{OX+3}" y="{OY+4}" width="{BW}" height="{BH}" rx="8" fill="#000" opacity=".22"/>')
p.append(f'<rect x="{OX}" y="{OY}" width="{BW}" height="{BH}" rx="8" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.6"/>')


def screw(cx, cy, r=8.0, metal="scr"):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r+2.2:.1f}" fill="#2b2d30"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#PFX-{metal})" stroke="{INK}" stroke-width="1"/>'
            f'<path d="M{cx-r*.6:.1f} {cy:.1f}H{cx+r*.6:.1f}M{cx:.1f} {cy-r*.6:.1f}V{cy+r*.6:.1f}" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>')


def slot_screw(cx, cy, r=6.0):
    """Tornillo de ranura recta de la bornera de control (verde)."""
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width=".9"/>'
            f'<line x1="{cx-r*.75:.1f}" y1="{cy:.1f}" x2="{cx+r*.75:.1f}" y2="{cy:.1f}" stroke="{INK}" stroke-width="1.8"/>')


# ---------------------------------------------------------------- arriba: alimentación
p.append(f'<path d="M{OX} {Y(17)}V{OY+8}Q{OX} {OY} {OX+8} {OY}H{OX+BW-8}Q{OX+BW} {OY} {OX+BW} {OY+8}V{Y(17)}Z" fill="url(#PFX-house)"/>')
p.append(f'<circle cx="{X(6.5)}" cy="{Y(4.6)}" r="8" fill="#2a2c2f" stroke="#1a1b1d"/>')        # agujero de fijación
p.append(f'<circle cx="{X(64)}" cy="{Y(6.8)}" r="9" fill="#1d1f22"/><circle cx="{X(64)}" cy="{Y(6.8)}" r="5" fill="#0f1012"/>')
for t, lab, cx in (("R", "R/L1", X(16)), ("S", "S/L2", X(26)), (None, "T/L3", X(36)), ("PE", "⏚", X(46))):
    p.append(f'<rect x="{cx-16}" y="{OY}" width="32" height="{Y(16.5)-OY}" rx="3" fill="#4b4e52" stroke="#2a2c2f" stroke-width="1"/>')
    p.append(f'<text x="{cx}" y="{Y(4.2)}" text-anchor="middle" {F} font-size="{12 if t == "PE" else 8}" font-weight="800" fill="#d6d9dc">{lab}</text>')
    if t:
        p.append(screw(cx, Y(12.1), 9, "scr"))
        if t == "PE":
            p.append(f'<circle cx="{cx}" cy="{Y(12.1)}" r="9" fill="#2f9e58" opacity=".55"/>')
        p.append(jw_term(t, cx, Y(12.1)))
        p.append(f'<rect x="{cx-5}" y="{OY-2}" width="10" height="4" fill="#000"/>')
    else:
        p.append(f'<circle cx="{cx}" cy="{Y(12.1)}" r="8" fill="#141517"/>')   # monofásico: sin tornillo
# ranuras de ventilación
for k in range(10):
    p.append(f'<rect x="{X(7.6 + k * 5.9)-6}" y="{Y(22.4)}" width="12" height="7" rx="1" fill="#3b3e42"/>')

# ---------------------------------------------------------------- teclado
p.append(f'<rect x="{OX+1}" y="{Y(25.6)}" width="{BW-2}" height="{Y(76.8)-Y(25.6)}" rx="6" fill="#7b7e82" stroke="#3a3c3f" stroke-width="1.2"/>')
p.append(f'<rect x="{X(2.9)}" y="{Y(27.4)}" width="{X(68.7)-X(2.9)}" height="{Y(74.5)-Y(27.4)}" rx="7" fill="url(#PFX-face)" stroke="#111" stroke-width="1.2"/>')
# logo Delta y modelo
p.append(f'<path d="M{X(10)} {Y(34.6)}l7 -12 7 12z" fill="none" stroke="#e9ebee" stroke-width="2"/>')
p.append(f'<path d="M{X(10)+5} {Y(34.6)-3}q3 -6 9 -2" fill="none" stroke="#e9ebee" stroke-width="1.6"/>')
p.append(f'<text x="{X(15.4)}" y="{Y(34.6)}" {F} font-size="13" font-weight="900" font-style="italic" fill="#e9ebee">DELTA</text>')
p.append(f'<text x="{X(29.8)}" y="{Y(34.6)}" {F} font-size="13" font-weight="900" font-style="italic" fill="#e9ebee">VFD-EL</text>')
# pantalla
DX0, DY0, DX1, DY1 = X(10), Y(35.3), X(40.5), Y(45.9)
p.append(f'<rect x="{DX0}" y="{DY0}" width="{DX1-DX0}" height="{DY1-DY0}" rx="2" fill="#3a0f0c" stroke="#120404" stroke-width="1"/>')
p.append(f'<rect x="{DX0+2}" y="{DY0+2}" width="{DX1-DX0-4}" height="{DY1-DY0-4}" rx="1" fill="#2a0806"/>')


def digit(i, x0, y0, w=20.0, h=32.0, t=3.6, sk=2.5):
    """Dígito de 7 segmentos (con inclinación sk) y su punto decimal."""
    def pt(x, y):
        return f"{x0 + x + sk * (1 - y / h):.1f},{y0 + y:.1f}"
    hseg = lambda y: f"{pt(t*.6, y)} {pt(t*1.1, y-t/2)} {pt(w-t*1.1, y-t/2)} {pt(w-t*.6, y)} {pt(w-t*1.1, y+t/2)} {pt(t*1.1, y+t/2)}"
    vseg = lambda x, ya, yb: f"{pt(x, ya+t*.6)} {pt(x+t/2, ya+t*1.1)} {pt(x+t/2, yb-t*1.1)} {pt(x, yb-t*.6)} {pt(x-t/2, yb-t*1.1)} {pt(x-t/2, ya+t*1.1)}"
    segs = {"a": hseg(t / 2), "g": hseg(h / 2), "d": hseg(h - t / 2),
            "f": vseg(t / 2, t / 2, h / 2), "b": vseg(w - t / 2, t / 2, h / 2),
            "e": vseg(t / 2, h / 2, h - t / 2), "c": vseg(w - t / 2, h / 2, h - t / 2)}
    out = [f'<polygon data-s="{i}{k}" points="{v}" fill="#2a0c08"/>' for k, v in segs.items()]
    out.append(f'<circle data-s="{i}p" cx="{x0 + w + 3.2:.1f}" cy="{y0 + h - t/2:.1f}" r="2.1" fill="#2a0c08"/>')
    return "".join(out)


p.append('<g data-seg="out.lcd:4" data-on="#ff3b26" data-off="#3c120e">')
for i in range(4):
    p.append(digit(i, DX0 + 9 + i * 27.2, DY0 + 5.5))
p.append('</g>')
# LED de estado: RUN FWD REV a la izquierda, STOP a la derecha
for k, (lab, key) in enumerate((("RUN", "ledRun"), ("FWD", "ledFwd"), ("REV", "ledRev"))):
    yy = Y(38.2 + k * 2.35)
    p.append(f'<text x="{X(3.6)}" y="{yy+3}" {F} font-size="7.5" font-weight="800" fill="#b9bdc2">{lab}</text>')
    p.append(f'<circle cx="{X(9.1)}" cy="{yy}" r="2.4" fill="#1a1b1d"/><circle data-show="out.{key}" cx="{X(9.1)}" cy="{yy}" r="2.4" fill="#ff4a2e"/>')
p.append(f'<circle cx="{X(41.6)}" cy="{Y(38.2)}" r="2.4" fill="#1a1b1d"/><circle data-show="out.ledStop" cx="{X(41.6)}" cy="{Y(38.2)}" r="2.4" fill="#ff4a2e"/>')
p.append(f'<text x="{X(42.6)}" y="{Y(38.2)+3}" {F} font-size="7.5" font-weight="800" fill="#b9bdc2">STOP</text>')

# potenciómetro: escala en arco y perilla (se arrastra en vertical; arriba sube)
KX, KY = X(55.8), Y(39.8)
for k in range(9):
    a0 = math.radians(-140 + k * 31)
    a1 = a0 + math.radians(20)
    r = 32 if k < 4 else 33.5 + (k - 4) * 0.6
    wdt = 2 + k * 0.55
    p.append(f'<path d="M{KX+r*math.sin(a0):.1f} {KY-r*math.cos(a0):.1f}A{r} {r} 0 0 1 {KX+r*math.sin(a1):.1f} {KY-r*math.cos(a1):.1f}" fill="none" stroke="#8d9196" stroke-width="{wdt:.1f}"/>')
p.append('<g data-action="pot" data-kind="drag" data-drag="y:0:-1.2:0:100">')
p.append(f'<circle cx="{KX}" cy="{KY}" r="27" fill="#000" opacity="0"/>')
p.append(f'<g data-rotate="out.pot|param.pot:0:100:-135:135:{KX}:{KY}">')
p.append(f'<circle cx="{KX}" cy="{KY+2}" r="23" fill="#111"/>')
p.append(f'<circle cx="{KX}" cy="{KY}" r="23" fill="url(#PFX-knob)" stroke="#16191c" stroke-width="1.2"/>')
p.append(f'<circle cx="{KX}" cy="{KY}" r="16" fill="#3e4247" opacity=".55"/>')
p.append(f'<circle cx="{KX}" cy="{KY-15}" r="2.6" fill="#d9dcdf"/>')
p.append('</g></g>')


def keycap(action, x0, y0, x1, y1, fill, label, col, size=12, sub=None):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    txt = (f'<text x="{cx}" y="{cy+size*0.36:.1f}" text-anchor="middle" {F} font-size="{size}" font-weight="900" fill="{col}">{label}</text>' if not sub else
           f'<text x="{cx}" y="{cy-3:.1f}" text-anchor="middle" {F} font-size="{size}" font-weight="900" fill="{col}">{label}</text>'
           f'<line x1="{cx-17}" y1="{cy+.5}" x2="{cx+17}" y2="{cy+.5}" stroke="{col}" stroke-width="1.2"/>'
           f'<text x="{cx}" y="{cy+size+0.5:.1f}" text-anchor="middle" {F} font-size="{size}" font-weight="900" fill="{col}">{sub}</text>')
    return (f'<g data-action="{action}" data-kind="momentary">'
            f'<rect x="{x0}" y="{y0+2}" width="{w}" height="{h}" rx="3" fill="#0d0e10"/>'
            f'<g data-show="!out.k_{action}"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="3" fill="url(#PFX-{fill})"/>{txt}</g>'
            f'<g data-show="out.k_{action}" transform="translate(0 2)"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="3" fill="url(#PFX-{fill})"/>'
            f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="3" fill="#000" opacity=".22"/>{txt}</g></g>')


C1, C2, C3 = (X(10.6), X(26.4)), (X(28), X(43.5)), (X(45.2), X(61.1))
R1, R2 = (Y(50), Y(57.8)), (Y(59.5), Y(67.2))
p.append(keycap("run", *C1[:1], R1[0], C1[1], R1[1], "run", "RUN", "#f4fbf6", 14))
p.append(keycap("up", C2[0], R1[0], C2[1], R1[1], "gry", "▲", "#1f2124", 15))
p.append(keycap("mode", C3[0], R1[0], C3[1], R1[1], "gry", "MODE", "#2a2c30", 12))
p.append(keycap("stop", C1[0], R2[0], C1[1], R2[1], "stp", "STOP", "#fff3f3", 8.5, "RESET"))
p.append(keycap("down", C2[0], R2[0], C2[1], R2[1], "gry", "▼", "#1f2124", 15))
p.append(keycap("enter", C3[0], R2[0], C3[1], R2[1], "ent", "ENTER", "#f2f8fd", 12))

# ---------------------------------------------------------------- abertura de control
p.append(f'<rect x="{X(2.9)}" y="{Y(77.6)}" width="{X(69.1)-X(2.9)}" height="{Y(133.5)-Y(77.6)}" rx="3" fill="#4f5256" stroke="#2c2e31" stroke-width="1"/>')
p.append(f'<rect x="{X(2.9)}" y="{Y(73.5)}" width="{X(16.5)-X(2.9)}" height="{Y(96.2)-Y(73.5)}" rx="2" fill="#6a6d71" stroke="#2c2e31"/>')
# conmutadores NPN/PNP y AVI/ACI
for x0, top, bot, lft in ((21.6, "NPN", "PNP", True), (31.7, "AVI", "ACI", False)):
    p.append(f'<rect x="{X(x0)}" y="{Y(82.5)}" width="15" height="31" rx="1.5" fill="#2f3135"/><rect x="{X(x0)+3}" y="{Y(82.5)+3}" width="9" height="12" rx="1" fill="#e6e8ea"/>')
    tx = X(x0) - 3 if lft else X(x0) + 18
    anc = "end" if lft else "start"
    p.append(f'<text x="{tx}" y="{Y(84.9)}" text-anchor="{anc}" {F} font-size="7" font-weight="800" fill="#c9cdd2">{top}</text>')
    p.append(f'<text x="{tx}" y="{Y(89.7)}" text-anchor="{anc}" {F} font-size="7" font-weight="800" fill="#c9cdd2">{bot}</text>')

UP = [("+24V", "24V", 20.0), ("MI1", "MI1", 25.2), ("MI3", "MI3", 30.4), ("MI5", "MI5", 35.6), (None, "10V", 40.8), (None, "AVI", 46.0)]
LO = [("MI2", "MI2", 22.9), ("MI4", "MI4", 28.1), ("MI6", "MI6", 33.3), ("DCM", "DCM", 38.5), (None, "AFM", 43.7), (None, "ACM", 48.9)]
RL = [("RA", "RA", 5.9), ("RB", "RB", 10.9), ("RC", "RC", 15.9)]
YU, YL, YR = Y(96.0), Y(105.9), Y(107.0)
# bloques verdes enchufables
p.append(f'<rect x="{X(17.5)}" y="{Y(92.1)}" width="{X(48.6)-X(17.5)}" height="{Y(99.3)-Y(92.1)}" rx="1.5" fill="url(#PFX-grn)" stroke="#4f7a36" stroke-width="1"/>')
p.append(f'<rect x="{X(20.4)}" y="{Y(102.1)}" width="{X(51.5)-X(20.4)}" height="{Y(110.1)-Y(102.1)}" rx="1.5" fill="url(#PFX-grn)" stroke="#4f7a36" stroke-width="1"/>')
p.append(f'<rect x="{X(3.4)}" y="{Y(103.3)}" width="{X(18.4)-X(3.4)}" height="{Y(110.7)-Y(103.3)}" rx="1.5" fill="url(#PFX-grn)" stroke="#4f7a36" stroke-width="1"/>')
for row, yy in ((UP, YU), (LO, YL), (RL, YR)):
    for t, lab, mm in row:
        p.append(slot_screw(X(mm), yy, 7.2 if row is RL else 6.4))
# rótulos de la bornera (como en el manual: arriba la fila superior, abajo la inferior)
for t, lab, mm in UP:
    p.append(f'<text x="{X(mm)}" y="{Y(91.1)}" text-anchor="middle" {F} font-size="5.6" font-weight="800" fill="#e7eaed">{lab}</text>')
# puerto RS-485 (RJ-45)
p.append(f'<rect x="{X(51.9)}" y="{Y(98.1)}" width="{X(68.2)-X(51.9)}" height="{Y(110.9)-Y(98.1)}" rx="2" fill="url(#PFX-rj)" stroke="#3a3d41" stroke-width="1"/>')
p.append(f'<rect x="{X(54.5)}" y="{Y(101.3)}" width="{X(65.6)-X(54.5)}" height="{Y(109.1)-Y(101.3)}" rx="1" fill="#1b1d20"/>')
p.append(f'<text x="{X(60)}" y="{Y(100.4)}" text-anchor="middle" {F} font-size="5.5" font-weight="800" fill="#2b2e33">RS-485</text>')
for t, lab, mm in LO:
    p.append(f'<text x="{X(mm)}" y="{YL+13}" text-anchor="middle" {F} font-size="5.6" font-weight="800" fill="#e7eaed">{lab}</text>')
for t, lab, mm in RL:
    p.append(f'<text x="{X(mm)}" y="{YR+15}" text-anchor="middle" {F} font-size="6" font-weight="800" fill="#e7eaed">{lab}</text>')
# borde de la tapa inferior y ventilación
p.append(f'<rect x="{X(2.9)}" y="{Y(129.4)}" width="{X(69.1)-X(2.9)}" height="{Y(133.5)-Y(129.4)}" fill="#64676b"/>')
for k in range(10):
    p.append(f'<rect x="{X(7.6 + k * 5.9)-6}" y="{Y(135.3)}" width="12" height="6" rx="1" fill="#3b3e42"/>')

# ---------------------------------------------------------------- abajo: motor, bus de CC y tierra
p.append(f'<rect x="{OX+1}" y="{Y(141.2)}" width="{BW-2}" height="{Y(174)-Y(141.2)-1}" fill="url(#PFX-house)"/>')
OUTS = [("U", "U/T1", X(16)), ("V", "V/T2", X(26)), ("W", "W/T3", X(36)), (None, "+", X(46)), (None, "−", X(56))]
for t, lab, cx in OUTS:
    p.append(f'<rect x="{cx-14}" y="{Y(142.6)}" width="28" height="{Y(159.8)-Y(142.6)}" rx="3" fill="#4b4e52" stroke="#2a2c2f" stroke-width="1"/>')
    p.append(screw(cx, Y(145.8), 8.5))
    p.append(f'<text x="{cx}" y="{Y(155.6)}" text-anchor="middle" {F} font-size="{8 if t else 13}" font-weight="800" fill="#d6d9dc">{lab}</text>')
    if t:
        p.append(jw_term(t, cx, Y(145.8)))
# barra de tierra con sus dos tornillos verdes
p.append(f'<rect x="{X(4.5)}" y="{Y(161.2)}" width="{X(53.6)-X(4.5)}" height="{Y(171.2)-Y(161.2)}" rx="3" fill="#8b8f94" stroke="#3a3d41"/>')
for mm in (8.6, 50):
    p.append(f'<circle cx="{X(mm)}" cy="{Y(166.2)}" r="9" fill="#2f9e58" stroke="#16351f"/><path d="M{X(mm)-5} {Y(166.2)}h10M{X(mm)} {Y(166.2)-5}v10" stroke="#16351f" stroke-width="2"/>')
for mm in (19, 40):
    cx, cy = X(mm), Y(166.2)
    p.append(f'<circle cx="{cx}" cy="{cy}" r="9" fill="#a5a9ad" stroke="#4b4e52"/><path d="M{cx} {cy-6}v5M{cx-5} {cy-1}h10M{cx-3.4} {cy+2}h6.8M{cx-1.6} {cy+5}h3.2" stroke="#3a3d41" stroke-width="1.4"/>')
# muesca de fijación abajo a la derecha
p.append(f'<path d="M{X(60)} {OY+BH}V{Y(164)}a7 7 0 0 1 14 0V{OY+BH}" fill="#2a2c2f"/>')

# ---------------------------------------------------------------- cableado de control (solo si el borne tiene cable)
# Orden por la posición del borne (de izquierda a derecha): carril más alto y
# salida más a la izquierda para el primero; así ningún cable cruza a otro.
LEADS = [("RA", 5.9, YR), ("RB", 10.9, YR), ("RC", 15.9, YR), ("+24V", 20.0, YU), ("MI2", 22.9, YL), ("MI1", 25.2, YU),
         ("MI4", 28.1, YL), ("MI3", 30.4, YU), ("MI6", 33.3, YL), ("MI5", 35.6, YU), ("DCM", 38.5, YL)]
COLOR = {"RA": "#d6d9dc", "RB": "#d6d9dc", "RC": "#d6d9dc", "+24V": "#d63a3a", "DCM": "#2f6fd6"}
LANE0, LANE = Y(111.4), 5.0
EXIT = lambda k: 20 + 20 * k


def marker(t, col):
    return (f'<rect x="{col-9}" y="{H-31}" width="18" height="12" rx="2" fill="#f4f1e2" stroke="#6b6a5e" stroke-width=".8"/>'
            f'<text x="{col}" y="{H-22}" text-anchor="middle" {F} font-size="{5.6 if len(t) > 3 else 6.2}" font-weight="800" fill="#2b2a24">{t}</text>')


for k, (t, mm, ys) in enumerate(LEADS):
    sx, lane, col = X(mm), LANE0 + k * LANE, EXIT(k)
    c = COLOR.get(t, "#e9d36b")
    d = f"M{sx:.1f} {ys:.1f}V{lane:.1f}H{col}V{H}"
    p.append(f'<g data-show="wired.{t}">'
             f'<path d="{d}" fill="none" stroke="#111" stroke-width="4.2" stroke-linejoin="round" opacity=".5"/>'
             f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2.6" stroke-linejoin="round"/>'
             f'<circle cx="{sx:.1f}" cy="{ys:.1f}" r="2.6" fill="{c}" stroke="#111" stroke-width=".8"/>{marker(t, col)}</g>')
for k, (t, mm, ys) in enumerate(LEADS):
    p.append(jw_term(t, EXIT(k), H - 10))

# RS-485: par trenzado desde el RJ-45 (SG+ amarillo, SG- azul).
kp = len(LEADS)
c1, c2 = EXIT(kp), EXIT(kp + 1)
mid = (c1 + c2) / 2
lane = LANE0 + kp * LANE + 3
path = [(X(60), Y(110.9)), (X(60), lane), (mid, lane), (mid, H - 40)]


def twisted(sign, amp=3.0, per=24.0):
    """Hebra del par: la línea media con un vaivén senoidal (sign = ±1)."""
    pts, s0 = [], 0.0
    for (x0, y0), (x1, y1) in zip(path, path[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        n = max(2, int(L / 2))
        for i in range(n):
            u = i / n
            o = sign * amp * math.sin(2 * math.pi * (s0 + u * L) / per)
            pts.append((x0 + (x1 - x0) * u + nx * o, y0 + (y1 - y0) * u + ny * o))
        s0 += L
    pts.append(path[-1])
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)


p.append('<g data-show="wired.SG+|wired.SG-">')
for sign, col, colr in ((1, c1, "#f2cf1d"), (-1, c2, "#2f8be0")):
    d = twisted(sign) + f" L{col} {H-30}V{H}"
    p.append(f'<path d="{d}" fill="none" stroke="#111" stroke-width="3.8" stroke-linejoin="round" opacity=".45"/>'
             f'<path d="{d}" fill="none" stroke="{colr}" stroke-width="2.4" stroke-linejoin="round"/>')
p.append(f'<rect x="{X(60)-7}" y="{Y(110.9)-5}" width="14" height="9" rx="1.5" fill="#cfe3f7" stroke="#2b5d96"/>')
p.append(marker("SG+", c1) + marker("SG-", c2) + '</g>')
p.append(jw_term("SG+", c1, H - 10))
p.append(jw_term("SG-", c2, H - 10))


# aviso de referencia sin modelar (AVI/ACI)
p.append(f'<g data-show="out.aviso"><rect x="{X(3.2)}" y="{Y(78.4)}" width="{X(68.8)-X(3.2)}" height="14" rx="3" fill="#ffd400" stroke="#8a6d00"/>'
         f'<text x="{X(36)}" y="{Y(78.4)+10}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#2b2200">02.00 = AVI/ACI: entrada analógica no modelada (0 Hz)</text></g>')

open(OUT, "w").write(finish(p, "vfdel"))
