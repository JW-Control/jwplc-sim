"""Catalogo, tanda 1 (propuesta del 10/11/2026, por aprobar): mandos de la
familia XB2 de 22 mm, con las piezas comunes de fam22.py (base de zamak,
aro cromado, bloques traseros con bornes).

  emergency-stop.svg   parada de emergencia tipo hongo Ø40 de enclavamiento
                       (tipo Schneider XB2-BS542 / CHINT NP2-BS542), girar
                       para soltar; bloques 11-12 NC y 23-24 NA.
  pushbutton-lit.svg   pulsador luminoso con LED (tipo XB2-BW33 / NP2-BW3361):
                       bloque 13-14 NA y bloque LED X1-X2.
  selector-key.svg     selector de llave 0-I (tipo XB2-BG21 / NP2-BG21),
                       13-14 NA y 21-22 NC.

Sin fotos propias todavia: medidas y aspecto de los catalogos del fabricante.
Escala 4 px/mm. Uso: python3 gen_mando_tanda1.py <carpeta>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import F, INK, XC, XH, XW, XY, finish, halo, header, lens, xb2_base, xb2_bezel, xb2_blocks  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def save(name, text):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(text)


# ------------------------------------------------ Parada de emergencia (emergency-stop.svg)
p = header("Parada de emergencia 22 mm, hongo rojo Ø40 de enclavamiento, girar para soltar (tipo Schneider XB2-BS542 / CHINT NP2-BS542). Vista frontal girada 90 grados. Escala 4 px/mm. Propuesta por aprobar.", XW, XH)
p.insert(-1, '<radialGradient id="PFX-mush" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ff6b5e"/><stop offset=".55" stop-color="#d62a1e"/><stop offset="1" stop-color="#8e140c"/></radialGradient>')
p.insert(-1, '<radialGradient id="PFX-mushd" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#b9241a"/><stop offset=".8" stop-color="#8a1810"/><stop offset="1" stop-color="#4a0a06"/></radialGradient>')
p += xb2_blocks([("11", "12", "NC", "#c0392b"), ("23", "24", "NO", "#2c8a4a")])
p += xb2_base()
p += xb2_bezel()
p.append('<g data-action="press" data-kind="toggle">')
p.append(f'<circle cx="{XC}" cy="{XY}" r="78" fill="#000" opacity="0"/>')
# Desenclavado: el hongo sobresale y deja ver el anillo verde del vastago.
p.append('<g data-show="!out.pressed">')
p.append(f'<circle cx="{XC + 3}" cy="{XY + 5}" r="76" fill="#000" opacity=".35"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="76" fill="none" stroke="#2fbf5a" stroke-width="5"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="72" fill="url(#PFX-mush)" stroke="#5a0c06" stroke-width="1.4"/>')
p.append(f'<path d="M{XC - 56} {XY - 28} A62 62 0 0 1 {XC - 18} {XY - 60}" fill="none" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/>')
p.append('</g>')
# Enclavado: hundido, mas chico y oscuro, sin el anillo verde.
p.append('<g data-show="out.pressed">')
p.append(f'<circle cx="{XC}" cy="{XY}" r="70" fill="#000" opacity=".45"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="66" fill="url(#PFX-mushd)" stroke="#3a0804" stroke-width="1.4"/>')
p.append('</g>')
# Flechas de giro moldeadas en el hongo.
for a0 in (200, 20):
    a1 = a0 + 70
    r = 44
    x0, y0 = XC + r * math.cos(math.radians(a0)), XY + r * math.sin(math.radians(a0))
    x1, y1 = XC + r * math.cos(math.radians(a1)), XY + r * math.sin(math.radians(a1))
    tx, ty = -math.sin(math.radians(a1)), math.cos(math.radians(a1))
    p.append(f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 0 1 {x1:.1f} {y1:.1f}" fill="none" stroke="#ffd9d4" stroke-width="3.2" opacity=".85"/>')
    p.append(f'<path d="M{x1 + 7 * tx - 5 * ty:.1f} {y1 + 7 * ty + 5 * tx:.1f} L{x1:.1f} {y1:.1f} L{x1 + 7 * tx + 5 * ty:.1f} {y1 + 7 * ty - 5 * tx:.1f}" fill="none" stroke="#ffd9d4" stroke-width="3.2" opacity=".85" stroke-linejoin="round"/>')
p.append('</g>')
save("emergency-stop.svg", finish(p, "estop"))

# ------------------------------------------------ Pulsador luminoso (pushbutton-lit.svg)
p = header("Pulsador luminoso 22 mm con LED (tipo Schneider XB2-BW33 / CHINT NP2-BW3361): bloque 13-14 NA y bloque LED X1-X2. Vista frontal girada 90 grados. Escala 4 px/mm. Propuesta por aprobar.", XW, XH)
p.insert(-1, '<radialGradient id="PFX-sun" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>')
p += xb2_blocks([("13", "14", "NO", "#2c8a4a"), ("X1", "X2", "LED", "#59606a")])
p += xb2_base(top_text="24VDC", top_data_text="param.rating")
p += halo(XC, XY, 58)
p += xb2_bezel()
p.append('<g data-action="press" data-kind="momentary">')
p.append(f'<circle cx="{XC}" cy="{XY}" r="62" fill="#000" opacity="0"/>')
p.append('<g data-show="!out.pressed">')
p += lens(XC, XY, 54)
p.append('</g><g data-show="out.pressed">')
p += lens(XC, XY + 1, 51)
p.append(f'<circle cx="{XC}" cy="{XY + 1}" r="51" fill="url(#PFX-sun)"/>')
p.append('</g></g>')
save("pushbutton-lit.svg", finish(p, "pblit"))

# ------------------------------------------------ Selector de llave (selector-key.svg)
p = header("Selector de llave 2 posiciones 0-I (tipo Schneider XB2-BG21 / CHINT NP2-BG21): 13-14 cierra en I, 21-22 en 0; la llave se retira en 0. Vista frontal girada 90 grados. Escala 4 px/mm. Propuesta por aprobar.", XW, XH)
p += xb2_blocks([("13", "14", "NO", "#2c8a4a"), ("21", "22", "NC", "#c0392b")])
p += xb2_base()
for ang, txt in ((-45, "0"), (45, "I")):
    a = math.radians(ang)
    p.append(f'<text x="{XC + 70 * math.sin(a):.1f}" y="{XY - 70 * math.cos(a) + 3:.1f}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#e6e8eb">{txt}</text>')
p += xb2_bezel()
p.append('<g data-action="position" data-kind="cycle" data-options="0,1">')
p.append(f'<circle cx="{XC}" cy="{XY}" r="62" fill="#000" opacity="0"/>')
# Cerradura: cilindro cromado con el bombin y su ranura.
p.append(f'<circle cx="{XC}" cy="{XY}" r="54" fill="url(#PFX-chr)" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<circle cx="{XC}" cy="{XY}" r="40" fill="url(#PFX-zmk)" stroke="{INK}" stroke-width="1"/>')
p.append(f'<g data-rotate="out.position:0:1:-45:45:{XC}:{XY}">')
p.append(f'<rect x="{XC - 4}" y="{XY - 30}" width="8" height="60" rx="2" fill="#0d0e10"/>')
# Llave de laton: paleta dentro del bombin y cabeza (con su agujero) afuera.
p.append(f'<rect x="{XC - 3}" y="{XY - 28}" width="6" height="56" rx="1.5" fill="url(#PFX-brs)" stroke="#3a2c14" stroke-width=".8"/>')
p.append(f'<path d="M{XC - 22} {XY - 58} H{XC + 22} Q{XC + 26} {XY - 58} {XC + 26} {XY - 54} V{XY - 30} H{XC - 26} V{XY - 54} Q{XC - 26} {XY - 58} {XC - 22} {XY - 58} Z" fill="url(#PFX-brs)" stroke="#3a2c14" stroke-width="1.2"/>')
p.append(f'<circle cx="{XC}" cy="{XY - 46}" r="6" fill="#0d0e10" stroke="#3a2c14"/>')
p.append(f'<rect x="{XC - 22}" y="{XY - 56}" width="10" height="3" rx="1.5" fill="#fff" opacity=".35"/>')
p.append('</g></g>')
save("selector-key.svg", finish(p, "selkey"))
print("ok")
