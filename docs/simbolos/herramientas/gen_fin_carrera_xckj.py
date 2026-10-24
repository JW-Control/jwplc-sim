"""Fin de carrera Telemecanique XCKJ con palanca de rodillo (XCKJ10511), vista frontal.

Referencias entregadas por JW Control (26/10/2026): fotos de frente y el plano
acotado del fabricante (mm). Cotas del plano usadas (medidas desde el borde
superior del rodillo):

    rodillo                 Ø22, centro a 11
    eje del cabezal         a 41 del borde superior del rodillo
    agujeros de fijacion    Ø5,3, a 63 y 123; 30 entre centros, centrados
    cuerpo                  40 de ancho, hasta 133 (alto total)
    cabezal                 ~34 de ancho (medido en el plano), desde ~30

El cubo del eje es un cono truncado (base ancha contra el cabezal, se angosta
hacia la tuerca): se dibuja con su sombreado radial, la arandela lobulada y la
tuerca hexagonal.

Escala 4 px/mm. Los bornes (13-14 NA, 21-22 NC) estan dentro, bajo la tapa:
salen por la entrada Pg 13,5 de abajo en un cable de 4 hilos numerados
(lineamientos 2.4, el borne oculto asoma). Bocas en x = 40, 60, 100, 120.

Estado (lineamientos 2.5): al accionarse, la palanca gira 25 grados alrededor
del eje del cabezal. Palanca y rodillo son la zona de clic (accion "actuate").

Uso: python3 gen_fin_carrera_xckj.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term


def mm(v):
    return round(v * 4, 1)


W, H = 160, 620
P = "limit-switch"
CX = 80
ROLL = (CX, mm(11))           # centro del rodillo
HUB = (CX, mm(41))            # eje del cabezal
BODY_T, BODY_B = mm(55.5), mm(133)
NAVY, COVER, TXT = "#25356a", "#2f4580", "#e9edf6"

p = header("Fin de carrera Telemecanique XCKJ10511 (palanca de rodillo), vista frontal segun fotos y plano del fabricante. Escala 4 px/mm.", W, H)
for d in (
    f'<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2853"/><stop offset=".12" stop-color="{NAVY}"/><stop offset=".85" stop-color="{NAVY}"/><stop offset="1" stop-color="#18234a"/></linearGradient>',
    f'<linearGradient id="PFX-cov" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a5290"/><stop offset=".5" stop-color="{COVER}"/><stop offset="1" stop-color="#26396b"/></linearGradient>',
    '<linearGradient id="PFX-head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a9fa4"/><stop offset=".25" stop-color="#d4d7d9"/><stop offset=".7" stop-color="#bfc3c6"/><stop offset="1" stop-color="#8e9398"/></linearGradient>',
    '<linearGradient id="PFX-arm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f9499"/><stop offset=".4" stop-color="#e2e4e6"/><stop offset="1" stop-color="#9da2a7"/></linearGradient>',
    # Cono truncado visto de frente: el borde (base) oscuro y la cara chica clara.
    '<radialGradient id="PFX-cone" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#eceef0"/><stop offset=".55" stop-color="#d0d3d6"/><stop offset=".8" stop-color="#a7acb1"/><stop offset="1" stop-color="#7c8186"/></radialGradient>',
    '<radialGradient id="PFX-roll" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#3a3d42"/><stop offset=".7" stop-color="#1a1c1f"/><stop offset="1" stop-color="#0c0d0e"/></radialGradient>',
    '<radialGradient id="PFX-nut" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f1f2f3"/><stop offset=".6" stop-color="#b9bdc1"/><stop offset="1" stop-color="#7d8287"/></radialGradient>',
):
    p.insert(-1, d)


def phillips(cx, cy, r=7.0):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1"/>'
            f'<path d="M{cx-r*.55:.1f} {cy}H{cx+r*.55:.1f}M{cx} {cy-r*.55:.1f}V{cy+r*.55:.1f}" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>')


def hexagon(cx, cy, r, fill, stroke=INK):
    pts = " ".join(f"{cx + r*c:.1f},{cy + r*s:.1f}" for c, s in ((1, 0), (.5, .866), (-.5, .866), (-1, 0), (-.5, -.866), (.5, -.866)))
    return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>'


def lobed(cx, cy, r, n=8):
    """Arandela lobulada (estrellada) del cubo, como en la foto."""
    import math
    pts = []
    for k in range(n * 2):
        a = math.pi * k / n
        rr = r if k % 2 == 0 else r * .82
        pts.append(f"{cx + rr*math.cos(a):.1f},{cy + rr*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="url(#PFX-nut)" stroke="#5f6469" stroke-width=".9" stroke-linejoin="round"/>'


# ---- cuerpo azul (40 mm) y la tapa con la etiqueta impresa
p.append(f'<rect x="1" y="{BODY_T+2}" width="158" height="{BODY_B-BODY_T}" rx="7" fill="#000" opacity=".25"/>')
p.append(f'<rect x="1" y="{BODY_T}" width="158" height="{BODY_B-BODY_T}" rx="7" fill="url(#PFX-body)" stroke="#0f1630" stroke-width="1.4"/>')
for x in (CX - mm(15), CX + mm(15)):                  # agujeros Ø5,3 a 30 mm
    for y in (mm(63), mm(123)):
        p.append(f'<circle cx="{x}" cy="{y}" r="{mm(2.65)}" fill="#0d1330" stroke="#3a4a7a" stroke-width=".9"/>')
p.append(phillips(CX, mm(62.5)))                       # tornillo de la tapa
p.append(f'<rect x="16" y="{mm(66)}" width="128" height="{mm(51)}" rx="7" fill="url(#PFX-cov)" stroke="#1a2650" stroke-width="1.2"/>')
p.append(f'<rect x="18" y="{mm(66)+2}" width="124" height="{mm(51)-4}" rx="6" fill="none" stroke="#5d74b0" stroke-width=".8" opacity=".6"/>')
p.append(phillips(CX, mm(126.5)))                      # tornillo de la base

# Etiqueta: hueco del logo (sin archivo oficial), modelo y datos impresos.
Y = mm(66)                                             # borde superior de la tapa
p.append(f'<g id="{P}-logo"></g>')
p.append(f'<text x="{CX}" y="{Y+58}" text-anchor="middle" {F} font-size="16" font-weight="700" fill="{TXT}">XCKJ</text>')
p.append(f'<line x1="22" y1="{Y+63}" x2="138" y2="{Y+63}" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<line x1="110" y1="{Y+63}" x2="110" y2="{Y+190}" stroke="{TXT}" stroke-width=".8"/>')
for k, t in enumerate(("EN / IEC 60947-5-1", "Ui : 500V Uimp : 6kV", "AC15  240V  3A")):
    p.append(f'<text x="22" y="{Y+73+9*k}" {F} font-size="8" font-weight="600" fill="{TXT}">{t}</text>')
p.append(f'<line x1="22" y1="{Y+95}" x2="110" y2="{Y+95}" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<text x="22" y="{Y+104}" {F} font-size="8" font-weight="600" fill="{TXT}">EN 50041</text>')
p.append(f'<line x1="22" y1="{Y+108}" x2="110" y2="{Y+108}" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<text x="113" y="{Y+76}" {F} font-size="9" font-weight="600" fill="{TXT}">IP 66</text>')
p.append(f'<line x1="110" y1="{Y+80}" x2="138" y2="{Y+80}" stroke="{TXT}" stroke-width=".8"/>')
# Marcas de certificacion como recuadros genericos (lineamientos 2.7).
p.append(f'<circle cx="123" cy="{Y+95}" r="6" fill="none" stroke="{TXT}" stroke-width=".9"/>')
p.append(f'<circle cx="30" cy="{Y+120}" r="7" fill="none" stroke="{TXT}" stroke-width="1"/>')
for k, t in enumerate(("LISTED", "170M", "IND. CONT. EQ.")):
    p.append(f'<text x="40" y="{Y+117+7*k}" {F} font-size="7" font-weight="600" fill="{TXT}">{t}</text>')
p.append(f'<circle cx="30" cy="{Y+152}" r="7" fill="none" stroke="{TXT}" stroke-width="1"/>')
p.append(f'<text x="40" y="{Y+150}" {F} font-size="8" font-weight="600" fill="{TXT}">Enc. Type 4</text>')
p.append(f'<text x="40" y="{Y+159}" {F} font-size="8" font-weight="600" fill="{TXT}">A300 Q300</text>')
p.append(f'<text x="22" y="{Y+184}" {F} font-size="7.5" fill="{TXT}">Made in France</text>')
p.append(f'<text x="114" y="{Y+186}" {F} font-size="12" fill="{TXT}">CE</text>')

# ---- entrada Pg 13,5 con su prensaestopa y el cable de 4 hilos (13, 14, 21, 22)
G = BODY_B + 20
p.append(hexagon(CX, G, 21, "url(#PFX-nut)"))
p.append(f'<rect x="{CX-12}" y="{G+12}" width="24" height="10" rx="3" fill="#2b2e33" stroke="{INK}"/>')
p.append(f'<rect x="{CX-8}" y="{G+21}" width="16" height="9" fill="#3a3e44" stroke="{INK}" stroke-width=".8"/>')
for x, name in ((40, "13"), (60, "14"), (100, "21"), (120, "22")):
    p.append(f'<path d="M{CX + (x - CX) * .12:.1f} {G+30} C{CX + (x - CX) * .2:.1f} {G+42} {x} {G+38} {x} {G+48} V612" fill="none" stroke="#5f656c" stroke-width="4"/>')
    p.append(f'<rect x="{x-4}" y="604" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{x-5}" y="{H-4}" width="10" height="4" fill="#16181b"/>')
    p.append(f'<text x="{x}" y="600" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd3">{name}</text>')
    p.append(jw_term(name, x, 608))

# ---- cabezal metalico (~34 mm) sobre el cuerpo, y el cubo conico del eje
HT = mm(30.5)
p.append(f'<rect x="{CX-mm(17)}" y="{HT}" width="{mm(34)}" height="{BODY_T-HT+6}" rx="5" fill="url(#PFX-head)" stroke="#5f6469" stroke-width="1.2"/>')
for x in (CX - mm(14.5), CX + mm(14.5)):
    p.append(f'<circle cx="{x}" cy="{HT+8}" r="2.5" fill="#8a8f94" stroke="#5f6469" stroke-width=".6"/>')
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]+1.5}" r="{mm(8.5)}" fill="#000" opacity=".22"/>')
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="{mm(8.5)}" fill="url(#PFX-cone)" stroke="#6b7075" stroke-width="1"/>')
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="{mm(6.4)}" fill="none" stroke="#f5f6f7" stroke-width="1" opacity=".7"/>')

# ---- palanca de rodillo: gira con out.actuated; zona de clic "actuate"
p.append(f'<g data-rotate="out.actuated:0:1:0:25:{HUB[0]}:{HUB[1]}" data-action="actuate" data-kind="momentary">')
p.append(f'<path d="M{CX-mm(5.5)} {HUB[1]} L{CX-mm(4.2)} {ROLL[1]} Q{CX} {ROLL[1]-mm(5)} {CX+mm(4.2)} {ROLL[1]} L{CX+mm(5.5)} {HUB[1]} Z" fill="url(#PFX-arm)" stroke="#5f6469" stroke-width="1.2"/>')
p.append(lobed(HUB[0], HUB[1], mm(5.8)))
p.append(hexagon(HUB[0], HUB[1], mm(3.3), "url(#PFX-nut)", "#5f6469"))
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="{mm(1.6)}" fill="#d9dcdf" stroke="#5f6469" stroke-width=".8"/>')
p.append(f'<line x1="{HUB[0]-mm(1.2)}" y1="{HUB[1]}" x2="{HUB[0]+mm(1.2)}" y2="{HUB[1]}" stroke="#4a4f54" stroke-width="1.4"/>')
p.append(f'<circle cx="{ROLL[0]}" cy="{ROLL[1]}" r="{mm(11)}" fill="url(#PFX-roll)" stroke="#000" stroke-width="1"/>')
p.append(f'<circle cx="{ROLL[0]}" cy="{ROLL[1]}" r="{mm(8.5)}" fill="none" stroke="#2c2f33" stroke-width="1.2"/>')
p.append(hexagon(ROLL[0], ROLL[1], mm(3.8), "url(#PFX-nut)", "#5f6469"))
p.append('</g>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
