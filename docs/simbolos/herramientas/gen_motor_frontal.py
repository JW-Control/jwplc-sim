"""Motor trifasico WEG W22 visto desde el ventilador (vista frontal, lado opuesto al eje).

Referencia: ilustracion de arranque directo entregada por JW Control
(26/10/2026, motor azul con el ventilador a la vista) y las medidas tipicas
de la carcasa IEC 80 (altura de eje 80 mm, carcasa con aletas de ~150 mm,
patas de 125 mm entre agujeros). Medidas APROXIMADAS hasta tener el
catalogo de WEG. Color WEG RAL 5009.

Escala de campo 2 px/mm. La tapa del ventilador es una rejilla: a traves de
ella se ven las aspas, que giran con la simulacion (data-spin con
out.speed; con velocidad negativa, al reves). Arriba, la caja de bornes con
la placa de datos y los cables de salida con su marcador; los bornes van en
el borde de arriba.

Variantes:
    motor-1ph            U1 U2 PE (monofasico con capacitor; auxiliar puenteado)
    motor-1ph__4cables   U1 U2 Z1 Z2 PE (auxiliar Z1-Z2 aparte: inversion de giro)
    motor-3ph            U1 V1 W1 PE (bornera con chapas)
    motor-3ph__6cables   U1 V1 W1 W2 U2 V2 PE (arranque estrella-triangulo)
    motor-2v             1U 1V 1W 2U 2V 2W PE (dos velocidades)

El monofasico lleva el capacitor de arranque en un cilindro sobre la
carcasa, junto a la caja de bornes (visto desde el ventilador, de punta).

Estados: aspas girando; falta de fase (texto rojo, el motor zumba sin
girar); conflicto de bobinados (motor-2v); sin arranque (motor-1ph: zumba
sin el bobinado auxiliar); quemado (damaged): hollin.

Uso: python3 gen_motor_frontal.py 3ph|3ph6|2v|1ph|1ph4 <salida.svg>
"""
import math
import sys

from fam22 import F, INK, header, finish, jw_term

KIND = sys.argv[1] if len(sys.argv) > 1 else "3ph"
P = {"3ph": "motor-3ph", "3ph6": "motor-3ph", "2v": "motor-2v", "1ph": "motor-1ph", "1ph4": "motor-1ph"}[KIND]
MONO = KIND.startswith("1ph")
TERMS = {
    "3ph": [("U1", "#7a4a22"), ("V1", "#1b1d20"), ("W1", "#8a9099"), ("PE", None)],
    "3ph6": [("U1", "#7a4a22"), ("V1", "#1b1d20"), ("W1", "#8a9099"), ("W2", "#8a9099"), ("U2", "#7a4a22"), ("V2", "#1b1d20"), ("PE", None)],
    "2v": [("1U", "#7a4a22"), ("1V", "#1b1d20"), ("1W", "#8a9099"), ("2U", "#7a4a22"), ("2V", "#1b1d20"), ("2W", "#8a9099"), ("PE", None)],
    "1ph": [("U1", "#7a4a22"), ("U2", "#2f6fd6"), ("PE", None)],
    "1ph4": [("U1", "#7a4a22"), ("U2", "#2f6fd6"), ("Z1", "#d4d8dc"), ("Z2", "#e0b23a"), ("PE", None)],
}[KIND]
W, H = 360, 460
CX, CY = 180, 280          # eje del motor
R_FRAME = 150              # carcasa con aletas (Ø150 mm)
R_COVER = 128              # tapa del ventilador
BLUE, BLUE_D, BLUE_L = "#2e5f8f", "#1f4466", "#4a83b8"

p = header(f"Motor WEG W22 ({'dos velocidades' if KIND == '2v' else 'monofasico con capacitor' if MONO else 'trifasico'}) visto desde el ventilador; medidas aproximadas de la carcasa IEC 80. Escala de campo 2 px/mm.", W, H)
for d in (
    f'<radialGradient id="PFX-body" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="{BLUE_L}"/><stop offset=".65" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE_D}"/></radialGradient>',
    f'<linearGradient id="PFX-box" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BLUE_L}"/><stop offset="1" stop-color="{BLUE_D}"/></linearGradient>',
    '<radialGradient id="PFX-hole" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#0d0e10"/></radialGradient>',
    '<linearGradient id="PFX-blade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5f66"/><stop offset=".5" stop-color="#2b2e33"/><stop offset="1" stop-color="#16181b"/></linearGradient>',
    '<radialGradient id="PFX-soot" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#140f0b" stop-opacity=".9"/><stop offset=".65" stop-color="#2a2019" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>',
    '<clipPath id="PFX-fanclip"><circle cx="180" cy="280" r="122"/></clipPath>',
):
    p.insert(-1, d)

# ---------------------------------------------------------------- patas y base
FLOOR = CY + 160           # altura de eje 80 mm
for sx in (-1, 1):
    x0 = CX + sx * 125 - (40 if sx > 0 else 0)
    p.append(f'<path d="M{CX + sx * 70} {CY + 110} L{CX + sx * 128} {FLOOR - 14} H{CX + sx * 168} V{FLOOR} H{CX + sx * 70} Z" fill="url(#PFX-body)" stroke="{BLUE_D}" stroke-width="1.4"/>')
    p.append(f'<ellipse cx="{CX + sx * 148}" cy="{FLOOR - 7}" rx="9" ry="4" fill="#0d1a28"/>')
p.append(f'<rect x="{CX - 172}" y="{FLOOR}" width="344" height="8" rx="2" fill="#3a3f46"/>')

# ---------------------------------------------------------------- carcasa con aletas
fins = []
N = 40
for k in range(N):
    a0 = 2 * math.pi * k / N
    a1 = a0 + 2 * math.pi / N * .5
    for a, r in ((a0, R_FRAME), (a1, R_FRAME), (a1, R_FRAME - 10), (a0 + 2 * math.pi / N, R_FRAME - 10)):
        fins.append(f"{CX + r * math.cos(a):.1f},{CY + r * math.sin(a):.1f}")
p.append(f'<polygon points="{" ".join(fins)}" fill="url(#PFX-body)" stroke="{BLUE_D}" stroke-width="1.2"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_FRAME - 12}" fill="{BLUE}" stroke="{BLUE_D}" stroke-width="1"/>')

# ---------------------------------------------------------------- ventilador (gira) y rejilla
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_COVER}" fill="url(#PFX-hole)"/>')
p.append(f'<g clip-path="url(#PFX-fanclip)"><g data-spin="out.speed:{CX}:{CY}:3">')
for k in range(8):
    a = 360 * k / 8
    p.append(f'<path transform="rotate({a} {CX} {CY})" d="M{CX + 14} {CY - 6} C{CX + 60} {CY - 40} {CX + 105} {CY - 38} {CX + 116} {CY - 14} '
             f'C{CX + 108} {CY + 4} {CX + 60} {CY + 8} {CX + 14} {CY + 6} Z" fill="url(#PFX-blade)" stroke="#000" stroke-width=".8"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="20" fill="#3a3f46" stroke="#000" stroke-width="1"/>')
p.append(f'<circle cx="{CX + 9}" cy="{CY - 4}" r="3" fill="#8f969d"/>')   # marca para ver el giro
p.append('</g></g>')
# rejilla de la tapa: anillos y radios de chapa
for r in (36, 62, 88, 112):
    p.append(f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="none" stroke="{BLUE}" stroke-width="5"/>')
    p.append(f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="none" stroke="{BLUE_L}" stroke-width="1.2" opacity=".6"/>')
for k in range(12):
    a = 2 * math.pi * k / 12
    p.append(f'<line x1="{CX + 36 * math.cos(a):.1f}" y1="{CY + 36 * math.sin(a):.1f}" x2="{CX + 124 * math.cos(a):.1f}" y2="{CY + 124 * math.sin(a):.1f}" stroke="{BLUE}" stroke-width="5"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_COVER}" fill="none" stroke="{BLUE_D}" stroke-width="7"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_COVER - 3}" fill="none" stroke="{BLUE_L}" stroke-width="1.5" opacity=".7"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="24" fill="url(#PFX-body)" stroke="{BLUE_D}" stroke-width="1.5"/>')
p.append(f'<text x="{CX}" y="{CY + 4}" text-anchor="middle" {F} font-size="11" font-weight="900" fill="#e8eef5">WEG</text>')

# ---------------------------------------------------------------- caja de bornes y placa de datos
BX0, BX1 = (96, 320) if MONO else (40, 320)   # el monofasico deja lugar al capacitor
BT, BB = 62, 136
p.append(f'<rect x="{BX0 + 30}" y="{BB - 4}" width="{BX1 - BX0 - 60}" height="{CY - R_FRAME - BB + 16}" fill="{BLUE_D}"/>')   # base de la caja
p.append(f'<rect x="{BX0}" y="{BT}" width="{BX1 - BX0}" height="{BB - BT}" rx="6" fill="url(#PFX-box)" stroke="{BLUE_D}" stroke-width="1.4"/>')
for x in (BX0 + 8, BX1 - 8):
    for y in (BT + 8, BB - 8):
        p.append(f'<circle cx="{x}" cy="{y}" r="3" fill="#9aa4ae" stroke="#3a4450" stroke-width=".7"/>')
# prensaestopas al costado
p.append(f'<rect x="{BX1}" y="{(BT + BB) / 2 - 10}" width="14" height="20" rx="3" fill="#202326" stroke="#000"/>')
# placa de datos (aluminio)
PX0, PX1, PY0, PY1 = BX0 + 22, BX1 - 22, BT + 10, BB - 10
p.append(f'<rect x="{PX0}" y="{PY0}" width="{PX1 - PX0}" height="{PY1 - PY0}" rx="2" fill="#d9dde1" stroke="#7d858d" stroke-width=".8"/>')
p.append(f'<text x="{PX0 + 6}" y="{PY0 + 14}" {F} font-size="12" font-weight="900" fill="#1f4f86">WEG</text>')
p.append(f'<text x="{PX0 + 42}" y="{PY0 + 13}" {F} font-size="9" font-weight="700" fill="#2b2f35">{"Monofásico" if MONO else "W22"} · IEC 80</text>')
L2 = "2 velocidades · 470/2800 rpm" if KIND == "2v" else "1 HP · 1720 rpm · 60 Hz" if MONO else "0,75 kW · 1720 rpm · 60 Hz"
L3 = "220 V · bobinados independientes" if KIND == "2v" else "1~ 220 V · 5,6 A · cap. arranque" if MONO else "220Δ / 380Y V · 3,2 / 1,85 A"
p.append(f'<text x="{PX0 + 6}" y="{PY0 + 30}" {F} font-size="8.5" fill="#2b2f35">{L2}</text>')
p.append(f'<text x="{PX0 + 6}" y="{PY0 + 43}" {F} font-size="8.5" fill="#2b2f35">{L3}</text>')
p.append(f'<text x="{PX0 + 6}" y="{PY0 + 52}" {F} font-size="6.5" fill="#5a6068">IP55 · aislamiento F · S1</text>')

# capacitor de arranque: cilindro sobre la carcasa, visto de punta
if MONO:
    KX, KY, KR = 58, 112, 34
    yf = CY - math.sqrt(R_FRAME ** 2 - (CX - KX - 14) ** 2)   # carcasa bajo el soporte
    p.append(f'<path d="M{KX - 16} {KY + 20} V{yf + 18:.0f} L{KX + 22} {yf + 6:.0f} V{KY + 20} Z" fill="{BLUE_D}" stroke="#16324d" stroke-width="1"/>')   # soporte
    p.append(f'<circle cx="{KX}" cy="{KY}" r="{KR}" fill="url(#PFX-box)" stroke="{BLUE_D}" stroke-width="1.6"/>')
    p.append(f'<circle cx="{KX}" cy="{KY}" r="{KR - 7}" fill="none" stroke="{BLUE_L}" stroke-width="1.4" opacity=".7"/>')
    p.append(f'<circle cx="{KX}" cy="{KY}" r="4" fill="#9aa4ae" stroke="#3a4450" stroke-width=".7"/>')
    p.append(f'<text x="{KX}" y="{KY - 10}" text-anchor="middle" {F} font-size="7.5" font-weight="900" fill="#e8eef5">CAP</text>')
    p.append(f'<text x="{KX}" y="{KY + 18}" text-anchor="middle" {F} font-size="6.5" font-weight="700" fill="#cfe0f1">250 V~</text>')

# ---------------------------------------------------------------- cables de salida y bornes (arriba)
n = len(TERMS)
mid = 200 if MONO else 180
xs = [mid + 40 * (k - (n - 1) / 2) for k in range(n)]
for (term, col), x in zip(TERMS, xs):
    pe = col is None
    p.append(f'<path d="M{x} {BT} V14" stroke="#0c0d0f" stroke-width="9"/>')
    if pe:
        p.append(f'<path d="M{x} {BT} V14" stroke="#2fa84f" stroke-width="6"/>')
        p.append(f'<path d="M{x} {BT} V14" stroke="#f2d22e" stroke-width="6" stroke-dasharray="6 6"/>')
    else:
        p.append(f'<path d="M{x} {BT} V14" stroke="{col}" stroke-width="6"/>')
    p.append(f'<rect x="{x - 9}" y="{BT - 26}" width="18" height="12" rx="2" fill="#f4f5f7" stroke="#8a9099" stroke-width=".6"/>')
    p.append(f'<text x="{x}" y="{BT - 17}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}">{term}</text>')
    p.append(f'<rect x="{x - 4}" y="6" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{x - 5}" y="0" width="10" height="4" fill="#16181b"/>')
    p.append(jw_term(term, x, 12))

# ---------------------------------------------------------------- estados
p.append(f'<g data-show="out.faltaFase"><rect x="{CX - 70}" y="{CY - 11}" width="140" height="22" rx="4" fill="#000" opacity=".7"/>'
         f'<text x="{CX}" y="{CY + 5}" text-anchor="middle" {F} font-size="13" font-weight="900" fill="#ff5a4a">FALTA DE FASE</text></g>')
if KIND == "2v":
    p.append(f'<g data-show="out.conflicto"><rect x="{CX - 90}" y="{CY - 11}" width="180" height="22" rx="4" fill="#000" opacity=".7"/>'
             f'<text x="{CX}" y="{CY + 5}" text-anchor="middle" {F} font-size="12" font-weight="900" fill="#ff5a4a">BOBINADOS EN CONFLICTO</text></g>')
    p.append(f'<text x="{CX}" y="{H - 2}" text-anchor="middle" {F} font-size="11" font-weight="800" fill="#c9d4df" data-text="out.velocidad"></text>')
if MONO:
    p.append(f'<g data-show="out.bloqueado"><rect x="{CX - 92}" y="{CY - 11}" width="184" height="22" rx="4" fill="#000" opacity=".7"/>'
             f'<text x="{CX}" y="{CY + 5}" text-anchor="middle" {F} font-size="12" font-weight="900" fill="#ffb02e">ZUMBA: NO ARRANCA</text></g>')
p.append(f'<g data-show="damaged"><circle cx="{CX}" cy="{CY}" r="{R_FRAME + 10}" fill="url(#PFX-soot)"/>'
         f'<text x="{CX}" y="{CY + R_FRAME - 20}" text-anchor="middle" {F} font-size="12" font-weight="900" fill="#ff5a4a">BOBINADO ABIERTO</text></g>')

out = finish(p, P)
with open(sys.argv[2] if len(sys.argv) > 2 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
print("ok")
