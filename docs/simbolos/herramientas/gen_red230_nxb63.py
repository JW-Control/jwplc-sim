"""Red 230 VAC como interruptor termomagnetico 2P CHINT NXB-63 C16 (vista frontal).

Referencia: foto de frente del NXB-63 C16 2P entregada por JW Control
(26/10/2026). Proporciones medidas sobre la foto; alto real ~81 mm.

Escala 4 px/mm: alto 324 px. Cada polo mide 18 mm; aqui 20 mm (80 px) para
que los bornes queden en x = 40 y 120, sobre la grilla (lineamientos 2.3:
gana la alineacion de los bornes, 2 mm por polo). viewBox 160 x 340.

Arriba entra la red (1 y 3, cables marron y azul, no cableables); abajo
salen 2/L y 4/N. Estados (lineamientos 2.5), como el equipo: apagado o
disparado, manijas abajo e indicador de contactos verde; en servicio,
manijas arriba e indicador rojo.

Uso: python3 gen_red230_nxb63.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

W, H = 160, 340
Y0, Y1 = 8, 332          # cuerpo: 81 mm
CL, CN = 40, 120         # centro de cada polo = borne
P = "power-230vac"
BLUE = "#2e7fd6"
TXT = "#3a3f45"

p = header("Red 230 VAC: interruptor termomagnetico 2P CHINT NXB-63 C16, vista frontal segun foto de JW Control. Escala 4 px/mm.", W, H)
for d in (
    '<linearGradient id="PFX-wht" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6e8ea"/><stop offset=".1" stop-color="#fbfbfc"/><stop offset=".9" stop-color="#fbfbfc"/><stop offset="1" stop-color="#e2e5e8"/></linearGradient>',
    '<radialGradient id="PFX-boss" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#d9dde1"/><stop offset=".72" stop-color="#eef0f2"/><stop offset="1" stop-color="#ffffff"/></radialGradient>',
    '<linearGradient id="PFX-zinc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3ecf3"/><stop offset=".45" stop-color="#9fb2c2"/><stop offset=".7" stop-color="#cfdbe5"/><stop offset="1" stop-color="#7f93a4"/></linearGradient>',
    f'<linearGradient id="PFX-hdl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa0ea"/><stop offset="1" stop-color="{BLUE}"/></linearGradient>',
    '<linearGradient id="PFX-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f97e6"/><stop offset=".55" stop-color="#2f80d8"/><stop offset="1" stop-color="#2569b5"/></linearGradient>',
):
    p.insert(-1, d)


def screw(cx, cy):
    """Tornillo combinado (ranura + Pozidriv) galvanizado en su resalte redondo."""
    return (f'<circle cx="{cx}" cy="{cy}" r="17" fill="url(#PFX-boss)" stroke="#c4c9ce" stroke-width="1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="11.5" fill="url(#PFX-zinc)" stroke="#5f6f7d" stroke-width="1"/>'
            + "".join(f'<line x1="{cx}" y1="{cy}" x2="{cx + 10*c:.1f}" y2="{cy + 10*s:.1f}" stroke="#ffffff" stroke-width=".8" opacity=".55"/>'
                      for c, s in ((.92, .38), (.38, .92), (-.38, .92), (-.92, .38), (-.92, -.38), (-.38, -.92), (.38, -.92), (.92, -.38)))
            + f'<path d="M{cx-7} {cy}H{cx+7}M{cx} {cy-7}V{cy+7}" stroke="#46525d" stroke-width="3" stroke-linecap="round"/>'
            f'<rect x="{cx-2.5}" y="{cy-2.5}" width="5" height="5" fill="#5b6873"/>')


# Cuerpo: dos modulos blancos con la junta al medio.
p.append(f'<rect x="1" y="{Y0+2}" width="{W-2}" height="{Y1-Y0}" rx="5" fill="#000" opacity=".2"/>')
for x in (1, 81):
    p.append(f'<rect x="{x}" y="{Y0}" width="78" height="{Y1-Y0}" rx="5" fill="url(#PFX-wht)" stroke="#9aa1a8" stroke-width="1.2"/>')
p.append(f'<rect x="79" y="{Y0}" width="2" height="{Y1-Y0}" fill="#b9bfc5"/>')

# Bloques de bornes de arriba y de abajo: un escalon antes del frente.
for y in (67, 265):
    p.append(f'<line x1="3" y1="{y}" x2="{W-3}" y2="{y}" stroke="#c9ced3" stroke-width="1.6"/>')
    p.append(f'<line x1="3" y1="{y+2}" x2="{W-3}" y2="{y+2}" stroke="#ffffff" stroke-width="1"/>')

# Red de entrada (arriba): cable con terminal hasta el tornillo.
for cx, col in ((CL, "#7a4a22"), (CN, "#2f62d6")):
    p.append(screw(cx, 32))
    p.append(f'<rect x="{cx-4}" y="0" width="8" height="22" fill="{col}" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{cx-5}" y="16" width="10" height="10" rx="2" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')

# Franja azul: con el logo (hueco, sin archivo oficial) en el polo izquierdo.
p.append(f'<path d="M5 72 H68 L76 80 V94 H5 Z" fill="{BLUE}"/>')
p.append(f'<g id="{P}-logo"></g>')
p.append(f'<rect x="85" y="73" width="70" height="7" rx="1" fill="{BLUE}"/>')

# Textos impresos del polo izquierdo.
p.append(f'<text x="7" y="112" {F} font-size="12.5" fill="{TXT}">NXB-63</text>')
p.append(f'<circle cx="66" cy="108" r="5.5" fill="none" stroke="{TXT}" stroke-width=".9"/>')  # marca de certificacion (generica)
p.append(f'<text x="7" y="125" {F} font-size="12.5" fill="{TXT}">C16</text>')
p.append(f'<line x1="7" y1="128" x2="32" y2="128" stroke="{TXT}" stroke-width=".8"/>')
for i, t in enumerate(("400V~", "50Hz", "6000A")):
    p.append(f'<text x="7" y="{136 + 8*i}" {F} font-size="7" fill="{TXT}">{t}</text>')
p.append(f'<line x1="7" y1="154" x2="32" y2="154" stroke="{TXT}" stroke-width=".8"/>')
p.append(f'<text x="7" y="162" {F} font-size="7" fill="{TXT}">IEC60898-1</text>')
p.append(f'<text x="7" y="170" {F} font-size="7" fill="{TXT}">GB/T 10963.1</text>')
p.append(f'<text x="57" y="162" {F} font-size="7" fill="{TXT}">↕ I ON</text>')
p.append(f'<text x="57" y="170" {F} font-size="7" fill="{TXT}">  O OFF</text>')

# Polo derecho: esquema de los dos polos (1-2 y 3-4).
for k, (a, b) in enumerate((("1", "2"), ("3", "4"))):
    x = 112 + 14 * k
    p.append(f'<text x="{x-5}" y="146" {F} font-size="7" fill="{TXT}">{a}</text>')
    p.append(f'<text x="{x-5}" y="170" {F} font-size="7" fill="{TXT}">{b}</text>')
    p.append(f'<path d="M{x} 148 v4 l-3 3 m3 -3 m0 0 v2 q3 2 0 4 q-3 2 0 4 v3" fill="none" stroke="{TXT}" stroke-width=".9"/>')

# Indicador de posicion de contactos, uno por polo: verde abierto, rojo cerrado.
for cx in (CL + 6, CN + 6):
    p.append(f'<rect x="{cx-6}" y="124" width="12" height="8" rx="1.2" fill="#0e2a1c"/>')
    p.append(f'<rect data-show="!out.on" x="{cx-5}" y="125" width="10" height="6" fill="#1f7a4a"/>')
    p.append(f'<rect data-show="out.on" x="{cx-5}" y="125" width="10" height="6" fill="#d23a2c"/>')

# Zona de la palanca: guias blancas y manijas azules unidas por una barra.
p.append(f'<rect x="3" y="176" width="{W-6}" height="88" fill="#eef0f2"/>')
for cx in (CL, CN):
    p.append(f'<rect x="{cx-31}" y="177" width="11" height="86" rx="5" fill="#fbfbfc" stroke="#cfd4d9"/>')
    p.append(f'<rect x="{cx+20}" y="177" width="11" height="86" rx="5" fill="#fbfbfc" stroke="#cfd4d9"/>')


def handle(up):
    s = []
    if up:   # en servicio: la barra arriba, el cuerpo de las manijas baja hacia el frente
        for cx in (CL, CN):
            s.append(f'<rect x="{cx-19}" y="200" width="38" height="58" rx="2" fill="url(#PFX-hdl)" stroke="#1f5ea6" stroke-width="1"/>')
            s.append(f'<rect x="{cx-19}" y="252" width="38" height="6" fill="#1e4f8a" opacity=".55"/>')
        s.append(f'<rect x="3" y="177" width="{W-6}" height="36" rx="4" fill="url(#PFX-bar)" stroke="#1f5ea6" stroke-width="1.2"/>')
        s.append(f'<line x1="8" y1="184" x2="{W-8}" y2="184" stroke="#8cc0f2" stroke-width="1"/>')
        y_slot = 179
    else:    # apagada o disparada: como en la foto, la barra abajo
        for cx in (CL, CN):
            s.append(f'<rect x="{cx-19}" y="179" width="38" height="46" rx="2" fill="url(#PFX-hdl)" stroke="#1f5ea6" stroke-width="1"/>')
            s.append(f'<rect x="{cx-19}" y="179" width="38" height="5" fill="#1e4f8a" opacity=".45"/>')
        s.append(f'<rect x="3" y="222" width="{W-6}" height="40" rx="4" fill="url(#PFX-bar)" stroke="#1f5ea6" stroke-width="1.2"/>')
        s.append(f'<line x1="8" y1="229" x2="{W-8}" y2="229" stroke="#8cc0f2" stroke-width="1"/>')
        y_slot = 251
    for cx in (CL, CN):
        s.append(f'<rect x="{cx-6}" y="{y_slot}" width="12" height="5" rx="1" fill="#163f6e"/>')
    return s


p.append('<g data-show="out.on">')
p += handle(True)
p.append('</g><g data-show="!out.on">')
p += handle(False)
p.append('</g>')

# Salida (abajo): 2/L y 4/N con la boca del borne en el borde.
for cx, num, tag, col in ((CL, "2", "L", "#7a4a22"), (CN, "4", "N", "#2f62d6")):
    p.append(screw(cx, 305))
    p.append(f'<rect x="{cx-6}" y="{H-8}" width="12" height="8" fill="#16181b"/>')
    p.append(jw_term(tag, cx, 305))
    p.append(f'<text x="{cx-28}" y="301" text-anchor="middle" {F} font-size="9" font-weight="700" fill="{TXT}">{num}</text>')
    p.append(f'<text x="{cx-28}" y="313" text-anchor="middle" {F} font-size="9" font-weight="800" fill="{col}">{tag}</text>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
