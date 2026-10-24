"""Fin de carrera Telemecanique XCKJ con palanca de rodillo (XCKJ10511), vista frontal.

Referencia: fotos de frente entregadas por JW Control (26/10/2026). Cuerpo de
40 mm de ancho; proporciones medidas sobre la foto (14,8 px/mm).

Escala 4 px/mm: cuerpo 160 px de ancho. Los bornes (13-14 NA, 21-22 NC)
estan dentro, bajo la tapa: salen por el prensaestopa de abajo en un cable de
4 hilos numerados (licencia de los lineamientos 2.4: el borne oculto asoma).
Bocas en x = 40, 60, 100, 120.

Estado (lineamientos 2.5): al accionarse, la palanca gira 25 grados alrededor
del eje del cabezal. La palanca y el rodillo son la zona de clic (accion
"actuate", momentanea).

Uso: python3 gen_fin_carrera_xckj.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

W, H = 160, 620
P = "limit-switch"
CX = 80                 # eje del cuerpo
HUB = (80, 170)         # eje del cabezal giratorio
NAVY, COVER, TXT = "#25356a", "#2f4580", "#e9edf6"

p = header("Fin de carrera Telemecanique XCKJ10511 (palanca de rodillo), vista frontal segun fotos de JW Control. Escala 4 px/mm.", W, H)
for d in (
    f'<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2853"/><stop offset=".12" stop-color="{NAVY}"/><stop offset=".85" stop-color="{NAVY}"/><stop offset="1" stop-color="#18234a"/></linearGradient>',
    f'<linearGradient id="PFX-cov" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a5290"/><stop offset=".5" stop-color="{COVER}"/><stop offset="1" stop-color="#26396b"/></linearGradient>',
    '<linearGradient id="PFX-head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a9fa4"/><stop offset=".25" stop-color="#d4d7d9"/><stop offset=".7" stop-color="#bfc3c6"/><stop offset="1" stop-color="#8e9398"/></linearGradient>',
    '<linearGradient id="PFX-arm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f9499"/><stop offset=".4" stop-color="#e2e4e6"/><stop offset="1" stop-color="#9da2a7"/></linearGradient>',
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


# ---- cuerpo azul con orejas de fijacion y la tapa con la etiqueta impresa
p.append('<rect x="1" y="192" width="158" height="342" rx="8" fill="#000" opacity=".25"/>')
p.append('<path d="M1 198 Q1 190 9 190 H151 Q159 190 159 198 V522 Q159 530 151 530 H9 Q1 530 1 522 Z" fill="url(#PFX-body)" stroke="#0f1630" stroke-width="1.4"/>')
for x in (14, 146):                                   # agujeros de fijacion
    for y in (240, 490):
        p.append(f'<rect x="{x-6}" y="{y-10}" width="12" height="20" rx="5" fill="#0d1330" stroke="#3a4a7a" stroke-width=".8"/>')
p.append(phillips(CX, 252))                           # tornillo de la tapa
p.append('<rect x="18" y="264" width="124" height="196" rx="7" fill="url(#PFX-cov)" stroke="#1a2650" stroke-width="1.2"/>')
p.append('<rect x="20" y="266" width="120" height="192" rx="6" fill="none" stroke="#5d74b0" stroke-width=".8" opacity=".6"/>')
p.append(phillips(CX, 515))                           # tornillo inferior (base)

# Etiqueta: hueco del logo (sin archivo oficial), modelo y datos impresos.
p.append(f'<g id="{P}-logo"></g>')
p.append(f'<text x="{CX}" y="322" text-anchor="middle" {F} font-size="16" font-weight="700" fill="{TXT}">XCKJ</text>')
p.append(f'<line x1="24" y1="327" x2="136" y2="327" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<line x1="110" y1="327" x2="110" y2="452" stroke="{TXT}" stroke-width=".8"/>')
for y, t in ((337, "EN / IEC 60947-5-1"), (346, "Ui : 500V Uimp : 6kV"), (355, "AC15  240V  3A")):
    p.append(f'<text x="23" y="{y}" {F} font-size="8" font-weight="600" fill="{TXT}">{t}</text>')
p.append(f'<line x1="24" y1="358" x2="110" y2="358" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<text x="23" y="368" {F} font-size="8" font-weight="600" fill="{TXT}">EN 50041</text>')
p.append(f'<line x1="24" y1="371" x2="110" y2="371" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<text x="113" y="340" {F} font-size="9" font-weight="600" fill="{TXT}">IP 66</text>')
p.append(f'<line x1="110" y1="344" x2="136" y2="344" stroke="{TXT}" stroke-width=".8"/>')
# Marcas de certificacion como recuadros genericos (lineamientos 2.7).
p.append(f'<circle cx="123" cy="358" r="6" fill="none" stroke="{TXT}" stroke-width=".9"/>')
p.append(f'<circle cx="31" cy="383" r="7" fill="none" stroke="{TXT}" stroke-width="1"/>')
for y, t in ((380, "LISTED"), (387, "170M"), (394, "IND. CONT. EQ.")):
    p.append(f'<text x="41" y="{y}" {F} font-size="7" font-weight="600" fill="{TXT}">{t}</text>')
p.append(f'<circle cx="31" cy="414" r="7" fill="none" stroke="{TXT}" stroke-width="1"/>')
p.append(f'<text x="41" y="412" {F} font-size="8" font-weight="600" fill="{TXT}">Enc. Type 4</text>')
p.append(f'<text x="41" y="421" {F} font-size="8" font-weight="600" fill="{TXT}">A300 Q300</text>')
p.append(f'<text x="23" y="446" {F} font-size="7.5" fill="{TXT}">Made in France</text>')
p.append(f'<text x="114" y="448" {F} font-size="12" fill="{TXT}">CE</text>')

# ---- prensaestopa y cable de 4 hilos hasta las bocas (13, 14, 21, 22)
p.append(hexagon(CX, 550, 21, "url(#PFX-nut)"))
p.append(f'<rect x="{CX-12}" y="562" width="24" height="10" rx="3" fill="#2b2e33" stroke="{INK}"/>')
p.append(f'<rect x="{CX-8}" y="571" width="16" height="9" fill="#3a3e44" stroke="{INK}" stroke-width=".8"/>')
for x, name in ((40, "13"), (60, "14"), (100, "21"), (120, "22")):
    p.append(f'<path d="M{CX + (x - CX) * .12:.1f} 580 C{CX + (x - CX) * .2:.1f} 592 {x} 588 {x} 600 V612" fill="none" stroke="#5f656c" stroke-width="4"/>')
    p.append(f'<rect x="{x-4}" y="604" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{x-5}" y="{H-4}" width="10" height="4" fill="#16181b"/>')
    p.append(f'<text x="{x}" y="598" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#2b2f35">{name}</text>')
    p.append(jw_term(name, x, 608))

# ---- cabezal metalico (debajo de la palanca)
p.append(f'<rect x="{CX-63}" y="94" width="126" height="104" rx="6" fill="url(#PFX-head)" stroke="#5f6469" stroke-width="1.2"/>')
for x, y in ((CX - 55, 102), (CX + 55, 102)):
    p.append(f'<circle cx="{x}" cy="{y}" r="2.5" fill="#8a8f94" stroke="#5f6469" stroke-width=".6"/>')
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="31" fill="#b2b6ba" stroke="#6b7075" stroke-width="1"/>')

# ---- palanca de rodillo: gira con out.actuated; zona de clic "actuate"
p.append(f'<g data-rotate="out.actuated:0:1:0:25:{HUB[0]}:{HUB[1]}" data-action="actuate" data-kind="momentary">')
p.append(f'<path d="M{HUB[0]-16} {HUB[1]} V44 Q{HUB[0]-16} 30 {HUB[0]} 30 Q{HUB[0]+16} 30 {HUB[0]+16} 44 V{HUB[1]} Z" fill="url(#PFX-arm)" stroke="#5f6469" stroke-width="1.2"/>')
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="24" fill="url(#PFX-arm)" stroke="#5f6469" stroke-width="1.2"/>')
p.append(hexagon(HUB[0], HUB[1], 13, "url(#PFX-nut)", "#5f6469"))
p.append(f'<circle cx="{HUB[0]}" cy="{HUB[1]}" r="5.5" fill="#d9dcdf" stroke="#5f6469" stroke-width=".8"/>')
p.append(f'<line x1="{HUB[0]-4}" y1="{HUB[1]}" x2="{HUB[0]+4}" y2="{HUB[1]}" stroke="#4a4f54" stroke-width="1.4"/>')
p.append(f'<circle cx="{HUB[0]}" cy="44" r="40" fill="url(#PFX-roll)" stroke="#000" stroke-width="1"/>')
p.append(f'<circle cx="{HUB[0]}" cy="44" r="31" fill="none" stroke="#2c2f33" stroke-width="1.2"/>')
p.append(hexagon(HUB[0], 44, 15, "url(#PFX-nut)", "#5f6469"))
p.append('</g>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
