"""Sensor capacitivo Autonics CR18-8DP (M18 de plastico, no blindado, Sn hasta
8 mm), vista lateral. Propuesta del 10/11/2026, por aprobar: sin foto propia,
segun el catalogo de Autonics (serie CR); se valida con fotos de JW Control.

Generado a partir de gen_sensor_inductivo_pr18.py, con las diferencias del
capacitivo: cuerpo roscado de plastico (no cromado), cara activa plana,
potenciometro de sensibilidad (SENS) en el extremo trasero, junto al LED,
histeresis del 20 % (la franja ambar va de 8 a 9,6 mm) y una pieza generica
cuyo material (agua, madera, plastico...) se lee en la pieza. El alcance real
(Sn x factor del material x sensibilidad) se muestra bajo la zona.

Uso: python3 gen_sensor_capacitivo_cr18.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

P = "sensor-capacitive"
W, H = 620, 260


def mm(v):
    return v * 4


CY = 80                    # eje del sensor
R = 60                     # extremo trasero (salida del cable)
FACE = R + mm(47)          # cara activa: x = 248
MAXD = 20                  # recorrido de la pieza (mm)
VALS = (0, 8, 9.6, MAXD)   # escala por tramos del area de trabajo: mm ...
POS = (0, 170, 230, 320)   # ... y px desde la cara activa
SN, HY = 8, 0.2
TXT = "#c9cdd3"


def x_from_face(d):
    return FACE - mm(d)


p = header("Sensor capacitivo Autonics CR18-8DP (M18 de plastico, Sn hasta 8 mm), vista lateral segun catalogo del fabricante. Sensor a 4 px/mm; area de trabajo exagerada (escala por tramos). Propuesta por aprobar.", W, H)
for d in (
    '<linearGradient id="PFX-cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5058"/><stop offset=".2" stop-color="#7d858e"/><stop offset=".4" stop-color="#5c636b"/><stop offset=".75" stop-color="#3a3f45"/><stop offset="1" stop-color="#25292e"/></linearGradient>',
    '<linearGradient id="PFX-nut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1a8"/><stop offset=".3" stop-color="#eef1f3"/><stop offset=".55" stop-color="#b8bfc6"/><stop offset="1" stop-color="#5d646b"/></linearGradient>',
    '<linearGradient id="PFX-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e6dc"/><stop offset=".3" stop-color="#d9d4c5"/><stop offset=".75" stop-color="#b9b3a2"/><stop offset="1" stop-color="#8a8576"/></linearGradient>',
    '<linearGradient id="PFX-blk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f56"/><stop offset=".35" stop-color="#2a2d32"/><stop offset="1" stop-color="#121315"/></linearGradient>',
    '<linearGradient id="PFX-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d747b"/><stop offset=".35" stop-color="#b5bcc3"/><stop offset=".6" stop-color="#8f979f"/><stop offset="1" stop-color="#596067"/></linearGradient>',
    '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2f0"/><stop offset=".45" stop-color="#ff3b2f"/><stop offset="1" stop-color="#ff3b2f" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="PFX-zone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3ddc84" stop-opacity=".55"/><stop offset="1" stop-color="#3ddc84" stop-opacity=".25"/></linearGradient>',
    '<pattern id="PFX-hys" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f2c230" fill-opacity=".25"/><line x1="0" y1="0" x2="0" y2="4" stroke="#f2c230" stroke-width="1.6"/></pattern>',
):
    p.insert(-1, d)

# ---------------------------------------------------------------- area de trabajo (exagerada)
HX0, HX1 = FACE + POS[1], FACE + POS[2]    # Sn y 1,1 Sn
H0, H1 = mm(17) / 2, 72                    # medio alto del cono: en la cara y al final


def half(x):
    return H0 + (x - FACE) / (HX1 - FACE) * (H1 - H0)


def cone(x0, x1):
    return f"M{x0} {CY - half(x0):.1f} L{x1} {CY - half(x1):.1f} V{CY + half(x1):.1f} L{x0} {CY + half(x0):.1f} Z"


def zone(on):
    o = 1 if on else .4
    return [f'<g opacity="{o}"><path d="{cone(FACE, HX0)}" fill="url(#PFX-zone)" stroke="#3ddc84" stroke-width="1.2" stroke-opacity=".8"/></g>']


p.append('<g data-show="!out.detecting">')
p += zone(False)
p.append('</g><g data-show="out.detecting">')
p += zone(True)
p.append('</g>')
# histeresis: franja ambar de Sn a 1,1 Sn, siguiendo el cono
p.append(f'<path d="{cone(HX0, HX1)}" fill="url(#PFX-hys)" stroke="#f2c230" stroke-width="1.2"/>')
LY = CY + H1 + 16
p.append(f'<line x1="{HX0}" y1="{CY + half(HX0):.1f}" x2="{HX0}" y2="{LY + 4}" stroke="#3ddc84" stroke-width="1.2"/>')
p.append(f'<line x1="{HX1}" y1="{CY + H1}" x2="{HX1}" y2="{LY + 4}" stroke="#f2c230" stroke-width="1.2"/>')
p.append(f'<text x="{HX0 - 4}" y="{LY}" text-anchor="end" {F} font-size="10" font-weight="700" fill="#7fe3a8">detección hasta 8 mm</text>')
p.append(f'<text x="{HX1 + 4}" y="{LY}" {F} font-size="10" font-weight="700" fill="#f2c230">histéresis 20 %</text>')
# eje
p.append(f'<line x1="{FACE}" y1="{CY}" x2="{FACE + POS[-1] + 40}" y2="{CY}" stroke="#8a9099" stroke-width="1" stroke-dasharray="6 3 1.5 3"/>')

# ---------------------------------------------------------------- cable y bornes
WIRES = ((40, "BN", "#8a5a2b", "+V"), (80, "BU", "#2f62d6", "0 V"), (120, "BK", "#1b1d20", "Salida"))
SPLIT = (30, 176)
# vaina del cable Ø5: sale del extremo trasero, baja por la izquierda
jacket = f"M{R} {CY} H{SPLIT[0] + 12} Q{SPLIT[0]} {CY} {SPLIT[0]} {CY + 12} V{SPLIT[1]}"
p.append(f'<path d="{jacket}" fill="none" stroke="#0c0d0f" stroke-width="{mm(5) + 2}" stroke-linecap="round"/>')
p.append(f'<path d="{jacket}" fill="none" stroke="#33373d" stroke-width="{mm(5) - 2}" stroke-linecap="round"/>')
p.append(f'<path d="M{SPLIT[0] - 7} {CY + 16} V{SPLIT[1] - 2}" stroke="#5a6068" stroke-width="2" opacity=".6"/>')
for x, code, col, fn in WIRES:
    path = f"M{SPLIT[0] + (x - 80) * .08:.1f} {SPLIT[1]} C{SPLIT[0]} {SPLIT[1] + 16} {x} {SPLIT[1] + 8} {x} {SPLIT[1] + 26} V{H - 14}"
    p.append(f'<path d="{path}" fill="none" stroke="#6b737c" stroke-width="5"/>')
    p.append(f'<path d="{path}" fill="none" stroke="{col}" stroke-width="3.4"/>')
    p.append(f'<rect x="{x - 4}" y="{H - 24}" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{x - 5}" y="{H - 4}" width="10" height="4" fill="#16181b"/>')
    p.append(f'<text x="{x + 6}" y="{H - 44}" {F} font-size="10" font-weight="800" fill="#e8eaed">{fn}</text>')
    p.append(f'<text x="{x + 6}" y="{H - 33}" {F} font-size="8" font-weight="700" fill="#9aa0a6">{code}</text>')
    p.append(jw_term(code, x, H - 18))
p.append(f'<rect x="{SPLIT[0] - 11}" y="{SPLIT[1] - 6}" width="22" height="8" rx="2" fill="#0c0d0f"/>')

# etiqueta de cable (bandera) con el modelo: cambia con la salida y el contacto
FX, FY = SPLIT[0] + 12, 112
p.append(f'<rect x="{SPLIT[0] - 12}" y="{FY - 4}" width="24" height="44" rx="3" fill="#e9ebee" stroke="#8a9099" stroke-width=".8"/>')
p.append(f'<rect x="{FX}" y="{FY}" width="86" height="36" rx="2" fill="#f4f5f7" stroke="#8a9099" stroke-width=".8"/>')
for out, oc in (("pnp", "P"), ("npn", "N")):
    for ct, cc in (("no", ""), ("nc", "2")):
        p.append(f'<g data-show="param.output={out}"><g data-show="param.contact={ct}">'
                 f'<text x="{FX + 43}" y="{FY + 15}" text-anchor="middle" {F} font-size="12" font-weight="700" fill="{INK}">CR18-8D{oc}{cc}</text></g></g>')
p.append(f'<text x="{FX + 43}" y="{FY + 28}" text-anchor="middle" {F} font-size="8" fill="#3a3f45">12-24VDC</text>')
# alcance real segun el material y la sensibilidad
p.append(f'<text x="{HX0 - 4}" y="{LY + 14}" text-anchor="end" {F} font-size="9" font-weight="700" fill="#c9cdd3" data-text="out.snTxt">Sn 8,0 mm · metal</text>')

# ---------------------------------------------------------------- cuerpo
# sombra
p.append(f'<rect x="{R}" y="{CY - mm(9) + 3}" width="{FACE - R}" height="{mm(18)}" rx="6" fill="#000" opacity=".3"/>')
# extremo trasero de plastico negro: buje del cable y collar con el LED
BUSH = (R, R + mm(5.5), mm(11))
COLL = (R + mm(5.5), R + mm(8.5), mm(16))
p.append(f'<rect x="{BUSH[0]}" y="{CY - BUSH[2] / 2}" width="{BUSH[1] - BUSH[0] + 4}" height="{BUSH[2]}" rx="4" fill="url(#PFX-blk2)" stroke="#000" stroke-width="1"/>')
for k in range(1, 4):
    x = BUSH[0] + k * mm(1.3)
    p.append(f'<line x1="{x}" y1="{CY - BUSH[2] / 2 + 2}" x2="{x}" y2="{CY + BUSH[2] / 2 - 2}" stroke="#000" stroke-width="1" opacity=".55"/>')
p.append(f'<rect x="{COLL[0]}" y="{CY - COLL[2] / 2}" width="{COLL[1] - COLL[0]}" height="{COLL[2]}" rx="3" fill="url(#PFX-blk2)" stroke="#000" stroke-width="1"/>')
# LED rojo de operacion (visible por arriba del collar)
LX, LY = (COLL[0] + COLL[1]) / 2, CY - COLL[2] / 2 + 7
p.append(f'<rect x="{LX - 4}" y="{LY - 4}" width="8" height="8" rx="2" fill="#4a1410" stroke="#000" stroke-width=".8"/>')
p.append(f'<g data-show="out.output"><circle cx="{LX}" cy="{LY}" r="11" fill="url(#PFX-led)"/>'
         f'<rect x="{LX - 3.5}" y="{LY - 3.5}" width="7" height="7" rx="1.8" fill="#ff5a4a"/></g>')

# potenciometro de sensibilidad (SENS), sobre el lomo del cuerpo junto al
# collar del LED: gira con el ajuste
SX, SY = R + mm(8.5) + 14, CY - mm(18) / 2 - 5
p.append(f'<circle cx="{SX}" cy="{SY}" r="6" fill="#c9ced5" stroke="#000" stroke-width=".8"/>')
p.append(f'<g data-rotate="param.sensitivity:20:100:-120:120:{SX}:{SY}"><line x1="{SX}" y1="{SY - 5}" x2="{SX}" y2="{SY + 5}" stroke="#16181b" stroke-width="1.6"/></g>')
p.append(f'<text x="{SX}" y="{SY - 10}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#c9cdd3">SENS</text>')

# cuerpo roscado M18 x 1 (plastico)
TB, TE = R + mm(8.5), FACE - mm(10)
TH = mm(18)
p.append(f'<rect x="{TB}" y="{CY - TH / 2}" width="{TE - TB + 2}" height="{TH}" fill="url(#PFX-cyl)" stroke="#3f454b" stroke-width="1"/>')
x = TB + 2
while x < TE:
    p.append(f'<line x1="{x:.1f}" y1="{CY - TH / 2 + 1}" x2="{x + 2:.1f}" y2="{CY + TH / 2 - 1}" stroke="#5d646b" stroke-width=".9" opacity=".75"/>')
    x += mm(1)
p.append(f'<line x1="{TB}" y1="{CY - TH / 2 + 5}" x2="{TE}" y2="{CY - TH / 2 + 5}" stroke="#ffffff" stroke-width="1.6" opacity=".55"/>')

# capuchon naranja (cara activa), Ø17
CH = mm(17)
p.append(f'<path d="M{TE} {CY - CH / 2} H{FACE - 6} Q{FACE} {CY - CH / 2} {FACE} {CY - CH / 2 + 6} V{CY + CH / 2 - 6} Q{FACE} {CY + CH / 2} {FACE - 6} {CY + CH / 2} H{TE} Z" '
         f'fill="url(#PFX-cap)" stroke="#5c584c" stroke-width="1"/>')
p.append(f'<line x1="{TE + 3}" y1="{CY - CH / 2 + 1}" x2="{TE + 3}" y2="{CY + CH / 2 - 1}" stroke="#8a8576" stroke-width="1.4"/>')
p.append(f'<line x1="{TE + 6}" y1="{CY - CH / 2 + 6}" x2="{FACE - 6}" y2="{CY - CH / 2 + 6}" stroke="#ffffff" stroke-width="1.4" opacity=".6"/>')


# tuercas de 24 mm entre caras (de costado se ven tres caras) y arandela dentada
def nut(x0, x1):
    h = mm(26)
    s = [f'<rect x="{x0}" y="{CY - h / 2}" width="{x1 - x0}" height="{h}" rx="2" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width="1"/>']
    for f in (-.27, .27):
        s.append(f'<line x1="{x0}" y1="{CY + f * h:.1f}" x2="{x1}" y2="{CY + f * h:.1f}" stroke="#5d646b" stroke-width=".9"/>')
    s.append(f'<line x1="{x0 + 2}" y1="{CY - h / 2 + 2}" x2="{x0 + 2}" y2="{CY + h / 2 - 2}" stroke="#ffffff" stroke-width="1" opacity=".5"/>')
    return s


def washer(x0, x1):
    h = mm(27)
    s = [f'<rect x="{x0}" y="{CY - h / 2 + 4}" width="{x1 - x0}" height="{h - 8}" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width=".8"/>']
    for k in range(9):
        y = CY - h / 2 + 4 + k * (h - 8) / 8
        s.append(f'<path d="M{x0} {y:.1f} l-2 2 M{x1} {y:.1f} l2 2" stroke="#3f454b" stroke-width=".9"/>')
    return s


p += nut(x_from_face(25), x_from_face(21))
p += washer(x_from_face(20.5), x_from_face(18.5))
p += nut(x_from_face(18), x_from_face(14))

# ---------------------------------------------------------------- pieza metalica (se arrastra)
PW, PH = 24, mm(25)       # pieza de acero (alto a escala; angosta para no tapar el area)
VL, PL = ",".join(f"{v:g}" for v in VALS), ",".join(f"{v:g}" for v in POS)
p.append(f'<g data-translate="out.distance|param.distance:{VL}:x:{PL}" data-action="distance" data-kind="drag" data-drag="x:{FACE}:{VL}:{PL}" style="cursor:ew-resize">')
p.append(f'<rect x="{FACE - 4}" y="{CY - PH / 2 - 18}" width="{PW + 8}" height="{PH + 22}" fill="#000" opacity="0"/>')  # zona de agarre
p.append(f'<rect x="{FACE + 2}" y="{CY - PH / 2 + 3}" width="{PW}" height="{PH}" rx="1.5" fill="#000" opacity=".3"/>')
p.append(f'<rect x="{FACE}" y="{CY - PH / 2}" width="{PW}" height="{PH}" rx="1.5" fill="url(#PFX-steel)" stroke="#2e3338" stroke-width="1"/>')
p.append(f'<line x1="{FACE + 3}" y1="{CY - PH / 2 + 3}" x2="{FACE + 3}" y2="{CY + PH / 2 - 3}" stroke="#e6eaee" stroke-width="1.2" opacity=".6"/>')
for k in range(3):
    y = CY - 8 + k * 8
    p.append(f'<line x1="{FACE + PW / 2 - 6}" y1="{y}" x2="{FACE + PW / 2 + 6}" y2="{y}" stroke="#4a5056" stroke-width="1"/>')
p.append(f'<text x="{FACE + PW / 2}" y="{CY + PH / 2 + 14}" text-anchor="middle" {F} font-size="9" font-weight="700" fill="#c9cdd3" data-text="param.material">metal</text>')
p.append(f'<rect x="{FACE + PW / 2 - 25}" y="{CY - PH / 2 - 19}" width="50" height="16" rx="3" fill="#101317" fill-opacity=".85"/>')  # fondo de la cota
p.append(f'<text x="{FACE + PW / 2}" y="{CY - PH / 2 - 6}" text-anchor="middle" {F} font-size="10" font-weight="700" fill="#e8eaed" '
         f'data-text="out.distance|param.distance:mm">12,0 mm</text>')
p.append('</g>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
