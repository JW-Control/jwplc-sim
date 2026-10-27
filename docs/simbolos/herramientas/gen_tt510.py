"""Transmisor de temperatura PIDMaxWell TT-510 (RS-485 Modbus RTU, cabezal Form B),
vista superior a 4 px/mm.

Medidas de la ficha (Dimension): Ø44 mm, alto 21 mm, agujero central Ø7,2 y
dos tornillos de montaje M4. Bornes según el diagrama de cableado (Wiring
diagram, RTD): B y A a la izquierda, -24V y +24V arriba a la derecha y los tres
de la RTD abajo (el blanco solo a un lado y los dos rojos juntos al otro).
Colores de la foto: cuerpo celeste PA66, disco central blanco, tornillos
niquelados.

En la escena (cx múltiplo de 20, viewBox 260 x 200, centro en 100,100):
  arriba: B (40) A (80) - (120) + (160)
  abajo:  R3 blanco (60) R1 rojo (100) R2 rojo (140)
La lectura de la sonda (out.temp) va en una etiqueta a la derecha del cuerpo.

Uso: gen_tt510.py <salida.svg>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, INK, F

OUT = sys.argv[1]
W, H = 260, 200             # a la derecha del cuerpo, la etiqueta con la lectura
CX = CY = 100
MM = 4
R_BODY = 22 * MM            # Ø44
R_PLATE = 11.5 * MM         # disco blanco con los rótulos

p = header("Transmisor de temperatura PIDMaxWell TT-510 (RS-485 Modbus RTU, cabezal Form B). Vista superior. Escala 4 px/mm (ficha TT-510).", W, H)
defs = p.index('</defs>')
p[defs:defs] = [
    '<radialGradient id="PFX-body" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#7cc8ef"/><stop offset=".7" stop-color="#36a6de"/><stop offset="1" stop-color="#1f7fb3"/></radialGradient>',
    '<radialGradient id="PFX-plate" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe3e7"/></radialGradient>',
    '<linearGradient id="PFX-pocket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b6e9c"/><stop offset="1" stop-color="#2b8fc4"/></linearGradient>',
]

# cuerpo celeste con su sombra
p.append(f'<circle cx="{CX + 2}" cy="{CY + 3}" r="{R_BODY}" fill="#000" opacity=".22"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_BODY}" fill="url(#PFX-body)" stroke="#145b82" stroke-width="1.6"/>')

# disco blanco central con el agujero Ø7,2 (paso de la sonda)
p.append(f'<circle cx="{CX}" cy="{CY}" r="{R_PLATE}" fill="url(#PFX-plate)" stroke="#9aa3ab" stroke-width="1"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="{3.6 * MM}" fill="#2a2d31" stroke="#6d757d" stroke-width="1"/>')

# bornes: (id, rótulo, ángulo desde arriba en sentido horario, x en la grilla)
TERMS = [("B", "B", -72, 40), ("A", "A", -22, 80), ("-", "−", 22, 120), ("+", "+", 72, 160),
         ("R3", "", 215, 60), ("R1", "", 180, 100), ("R2", "", 145, 140)]
RS = 16 * MM                # radio de los tornillos


def screw_at(x, y, ang):
    """Bolsillo radial del borne y el tornillo niquelado (cabeza Phillips)."""
    out = [f'<g transform="rotate({ang} {x:.1f} {y:.1f})">'
           f'<rect x="{x - 12:.1f}" y="{y - 14:.1f}" width="24" height="28" rx="4" fill="url(#PFX-pocket)" stroke="#145b82" stroke-width="1"/>'
           f'<rect x="{x - 8:.1f}" y="{y + 7:.1f}" width="16" height="6" rx="1" fill="#c9ced5" stroke="#6d757d" stroke-width=".6"/></g>']
    out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9.5" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1.1"/>')
    out.append(f'<path d="M{x - 5.5:.1f} {y:.1f}H{x + 5.5:.1f}M{x:.1f} {y - 5.5:.1f}V{y + 5.5:.1f}" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/>')
    return out


for t, lab, ang, gx in TERMS:
    a = math.radians(ang)
    y = CY - RS * math.cos(a)
    # el tornillo va en la columna de la grilla, sobre el anillo de bornes
    x = gx
    dy = math.sqrt(max(0.0, RS ** 2 - (x - CX) ** 2))
    y = CY - dy if abs(ang) < 90 else CY + dy
    p += screw_at(x, y, math.degrees(math.atan2(x - CX, -(y - CY))))
    p.append(jw_term(t, x, round(y)))

# tornillos de montaje M4 (izquierda abajo y derecha)
for ang in (-112, 108):
    a = math.radians(ang)
    x, y = CX + 18.5 * MM * math.sin(a), CY - 18.5 * MM * math.cos(a)
    p.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="9" ry="6.5" transform="rotate({ang + 90} {x:.1f} {y:.1f})" fill="#145b82" stroke="#0f4766" stroke-width="1"/>')
    p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2" fill="#0d2f44"/>')

# rótulos del disco: B A -24V+ y el símbolo de la RTD
p.append(f'<text x="{CX - 26}" y="{CY - 18}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#2b2f35" transform="rotate(-50 {CX - 26} {CY - 18})">B</text>')
p.append(f'<text x="{CX - 11}" y="{CY - 28}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#2b2f35" transform="rotate(-18 {CX - 11} {CY - 28})">A</text>')
p.append(f'<text x="{CX + 18}" y="{CY - 25}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#2b2f35" transform="rotate(28 {CX + 18} {CY - 25})">−24V+</text>')
p.append(f'<path d="M{CX - 20} {CY + 28} q8 -12 20 -10 q12 -2 20 10" fill="none" stroke="#2b2f35" stroke-width="1.2"/>')
p.append(f'<rect x="{CX - 6}" y="{CY + 15}" width="12" height="5" fill="none" stroke="#2b2f35" stroke-width="1.1"/>')
p.append(f'<text x="{CX - 14}" y="{CY + 34}" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#2b2f35">−</text>')
p.append(f'<text x="{CX + 14}" y="{CY + 34}" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#2b2f35">+</text>')
# etiqueta de la lectura (fuera del cuerpo, a la derecha)
TX = 198
p.append(f'<path d="M{CX + R_BODY - 2} {CY} H{TX}" stroke="#7d858d" stroke-width="1" stroke-dasharray="2 2"/>')
p.append(f'<rect x="{TX}" y="{CY - 22}" width="58" height="44" rx="4" fill="#0f2a3a" stroke="#36a6de" stroke-width="1.2"/>')
p.append(f'<text x="{TX + 29}" y="{CY - 9}" text-anchor="middle" {F} font-size="7.5" font-weight="900" fill="#cfe9f7">TT-510</text>')
p.append(f'<text x="{TX + 29}" y="{CY + 1}" text-anchor="middle" {F} font-size="6" font-weight="700" fill="#8fb4c8">PT100 · RS-485</text>')
p.append(f'<g data-show="out.sonda=ok"><text x="{TX + 29}" y="{CY + 15}" text-anchor="middle" {F} font-size="10" font-weight="900" fill="#8fe3ff" data-text="out.temp:d1:°C">25,0 °C</text></g>')
p.append(f'<g data-show="out.sonda=abierta"><text x="{TX + 29}" y="{CY + 15}" text-anchor="middle" {F} font-size="7.5" font-weight="900" fill="#ff9a3c">ABIERTA</text></g>')
p.append(f'<g data-show="out.sonda=corto"><text x="{TX + 29}" y="{CY + 15}" text-anchor="middle" {F} font-size="7.5" font-weight="900" fill="#ff9a3c">EN CORTO</text></g>')

open(OUT, "w").write(finish(p, "tt510"))
