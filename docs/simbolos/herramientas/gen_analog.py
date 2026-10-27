"""Señales analógicas de campo: potenciómetro de panel 22 mm y calibrador de lazo.

potentiometer.svg (160 x 240, 4 px/mm, familia XB2 de fam22): potenciómetro
lineal de 5 kΩ de 22 mm con aro cromado, escala 0 a 10 y perilla negra con
marca blanca (acción pos, se arrastra en vertical; gira de -135 a 135 grados).
Detrás, el bloque con los bornes 1 (40), 2 cursor (80) y 3 (120) arriba.

signal-source.svg (200 x 320, escala reducida fija de campo, 2 px/mm):
calibrador de lazo portátil en su funda amarilla: pantalla con la señal
(out.texto), rótulo del modo (param.modo), perilla de ajuste (acción valor) y
los bornes de seguridad + (rojo, 80) y - (negro, 120) abajo.

Uso: gen_analog.py <carpeta de salida>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, term, xb2_base, INK, F, XW, XH, XC, XY

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- potenciómetro
p = header("Potenciómetro de panel 22 mm, 5 kΩ lineal, perilla con escala 0-10 (tipo XB2/NP2). Vista frontal. Escala 4 px/mm.", XW, XH)
# bloque trasero con los tres bornes arriba (1, 2 cursor, 3)
p.append(f'<rect x="20" y="1" width="120" height="44" rx="3" fill="url(#PFX-blk)" stroke="{INK}" stroke-width="1.6"/>')
for t, x in (("1", 40), ("2", 80), ("3", 120)):
    p.append(term(x, 17, 9.0))
    p.append(jw_term(t, x, 17))
    p.append(f'<text x="{x+15}" y="21" {F} font-size="8" font-weight="800" fill="#e7eaed">{t}</text>')
p += xb2_base(top_text="", bottom_text="5 kΩ")
# aro cromado y frente negro con la escala 0 a 10
p.append(f'<circle cx="{XC}" cy="{XY+2}" r="62" fill="#000" opacity=".3"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="62" fill="url(#PFX-chr)" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="56.5" fill="#15171a"/>')
for k in range(11):
    a = math.radians(-135 + k * 27)
    r0, r1 = (44, 53) if k % 5 == 0 else (47, 53)
    p.append(f'<line x1="{XC + r0*math.sin(a):.1f}" y1="{XY - r0*math.cos(a):.1f}" x2="{XC + r1*math.sin(a):.1f}" y2="{XY - r1*math.cos(a):.1f}" stroke="#e7eaed" stroke-width="{2 if k % 5 == 0 else 1.2}"/>')
for k in (0, 5, 10):
    a = math.radians(-135 + k * 27)
    r = 37 if k != 5 else 36
    p.append(f'<text x="{XC + r*math.sin(a):.1f}" y="{XY - r*math.cos(a) + 3:.1f}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e7eaed">{k}</text>')
# perilla (se arrastra en vertical; arriba sube)
p.append('<g data-action="pos" data-kind="drag" data-drag="y:0:-1.2:0:100">')
p.append(f'<circle cx="{XC}" cy="{XY}" r="40" fill="#000" opacity="0"/>')
p.append(f'<g data-rotate="out.pos|param.posicion:0:100:-135:135:{XC}:{XY}">')
p.append(f'<circle cx="{XC}" cy="{XY+2}" r="30" fill="#000" opacity=".45"/>')
flutes = "".join(f'<line x1="{XC + 27*math.sin(math.radians(a)):.1f}" y1="{XY - 27*math.cos(math.radians(a)):.1f}" x2="{XC + 30*math.sin(math.radians(a)):.1f}" y2="{XY - 30*math.cos(math.radians(a)):.1f}" stroke="#000" stroke-width="2"/>' for a in range(0, 360, 20))
p.append(f'<circle cx="{XC}" cy="{XY}" r="30" fill="url(#PFX-knob)" stroke="{INK}" stroke-width="1.3"/>{flutes}')
p.append(f'<circle cx="{XC}" cy="{XY}" r="21" fill="#2b2f34" stroke="#0c0d0f" stroke-width="1"/>')
p.append(f'<rect x="{XC-2}" y="{XY-29}" width="4" height="15" rx="1.5" fill="#f4f5f7"/>')
p.append('</g></g>')
open(os.path.join(OUT, "potentiometer.svg"), "w").write(finish(p, "pot"))

# ---------------------------------------------------------------- calibrador de lazo
W, H = 200, 320
p = header("Calibrador de lazo portátil 4-20 mA / 0-10 V en su funda. Vista frontal. Escala reducida de campo (2 px/mm).", W, H)
defs = p.index('</defs>')
p[defs:defs] = [
    '<linearGradient id="PFX-hol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9a91a"/><stop offset=".15" stop-color="#f2c230"/><stop offset=".85" stop-color="#f0bf2b"/><stop offset="1" stop-color="#c99a14"/></linearGradient>',
    '<linearGradient id="PFX-lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6b8"/><stop offset="1" stop-color="#aebd9a"/></linearGradient>',
    '<radialGradient id="PFX-red" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff6b5e"/><stop offset="1" stop-color="#b3180c"/></radialGradient>',
    '<radialGradient id="PFX-bk" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#5a5f66"/><stop offset="1" stop-color="#121417"/></radialGradient>',
]
# funda amarilla y cuerpo gris oscuro
p.append(f'<rect x="12" y="6" width="176" height="306" rx="22" fill="#000" opacity=".22" transform="translate(2 3)"/>')
p.append(f'<rect x="12" y="6" width="176" height="306" rx="22" fill="url(#PFX-hol)" stroke="#7a5d08" stroke-width="1.6"/>')
p.append(f'<rect x="26" y="18" width="148" height="276" rx="12" fill="#3a3e44" stroke="#1d1f22" stroke-width="1.4"/>')
p.append(f'<text x="100" y="34" text-anchor="middle" {F} font-size="9" font-weight="900" fill="#f2c230">LOOP CALIBRATOR</text>')
# pantalla
p.append(f'<rect x="38" y="42" width="124" height="62" rx="5" fill="#1b1d20"/>')
p.append(f'<rect x="43" y="47" width="114" height="52" rx="3" fill="url(#PFX-lcd)"/>')
p.append(f'<text x="50" y="59" {F} font-size="8" font-weight="800" fill="#2c3324">SOURCE</text>')
p.append(f'<text x="150" y="59" text-anchor="end" {F} font-size="8" font-weight="800" fill="#2c3324" data-text="param.modo">4-20 mA</text>')
p.append(f'<text x="150" y="90" text-anchor="end" font-family="monospace" font-size="21" font-weight="700" fill="#1d2418" data-text="out.texto">12.00 mA</text>')
# teclas decorativas
for i, lab in enumerate(("mA", "V", "%")):
    x = 48 + i * 36
    p.append(f'<rect x="{x}" y="114" width="30" height="16" rx="4" fill="#5b6068" stroke="#24272b"/><text x="{x+15}" y="125.5" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e7eaed">{lab}</text>')
# perilla de ajuste (se arrastra en vertical; arriba sube)
KX, KY = 100, 186
for k in range(11):
    a = math.radians(-135 + k * 27)
    p.append(f'<line x1="{KX + 38*math.sin(a):.1f}" y1="{KY - 38*math.cos(a):.1f}" x2="{KX + 44*math.sin(a):.1f}" y2="{KY - 44*math.cos(a):.1f}" stroke="#c9cdd2" stroke-width="{1.8 if k % 5 == 0 else 1}"/>')
p.append(f'<text x="{KX-34}" y="{KY+42}" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#c9cdd2">0 %</text>')
p.append(f'<text x="{KX+34}" y="{KY+42}" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#c9cdd2">100 %</text>')
p.append('<g data-action="valor" data-kind="drag" data-drag="y:0:-1.2:0:100">')
p.append(f'<circle cx="{KX}" cy="{KY}" r="36" fill="#000" opacity="0"/>')
p.append(f'<g data-rotate="out.valor|param.valor:0:100:-135:135:{KX}:{KY}">')
p.append(f'<circle cx="{KX}" cy="{KY+2}" r="30" fill="#000" opacity=".4"/>')
p.append(f'<circle cx="{KX}" cy="{KY}" r="30" fill="url(#PFX-knob)" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<circle cx="{KX}" cy="{KY}" r="20" fill="#2b2f34"/>')
p.append(f'<rect x="{KX-2}" y="{KY-28}" width="4" height="13" rx="1.5" fill="#f2c230"/>')
p.append('</g></g>')
# bornes de seguridad + (rojo) y - (negro)
for t, lab, x, g in (("+", "+", 80, "red"), ("-", "COM", 120, "bk")):
    p.append(f'<circle cx="{x}" cy="280" r="13" fill="#1b1d20"/><circle cx="{x}" cy="280" r="10.5" fill="url(#PFX-{g})" stroke="{INK}"/><circle cx="{x}" cy="280" r="4" fill="#0b0c0d"/>')
    p.append(f'<text x="{x}" y="262" text-anchor="middle" {F} font-size="8" font-weight="900" fill="#e7eaed">{lab}</text>')
    p.append(jw_term(t, x, 280))
p.append(f'<text x="100" y="306" text-anchor="middle" {F} font-size="7" font-weight="900" fill="#5a4504">OUT</text>')
open(os.path.join(OUT, "signal-source.svg"), "w").write(finish(p, "cal"))
