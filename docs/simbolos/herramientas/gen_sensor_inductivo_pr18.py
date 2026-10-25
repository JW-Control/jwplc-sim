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

Zona de deteccion (frente a la cara activa, a escala): de 0 a Sa = 5,6 mm la
distancia de trabajo asegurada, hasta Sn = 8 mm el limite de deteccion, y de
8 a 8,8 mm la histeresis (10 %): una pieza que se acerca conmuta a 8 mm y la
que se aleja suelta recien a 8,8 mm. La zona se ilumina mientras detecta.

La pieza (acero, 25 mm de alto) se arrastra sobre el eje entre 0 y 25 mm
(accion "distance", data-drag); la cota sobre ella muestra la distancia.

Uso: python3 gen_sensor_inductivo_pr18.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

P = "sensor-inductive"
W, H = 400, 260


def mm(v):
    return v * 4


CY = 80                    # eje del sensor
R = 60                     # extremo trasero (salida del cable)
FACE = R + mm(47)          # cara activa: x = 248
MAXD = 25                  # recorrido de la pieza (mm)
SN, SA, HY = 8, 5.6, 0.1
TXT = "#c9cdd3"


def x_from_face(d):
    return FACE - mm(d)


p = header("Sensor inductivo Autonics PR18-8DP (M18, Sn 8 mm), vista lateral segun foto y plano del fabricante. Escala 4 px/mm.", W, H)
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

# ---------------------------------------------------------------- zona de deteccion
ZH = mm(17)                # alto del campo: el de la cara activa
ZT = CY - ZH / 2


def zone(on):
    o = 1 if on else .45
    s = [f'<g opacity="{o}">']
    s.append(f'<path d="M{FACE} {ZT} H{FACE + mm(SA)} V{ZT + ZH} H{FACE} Z" fill="url(#PFX-zone)"/>')
    s.append(f'<path d="M{FACE + mm(SA)} {ZT} H{FACE + mm(SN)} V{ZT + ZH} H{FACE + mm(SA)} Z" fill="#3ddc84" fill-opacity=".18"/>')
    s.append(f'<rect x="{FACE + mm(SN)}" y="{ZT}" width="{mm(SN * HY)}" height="{ZH}" fill="url(#PFX-hys)"/>')
    s.append('</g>')
    return s


p.append('<g data-show="!out.detecting">')
p += zone(False)
p.append('</g><g data-show="out.detecting">')
p += zone(True)
p.append('</g>')
# eje y regla: 0 en la cara activa, marcas cada 5 mm
EX = FACE + mm(MAXD) + mm(10)
p.append(f'<line x1="{FACE}" y1="{CY}" x2="{EX}" y2="{CY}" stroke="#8a9099" stroke-width="1" stroke-dasharray="6 3 1.5 3"/>')
RY = 172
p.append(f'<line x1="{FACE}" y1="{RY}" x2="{FACE + mm(MAXD)}" y2="{RY}" stroke="#6b737c" stroke-width="1"/>')
for d in range(0, MAXD + 1):
    big = d % 5 == 0
    p.append(f'<line x1="{FACE + mm(d)}" y1="{RY}" x2="{FACE + mm(d)}" y2="{RY + (6 if big else 3)}" stroke="#6b737c" stroke-width="1"/>')
    if big:
        p.append(f'<text x="{FACE + mm(d)}" y="{RY + 16}" text-anchor="middle" {F} font-size="8" fill="#8a9099">{d}</text>')
p.append(f'<text x="{FACE + mm(MAXD) + 6}" y="{RY + 4}" {F} font-size="8" fill="#8a9099">mm</text>')
for d, name in ((SA, "Sa"), (SN, "Sn")):
    x = FACE + mm(d)
    p.append(f'<line x1="{x}" y1="{ZT + ZH}" x2="{x}" y2="{RY}" stroke="#3ddc84" stroke-width=".8" stroke-dasharray="2 2" opacity=".7"/>')
    p.append(f'<text x="{x}" y="{RY - 4}" text-anchor="{"end" if name == "Sa" else "start"}" dx="{-2 if name == "Sa" else 2}" {F} font-size="8" font-weight="700" fill="#7fe3a8">{name}</text>')

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
PW, PH = mm(10), mm(25)
p.append(f'<g data-translate="out.distance|param.distance:0:{MAXD}:x:{mm(MAXD)}" data-action="distance" data-kind="drag" data-drag="x:{FACE}:4:0:{MAXD}" style="cursor:ew-resize">')
p.append(f'<rect x="{FACE - 4}" y="{CY - PH / 2 - 18}" width="{PW + 8}" height="{PH + 22}" fill="#000" opacity="0"/>')  # zona de agarre
p.append(f'<rect x="{FACE + 2}" y="{CY - PH / 2 + 3}" width="{PW}" height="{PH}" rx="1.5" fill="#000" opacity=".3"/>')
p.append(f'<rect x="{FACE}" y="{CY - PH / 2}" width="{PW}" height="{PH}" rx="1.5" fill="url(#PFX-steel)" stroke="#2e3338" stroke-width="1"/>')
p.append(f'<line x1="{FACE + 3}" y1="{CY - PH / 2 + 3}" x2="{FACE + 3}" y2="{CY + PH / 2 - 3}" stroke="#e6eaee" stroke-width="1.2" opacity=".6"/>')
for k in range(3):
    y = CY - 8 + k * 8
    p.append(f'<line x1="{FACE + PW / 2 - 6}" y1="{y}" x2="{FACE + PW / 2 + 6}" y2="{y}" stroke="#4a5056" stroke-width="1"/>')
p.append(f'<text x="{FACE + PW / 2}" y="{CY - PH / 2 - 6}" text-anchor="middle" {F} font-size="10" font-weight="700" fill="#e8eaed" '
         f'data-text="out.distance|param.distance:mm">20,0 mm</text>')
p.append('</g>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
