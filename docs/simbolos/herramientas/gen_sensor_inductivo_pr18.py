"""Sensor inductivo Autonics PR18-8DP (M18, no blindado, Sn 8 mm), vista lateral.

Referencias entregadas por JW Control (25/10/2026): foto del PR18-8DP y el
plano acotado del manual de Autonics (mm):

    largo total             47
    capuchon (cara activa)  10, sobresale de la rosca (tipo no blindado)
    rosca                   M18 x 1
    tuercas                 24 entre caras, 29 entre vertices, 4 de espesor
    cable                   Ø5, 2 m

La foto manda en lo que el plano simplifica: capuchon naranja, cuerpo cromado
roscado casi hasta atras, extremo de plastico negro con el LED rojo de
operacion y el cable. Un sensor cilindrico solo se reconoce de costado, asi que
se dibuja acostado (lineamientos 2.2: el equipo puede girarse), con la cara
activa a la derecha como en el plano.

Escala 4 px/mm. El cable baja por la izquierda y abre sus tres hilos con los
colores de IEC 60947-5-2: BN (+V), BU (0 V) y BK (salida). Cada hilo lleva su
funcion rotulada. Bocas en x = 40, 80, 120.

Area de trabajo frente a la cara activa, AMPLIADA a 16 px/mm (4 veces el
sensor) para que se pueda manipular con el mouse: a 4 px/mm la histeresis
mediria 3 px. La regla de abajo esta en mm reales. Dos zonas, como en
EduVolt: deteccion de 0 a Sn = 8 mm (verde) e histeresis de 8 a 8,8 mm (10 %,
franja ambar): una pieza que se acerca conecta en 8,0 mm y la que se aleja
suelta recien en 8,8 mm. La zona se ilumina
mientras detecta; dentro de la franja, encendida o no segun de donde venga.

La pieza (acero) se arrastra sobre el eje entre 0 y 16 mm (accion
"distance", data-drag, un paso de 0,1 mm = 1,6 px); la cota sobre ella
muestra la distancia.

Uso: python3 gen_sensor_inductivo_pr18.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

P = "sensor-inductive"
W, H = 560, 260


def mm(v):
    return v * 4


CY = 80                    # eje del sensor
R = 60                     # extremo trasero (salida del cable)
FACE = R + mm(47)          # cara activa: x = 248
MAXD = 16                  # recorrido de la pieza (mm)
ZS = 16                    # escala del area de trabajo (px/mm)
SN, HY = 8, 0.1
TXT = "#c9cdd3"


def x_from_face(d):
    return FACE - mm(d)


p = header("Sensor inductivo Autonics PR18-8DP (M18, Sn 8 mm), vista lateral segun foto y plano del fabricante. Sensor a 4 px/mm; area de trabajo ampliada a 16 px/mm.", W, H)
for d in (
    '<linearGradient id="PFX-cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d949b"/><stop offset=".18" stop-color="#f4f6f8"/><stop offset=".38" stop-color="#c3c9cf"/><stop offset=".7" stop-color="#7c848c"/><stop offset="1" stop-color="#4c5258"/></linearGradient>',
    '<linearGradient id="PFX-nut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1a8"/><stop offset=".3" stop-color="#eef1f3"/><stop offset=".55" stop-color="#b8bfc6"/><stop offset="1" stop-color="#5d646b"/></linearGradient>',
    '<linearGradient id="PFX-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a35a"/><stop offset=".3" stop-color="#ff9a3c"/><stop offset=".75" stop-color="#e2701a"/><stop offset="1" stop-color="#a94f10"/></linearGradient>',
    '<linearGradient id="PFX-blk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f56"/><stop offset=".35" stop-color="#2a2d32"/><stop offset="1" stop-color="#121315"/></linearGradient>',
    '<linearGradient id="PFX-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d747b"/><stop offset=".35" stop-color="#b5bcc3"/><stop offset=".6" stop-color="#8f979f"/><stop offset="1" stop-color="#596067"/></linearGradient>',
    '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2f0"/><stop offset=".45" stop-color="#ff3b2f"/><stop offset="1" stop-color="#ff3b2f" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="PFX-zone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3ddc84" stop-opacity=".55"/><stop offset="1" stop-color="#3ddc84" stop-opacity=".25"/></linearGradient>',
    '<pattern id="PFX-hys" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f2c230" fill-opacity=".25"/><line x1="0" y1="0" x2="0" y2="4" stroke="#f2c230" stroke-width="1.6"/></pattern>',
):
    p.insert(-1, d)

# ---------------------------------------------------------------- area de trabajo (16 px/mm)
ZH = mm(17)                # alto del campo: el de la cara activa
ZT = CY - ZH / 2
RY = 204                   # regla (bajo la pieza: los rotulos no quedan tapados)


def zx(d):
    return FACE + ZS * d


def zone(on):
    o = 1 if on else .4
    s = [f'<g opacity="{o}">']
    s.append(f'<rect x="{FACE}" y="{ZT}" width="{ZS * SN}" height="{ZH}" fill="url(#PFX-zone)"/>')
    s.append('</g>')
    return s


p.append('<g data-show="!out.detecting">')
p += zone(False)
p.append('</g><g data-show="out.detecting">')
p += zone(True)
p.append('</g>')
# histeresis: franja ambar de Sn a 1,1 Sn, alta hasta la regla
HX0, HX1 = zx(SN), zx(SN * (1 + HY))
p.append(f'<rect x="{HX0}" y="{ZT - 6}" width="{HX1 - HX0}" height="{RY - ZT + 6}" fill="url(#PFX-hys)"/>')
p.append(f'<line x1="{HX0}" y1="{ZT - 6}" x2="{HX0}" y2="{RY}" stroke="#3ddc84" stroke-width="1.6"/>')
p.append(f'<line x1="{HX1}" y1="{ZT - 6}" x2="{HX1}" y2="{RY}" stroke="#f2c230" stroke-width="1.6"/>')
p.append(f'<text x="{HX0 - 3}" y="{RY - 40}" text-anchor="end" {F} font-size="9" font-weight="700" fill="#7fe3a8">detección 8,0</text>')
p.append(f'<text x="{HX1 + 3}" y="{RY - 40}" {F} font-size="9" font-weight="700" fill="#f2c230">histéresis 8,8</text>')
# eje y regla en mm reales: marca cada 1 mm, numero cada 2 mm
EX = zx(MAXD) + mm(10) + 12
p.append(f'<line x1="{FACE}" y1="{CY}" x2="{EX}" y2="{CY}" stroke="#8a9099" stroke-width="1" stroke-dasharray="6 3 1.5 3"/>')
p.append(f'<line x1="{FACE}" y1="{RY}" x2="{zx(MAXD)}" y2="{RY}" stroke="#6b737c" stroke-width="1"/>')
for d in range(0, MAXD + 1):
    big = d % 2 == 0
    p.append(f'<line x1="{zx(d)}" y1="{RY}" x2="{zx(d)}" y2="{RY + (6 if big else 3)}" stroke="#6b737c" stroke-width="1"/>')
    if big:
        p.append(f'<text x="{zx(d)}" y="{RY + 16}" text-anchor="middle" {F} font-size="8" fill="#8a9099">{d}</text>')
p.append(f'<text x="{zx(MAXD) + 8}" y="{RY + 4}" {F} font-size="8" fill="#8a9099">mm</text>')

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
                 f'<text x="{FX + 43}" y="{FY + 15}" text-anchor="middle" {F} font-size="12" font-weight="700" fill="{INK}">PR18-8D{oc}{cc}</text></g></g>')
p.append(f'<text x="{FX + 43}" y="{FY + 28}" text-anchor="middle" {F} font-size="8" fill="#3a3f45">12-24VDC</text>')

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

# cuerpo cromado roscado M18 x 1
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
         f'fill="url(#PFX-cap)" stroke="#7a3a0c" stroke-width="1"/>')
p.append(f'<line x1="{TE + 3}" y1="{CY - CH / 2 + 1}" x2="{TE + 3}" y2="{CY + CH / 2 - 1}" stroke="#a94f10" stroke-width="1.4"/>')
p.append(f'<line x1="{TE + 6}" y1="{CY - CH / 2 + 6}" x2="{FACE - 6}" y2="{CY - CH / 2 + 6}" stroke="#ffd2a8" stroke-width="1.4" opacity=".7"/>')


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
p.append(f'<g data-translate="out.distance|param.distance:0:{MAXD}:x:{ZS * MAXD}" data-action="distance" data-kind="drag" data-drag="x:{FACE}:{ZS}:0:{MAXD}" style="cursor:ew-resize">')
p.append(f'<rect x="{FACE - 4}" y="{CY - PH / 2 - 18}" width="{PW + 8}" height="{PH + 22}" fill="#000" opacity="0"/>')  # zona de agarre
p.append(f'<rect x="{FACE + 2}" y="{CY - PH / 2 + 3}" width="{PW}" height="{PH}" rx="1.5" fill="#000" opacity=".3"/>')
p.append(f'<rect x="{FACE}" y="{CY - PH / 2}" width="{PW}" height="{PH}" rx="1.5" fill="url(#PFX-steel)" stroke="#2e3338" stroke-width="1"/>')
p.append(f'<line x1="{FACE + 3}" y1="{CY - PH / 2 + 3}" x2="{FACE + 3}" y2="{CY + PH / 2 - 3}" stroke="#e6eaee" stroke-width="1.2" opacity=".6"/>')
for k in range(3):
    y = CY - 8 + k * 8
    p.append(f'<line x1="{FACE + PW / 2 - 6}" y1="{y}" x2="{FACE + PW / 2 + 6}" y2="{y}" stroke="#4a5056" stroke-width="1"/>')
p.append(f'<text x="{FACE + PW / 2}" y="{CY - PH / 2 - 6}" text-anchor="middle" {F} font-size="10" font-weight="700" fill="#e8eaed" '
         f'data-text="out.distance|param.distance:mm">12,0 mm</text>')
p.append('</g>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
