"""Genera piloto XB2, piloto AD16, zumbador AD16 y selectores XB2 de 2 y 3 posiciones."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import *

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def save(name, text):
    open(os.path.join(OUT, name), "w").write(text)


# ------------------------------------------------ Piloto XB2 (lamp.svg)
p = header("Lampara piloto 22 mm LED, metalica (tipo Schneider XB2-BV / CHINT NP2-BV). Vista frontal girada 90 grados. Escala 4 px/mm.", XW, XH)
p += xb2_blocks([("X1", "X2", "LED", "#59606a")])
p += xb2_base(top_text="24VDC", top_data_text="param.rating")
p += halo(XC, XY, 62)
p += xb2_bezel()
p += lens(XC, XY, 55)
save("lamp.svg", finish(p, "lamp"))

# ------------------------------------------------ Piloto AD16-22DS (lamp-ad16.svg)
p = header("Lampara piloto 22 mm LED monobloque (tipo AD16-22DS). Frente de 29 mm, bornes de tornillo atras. Escala 4 px/mm.", AW, AH)
p += ad16_back("X1", "X2", "X1", "X2", INK, INK)
p.append(f'<text x="{AC+26}" y="15" {F} font-size="7" font-weight="700" fill="#59606a" data-text="param.rating">24VDC</text>')
# aro del mismo plastico que el lente
p.append(f'<circle cx="{AC}" cy="{AY+2}" r="58" fill="#000" opacity=".3"/>')
p.append(f'<circle data-fill="param.color" fill="#2fbf5a" cx="{AC}" cy="{AY}" r="58" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<circle data-show="!out.lit" cx="{AC}" cy="{AY}" r="58" fill="#000" opacity=".55"/>')
p.append(f'<circle data-show="out.lit" cx="{AC}" cy="{AY}" r="58" fill="#000" opacity=".2"/>')
p.append(f'<circle cx="{AC}" cy="{AY}" r="58" fill="url(#PFX-dome)"/>')
p.append(f'<circle cx="{AC}" cy="{AY}" r="50" fill="none" stroke="{INK}" stroke-width="1.2" opacity=".6"/>')
# lente abombado con textura de puntos (difusor)
p += lens(AC, AY, 49, rings=False)
dots = []
for i in range(-4, 5):
    for j in range(-4, 5):
        x, y = AC + i * 10 + (5 if j % 2 else 0), AY + j * 9
        if (x - AC) ** 2 + (y - AY) ** 2 < 44 ** 2:
            dots.append(f'<circle cx="{x}" cy="{y}" r="2.2" fill="#fff" opacity=".13"/>')
p.append("".join(dots))
p.append(f'<circle cx="{AC}" cy="{AY}" r="49" fill="url(#PFX-dome)"/>')
save("lamp-ad16.svg", finish(p, "lampad16"))

# ------------------------------------------------ Zumbador AD16-22SM (buzzer.svg)
BC = 80  # simbolo de 160 de ancho para que entren las ondas; el cuerpo mide 29 mm
p = header("Zumbador 22 mm 24 VDC monobloque (tipo AD16-22SM). Polarizado: + arriba, - abajo. Escala 4 px/mm. Ancho 160 para las ondas de sonido.", 160, AH)
p += ad16_back("+", "-", "+", "−", "#c0392b", INK, AC=BC)
p.append(f'<rect x="{BC-15}" y="3" width="30" height="3" fill="#c0392b"/>')  # marca roja del +
p.append(f'<text x="{BC+26}" y="15" {F} font-size="7" font-weight="700" fill="#59606a">24VDC</text>')
# ondas de sonido cuando suena (detras del frente)
p.append('<g data-show="out.sounding" fill="none" stroke="#f2a51a" stroke-width="3" stroke-linecap="round">')
for r, o in ((64, .9), (72, .55)):
    p.append(f'<path d="M{BC-r*.5:.1f} {AY-r*.87:.1f} A{r} {r} 0 0 0 {BC-r*.5:.1f} {AY+r*.87:.1f}" opacity="{o}"/>')
    p.append(f'<path d="M{BC+r*.5:.1f} {AY-r*.87:.1f} A{r} {r} 0 0 1 {BC+r*.5:.1f} {AY+r*.87:.1f}" opacity="{o}"/>')
p.append('</g>')
p.append(f'<circle cx="{BC}" cy="{AY+2}" r="58" fill="#000" opacity=".3"/>')
p.append(f'<circle cx="{BC}" cy="{AY}" r="58" fill="#2a2d31" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<circle cx="{BC}" cy="{AY}" r="58" fill="url(#PFX-dome)"/>')
p.append(f'<circle cx="{BC}" cy="{AY}" r="49" fill="#1d1f22" stroke="#0d0e10" stroke-width="1.2"/>')
# rejilla: agujeros en anillos
import math
holes = [f'<circle cx="{BC}" cy="{AY}" r="4" fill="#060607"/>']
for ring, n in ((14, 8), (26, 14), (38, 20)):
    for k in range(n):
        a = 2 * math.pi * k / n
        holes.append(f'<circle cx="{BC+ring*math.cos(a):.1f}" cy="{AY+ring*math.sin(a):.1f}" r="2.6" fill="#060607"/>')
p.append("".join(holes))
p.append(f'<circle data-show="out.sounding" cx="{BC}" cy="{AY}" r="49" fill="none" stroke="#f2a51a" stroke-width="2" opacity=".6"/>')
p.append(f'<path d="M{BC-41} {AY-16} A44 44 0 0 1 {BC-12} {AY-43}" fill="none" stroke="#fff" stroke-width="2" opacity=".2" stroke-linecap="round"/>')
save("buzzer.svg", finish(p, "buzzer"))


# ------------------------------------------------ Selectores XB2-BD (selector-2/3.svg)
def selector(name, blocks, rot, options, marks, comment):
    p = header(comment, XW, XH)
    p += xb2_blocks(blocks)
    p += xb2_base()
    # marcas de posicion en la base, fuera del aro
    for ang, txt in marks:
        a = math.radians(ang)
        tx, ty = XC + 70 * math.sin(a), XY - 70 * math.cos(a)
        p.append(f'<text x="{tx:.1f}" y="{ty+3:.1f}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#e6e8eb">{txt}</text>')
    p += xb2_bezel()
    p.append(f'<g data-action="position" data-kind="cycle" data-options="{options}">')
    p.append(f'<circle cx="{XC}" cy="{XY}" r="62" fill="#000" opacity="0"/>')
    p.append(f'<circle cx="{XC}" cy="{XY}" r="55" fill="url(#PFX-knob)" stroke="#000" stroke-width="1"/>')
    p.append(f'<circle cx="{XC}" cy="{XY}" r="55" fill="url(#PFX-dome)"/>')
    p.append(f'<g data-rotate="{rot}">')
    p.append(f'<rect x="{XC-15}" y="{XY-52}" width="30" height="104" rx="13" fill="#000" opacity=".35" transform="translate(2 3)"/>')
    p.append(f'<rect x="{XC-15}" y="{XY-52}" width="30" height="104" rx="13" fill="url(#PFX-knob)" stroke="#000" stroke-width="1.2"/>')
    p.append(f'<rect x="{XC-10}" y="{XY-48}" width="7" height="96" rx="3.5" fill="#fff" opacity=".12"/>')
    p.append(f'<rect x="{XC-2.5}" y="{XY-46}" width="5" height="24" rx="2.5" fill="#f2f3f5"/>')
    p.append('</g></g>')
    save(name, finish(p, name.split(".")[0].replace("-", "")))


selector("selector-2.svg", [("13", "14", "NO", "#2c8a4a"), ("21", "22", "NC", "#c0392b")],
         f"out.position:0:1:-45:45:{XC}:{XY}", "0,1", [(-45, "0"), (45, "I")],
         "Selector 2 posiciones 0-I, metalico (tipo Schneider XB2-BD21 / CHINT NP2-BD21). 13-14 cierra en I, 21-22 cierra en 0. Escala 4 px/mm.")
selector("selector-3.svg", [("13", "14", "NO", "#2c8a4a"), ("23", "24", "NO", "#2c8a4a")],
         f"out.position:-1:1:-45:45:{XC}:{XY}", "-1,0,1", [(-45, "I"), (0, "0"), (45, "II")],
         "Selector 3 posiciones I-0-II, metalico (tipo Schneider XB2-BD33 / CHINT NP2-BD33). 13-14 cierra en I, 23-24 en II. Escala 4 px/mm.")
print("ok")
