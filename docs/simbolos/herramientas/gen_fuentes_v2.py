"""Fuentes 24 VDC Mean Well v2 (JWPLC Sim), dibujadas desde fotos de frente.
Escala 4 px/mm. Bornes a paso de 20 px (como las borneras de la placa).

NDR-120-24  40 x 125,2 mm -> 160 x 500. Frente azul impreso, borneras verdes.
            Arriba -V -V +V +V (x 40..100); abajo tierra N L (x 60..100).
HDR-60-24   52,5 x 90 mm -> 210 x 360 (viewBox 220). Plastico negro escalonado.
            Arriba -V -V +V +V (x 80..140); abajo N L (x 100, 120).
MDR-60-24   40 x 90 mm -> 160 x 360 (viewBox 180). Frente gris claro, laterales turquesa.
            Arriba +V +V -V -V DC-OK DC-OK (x 40..140); abajo tierra N L (x 60..100).
Logo: imagen oficial de Mean Well entregada por JW Control, incrustada en <g id="...-logo">.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, INK, F

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
EXTRA = [
    '<linearGradient id="PFX-blu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b5590"/><stop offset=".6" stop-color="#2367a8"/><stop offset="1" stop-color="#1d5a97"/></linearGradient>',
    '<linearGradient id="PFX-alu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa2ab"/><stop offset=".5" stop-color="#d5d9de"/><stop offset="1" stop-color="#8e969f"/></linearGradient>',
    '<linearGradient id="PFX-grn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb468"/><stop offset="1" stop-color="#25803f"/></linearGradient>',
    '<linearGradient id="PFX-blk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1d20"/><stop offset=".5" stop-color="#2c2e32"/><stop offset="1" stop-color="#1a1b1e"/></linearGradient>',
    '<linearGradient id="PFX-scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#9ea5ad"/></linearGradient>',
    '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#eaffef" stop-opacity=".95"/><stop offset=".35" stop-color="#5dff7e" stop-opacity=".7"/><stop offset="1" stop-color="#2fbf5a" stop-opacity="0"/></radialGradient>',
]


def doc(comment, w, h):
    p = header(comment, w, h)
    for e in EXTRA:
        p.insert(p.index('</defs>'), e)
    return p


def slot_screw(x, y, r=7.0):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1.1"/>'
            f'<path d="M{x-r*.65:.1f} {y+r*.3:.1f} L{x+r*.65:.1f} {y-r*.3:.1f}" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>')


def green_block(p, xs, y0, y1, names, top):
    """Bornera verde fija (como la placa): tornillos ranurados al frente, bocas al borde."""
    x0, x1 = xs[0] - 11, xs[-1] + 11
    p.append(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="2" fill="url(#PFX-grn)" stroke="#145a2a" stroke-width="1.2"/>')
    ty = (y0 + y1) / 2
    for x, n in zip(xs, names):
        p.append(f'<rect x="{x-6}" y="{y0 if top else y1-6}" width="12" height="6" fill="#0f3d1d"/>')  # boca del cable
        p.append(f'<circle cx="{x}" cy="{ty}" r="8.5" fill="#1d6b35"/>')
        p.append(slot_screw(x, ty))
        p.append(jw_term(n, x, ty))
    for x in xs[:-1]:
        p.append(f'<line x1="{x+10}" y1="{y0+2}" x2="{x+10}" y2="{y1-2}" stroke="#145a2a" stroke-width="1"/>')


def hole_terms(p, xs, y, names, r=8.5):
    """Tornillo dentro de un agujero de la carcasa (HDR / MDR)."""
    for x, n in zip(xs, names):
        p.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#0a0a0b"/>')
        p.append(slot_screw(x, y, r - 2))
        p.append(jw_term(n, x, y))


import base64 as _b64
_LOGO = _b64.b64encode(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "marcas", "meanwell-logo-240.png"), "rb").read()).decode()


def logo_slot(p, x, y, w, h, light_bg):
    """Logo oficial de Mean Well (archivo entregado por JW Control), proporcion 824:488."""
    hh = round(w * 488 / 824, 1)
    p.append(f'<g id="PFX-logo"><image x="{x}" y="{y}" width="{w}" height="{hh}" preserveAspectRatio="xMidYMid meet" '
             f'href="data:image/png;base64,{_LOGO}"/></g>')


def adj_led(p, x, y_adj, y_led, tc):
    p.append(f'<circle cx="{x}" cy="{y_adj}" r="8" fill="#15171a" stroke="{INK}"/><circle cx="{x}" cy="{y_adj}" r="5" fill="#2a2d31"/><path d="M{x-4} {y_adj+3} L{x+4} {y_adj-3}" stroke="#9aa1aa" stroke-width="1.6"/>')
    p.append(f'<path d="M{x-12} {y_adj-6} A13 13 0 0 1 {x+10} {y_adj-9}" fill="none" stroke="{tc}" stroke-width="1.2"/><text x="{x+15}" y="{y_adj-6}" {F} font-size="9" font-weight="800" fill="{tc}">+</text>')
    p.append(f'<text x="{x}" y="{y_adj+19}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{tc}">+V ADJ</text>')
    p.append(f'<circle cx="{x}" cy="{y_led}" r="5" fill="#1d2a22" stroke="{INK}"/>')
    p.append(f'<g data-show="out.on"><circle cx="{x}" cy="{y_led}" r="16" fill="url(#PFX-led)"/><circle cx="{x}" cy="{y_led}" r="5" fill="#5dff7e" stroke="#0f5a25"/></g>')
    p.append(f'<text x="{x}" y="{y_led+16}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{tc}">DC OK</text>')


def tripped(p, cx, cy, w=120):
    p.append('<g data-show="tripped">')
    p.append(f'<rect x="{cx-w/2}" y="{cy-15}" width="{w}" height="30" rx="4" fill="#d6332a" stroke="#7a1410"/>')
    p.append(f'<text x="{cx}" y="{cy-2}" text-anchor="middle" {F} font-size="9" font-weight="900" fill="#fff">SOBRECARGA</text>')
    p.append(f'<text x="{cx}" y="{cy+10}" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#ffd9d6">DC OK apagado (hiccup)</text>')
    p.append('</g>')


def fake_lines(p, x, y, widths, color, gap=7, h=2.2):
    for i, w in enumerate(widths):
        p.append(f'<rect x="{x}" y="{y+i*gap}" width="{w}" height="{h}" rx="1" fill="{color}" opacity=".55"/>')


def cert_marks(p, x, y, color, n=3):
    p.append(f'<text x="{x}" y="{y+13}" {F} font-size="15" font-weight="900" fill="{color}">CE</text>')
    for i in range(n):
        p.append(f'<rect x="{x+34+i*22}" y="{y}" width="16" height="16" rx="3" fill="none" stroke="{color}" stroke-width="1.2" opacity=".8"/>')


# ================================================================== NDR-120-24
W, H = 160, 500
p = doc("Fuente Mean Well NDR-120-24 (24 V 5 A 120 W; entrada 100-240 VAC). 40 x 125,2 mm, vista frontal, escala 4 px/mm.", W, H)
p.append(f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="3" fill="url(#PFX-alu)" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<rect x="5" y="3" width="{W-10}" height="{H-6}" rx="2" fill="url(#PFX-blu)"/>')
green_block(p, [40, 60, 80, 100], 2, 42, ["-V1", "-V2", "+V1", "+V2"], True)
for x, t in zip([40, 60, 80, 100], ["-V", "-V", "+V", "+V"]):
    p.append(f'<text x="{x}" y="58" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#fff">{t}</text>')
p.append(f'<text x="150" y="72" text-anchor="end" {F} font-size="5.5" font-style="italic" fill="#d6e4f2">"Terminal torque 7 Lb-in"</text>')
logo_slot(p, 18, 92, 50, 30, False)
adj_led(p, 116, 104, 140, "#fff")
p.append(f'<text x="80" y="214" text-anchor="middle" {F} font-size="21" font-weight="800" fill="#fff">NDR-120-24</text>')
p.append(f'<text x="14" y="246" {F} font-size="9.5" font-weight="600" fill="#fff">INPUT: 100-240VAC</text><text x="146" y="246" text-anchor="end" {F} font-size="9.5" font-weight="600" fill="#fff">2.6A</text>')
p.append(f'<text x="146" y="257" text-anchor="end" {F} font-size="6.5" fill="#fff">50/60Hz</text>')
p.append(f'<text x="14" y="274" {F} font-size="9.5" font-weight="600" fill="#fff">OUTPUT:</text><text x="146" y="274" text-anchor="end" {F} font-size="9.5" font-weight="600" fill="#fff">24V ⎓ 5A</text>')
fake_lines(p, 14, 292, [120, 128, 124, 90], "#d6e4f2")
fake_lines(p, 14, 330, [100, 104, 92], "#d6e4f2")
cert_marks(p, 16, 366, "#fff")
p.append(f'<text x="14" y="410" {F} font-size="8" font-weight="700" fill="#fff">MADE IN CHINA</text>')
p.append(f'<text x="150" y="424" text-anchor="end" {F} font-size="5.5" font-style="italic" fill="#d6e4f2">"Terminal torque 5.5 Lb-in"</text>')
tripped(p, 80, 312)
for x, t in zip([60, 80, 100], ["⏚", "N", "L"]):
    p.append(f'<text x="{x}" y="448" text-anchor="middle" {F} font-size="10" font-weight="800" fill="#fff">{t}</text>')
green_block(p, [60, 80, 100], H - 44, H - 2, ["PE", "N", "L"], False)
open(os.path.join(OUT, "power-24vdc__ndr120.svg"), "w").write(finish(p, "ndr120"))

# =================================================================== HDR-60-24
W, H = 220, 360
p = doc("Fuente Mean Well HDR-60-24 (24 V 2,5 A 60 W; entrada 100-240 VAC). 52,5 x 90 mm, plastico negro escalonado. Vista frontal, escala 4 px/mm.", W, H)
p.append(f'<rect x="5" y="2" width="210" height="{H-4}" rx="4" fill="url(#PFX-blk)" stroke="#000" stroke-width="1.4"/>')
# hombros escalonados con ranuras de ventilacion
for y0, y1 in ((2, 74), (H - 74, H - 2)):
    p.append(f'<rect x="5" y="{y0}" width="210" height="{y1-y0}" rx="4" fill="#232528" stroke="#000"/>')
for y in range(10, 66, 9):
    p.append(f'<rect x="14" y="{y}" width="46" height="4" rx="2" fill="#0d0e0f"/><rect x="160" y="{y}" width="46" height="4" rx="2" fill="#0d0e0f"/>')
for y in range(H - 66, H - 10, 9):
    p.append(f'<rect x="14" y="{y}" width="56" height="4" rx="2" fill="#0d0e0f"/><rect x="150" y="{y}" width="56" height="4" rx="2" fill="#0d0e0f"/>')
hole_terms(p, [80, 100, 120, 140], 22, ["-V1", "-V2", "+V1", "+V2"])
for x in [80, 100, 120, 140]:
    p.append(f'<rect x="{x-5}" y="1" width="10" height="5" fill="#000"/>')
for x, t in zip([80, 100, 120, 140], ["-V", "-V", "+V", "+V"]):
    p.append(f'<text x="{x}" y="46" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e6e8eb">{t}</text>')
# frente (nariz) con la impresion
p.append(f'<rect x="12" y="78" width="196" height="204" rx="3" fill="#2a2c30" stroke="#000"/>')
logo_slot(p, 22, 90, 40, 22, False)
p.append(f'<text x="70" y="106" {F} font-size="15" font-weight="800" fill="#f2f3f5">HDR-60-24</text>')
adj_led(p, 180, 100, 136, "#e6e8eb")
p.append(f'<text x="22" y="132" {F} font-size="8" font-weight="700" fill="#e6e8eb">INPUT: 100-240VAC  1.8A 50/60Hz</text>')
p.append(f'<text x="22" y="146" {F} font-size="8" font-weight="700" fill="#e6e8eb">OUTPUT: +24V ⎓ 2.5A</text>')
fake_lines(p, 22, 160, [150, 140, 120], "#c3c8ce")
cert_marks(p, 24, 200, "#e6e8eb")
fake_lines(p, 24, 230, [120, 100], "#c3c8ce")
tripped(p, 110, 258)
hole_terms(p, [100, 120], H - 22, ["N", "L"])
for x in [100, 120]:
    p.append(f'<rect x="{x-5}" y="{H-6}" width="10" height="5" fill="#000"/>')
for x, t in zip([100, 120], ["N", "L"]):
    p.append(f'<text x="{x}" y="{H-38}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e6e8eb">{t}</text>')
open(os.path.join(OUT, "power-24vdc__hdr60.svg"), "w").write(finish(p, "hdr60"))

# =================================================================== MDR-60-24
W, H = 180, 360
p = doc("Fuente Mean Well MDR-60-24 (24 V 2,5 A 60 W; entrada 100-240 VAC). 40 x 90 mm, frente gris claro, laterales turquesa. Vista frontal, escala 4 px/mm.", W, H)
p.append(f'<rect x="6" y="2" width="168" height="{H-4}" rx="5" fill="#5bb8c9" stroke="{INK}" stroke-width="1.4"/>')  # laterales
p.append(f'<rect x="10" y="4" width="160" height="{H-8}" rx="4" fill="#eceee9" stroke="#9aa1aa"/>')
hole_terms(p, [40, 60, 80, 100, 120, 140], 22, ["+V1", "+V2", "-V1", "-V2", "DCOK1", "DCOK2"], 7.5)
for x in [40, 60, 80, 100, 120, 140]:
    p.append(f'<rect x="{x-5}" y="1" width="10" height="5" fill="#000"/>')
for x, t in zip([40, 60, 80, 100], ["+V", "+V", "-V", "-V"]):
    p.append(f'<text x="{x}" y="44" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}">{t}</text>')
p.append(f'<text x="130" y="44" text-anchor="middle" {F} font-size="7" font-weight="800" fill="{INK}">DC OK</text>')
p.append(f'<path d="M122 52 h5 l6 -4 M133 52 h5" stroke="{INK}" stroke-width="1" fill="none"/>')
p.append(f'<text x="24" y="70" {F} font-size="8" font-weight="700" fill="{INK}">24V/2.5A</text>')
adj_led(p, 44, 130, 86, INK)
cert_marks(p, 96, 80, "#3a3f46", 1)
fake_lines(p, 96, 104, [60, 54, 58], "#59606a")
logo_slot(p, 24, 157, 40, 22, True)
p.append(f'<text x="70" y="173" {F} font-size="12" font-weight="800" fill="{INK}">MDR-60-24</text>')
p.append(f'<text x="24" y="190" {F} font-size="8" font-weight="700" fill="{INK}">INPUT: 100-240VAC 1.8A</text>')
p.append(f'<text x="156" y="201" text-anchor="end" {F} font-size="6.5" fill="{INK}">50/60Hz</text>')
fake_lines(p, 24, 212, [130, 124, 132, 110, 90], "#59606a")
p.append(f'<text x="24" y="268" {F} font-size="7" font-weight="700" fill="{INK}">MADE IN CHINA</text>')
tripped(p, 90, 290, 130)
for x, t in zip([60, 80, 100], ["⏚", "N", "L"]):
    p.append(f'<text x="{x}" y="{H-36}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="{INK}">{t}</text>')
hole_terms(p, [60, 80, 100], H - 20, ["PE", "N", "L"], 7.5)
for x in [60, 80, 100]:
    p.append(f'<rect x="{x-5}" y="{H-6}" width="10" height="5" fill="#000"/>')
open(os.path.join(OUT, "power-24vdc__mdr60.svg"), "w").write(finish(p, "mdr60"))
print("ok")
