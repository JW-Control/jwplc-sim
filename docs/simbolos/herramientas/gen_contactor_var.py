"""Contactor trifasico v1 (JWPLC Sim), forma tipo LC1D / CJX2-0910 (9-12 A),
vista frontal como en las fotos de referencia:
  arriba (carcasa blanca): 1/L1 3/L2 5/L3 13NO, bobina A1 en la esquina superior izquierda
  centro (cuerpo oscuro): ventanas de color, portacontactos movil al centro, portaetiqueta
  abajo (carcasa blanca): 2/T1 4/T2 6/T3 14NO, bobina A2 en la esquina inferior derecha
Cuerpo 45 x 76 mm a 4 px/mm = 180 x 304 dentro de un viewBox 200 x 320.
Bornes en x = 40, 80, 120, 160 (paso 10 mm); A1 en x=20, A2 en x=180.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, term, jw_term, INK, F

OUT = sys.argv[1]
VAR = sys.argv[2]
W, H = 200, 320
BX0, BX1, BY0, BY1 = 10, 190, 8, 312
XS = [40, 80, 120, 160]
TOP = ["1", "3", "5", "13"]
TOPL = ["1/L1", "3/L2", "5/L3", "13 NO"]
BOT = ["2", "4", "6", "14"]
BOTL = ["2/T1", "4/T2", "6/T3", "14 NO"]
YT, YB = 66, 254

p = header("Contactor 3 polos 9 A + 1NO (forma tipo LC1D09 / CJX2-0910). Vista frontal. Escala 4 px/mm.", W, H)
p.insert(-1, '<linearGradient id="PFX-wht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8f9"/><stop offset="1" stop-color="#dfe2e6"/></linearGradient>')
p.insert(-1, '<linearGradient id="PFX-drk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#26292d"/><stop offset=".5" stop-color="#34383d"/><stop offset="1" stop-color="#222427"/></linearGradient>')
p.insert(-1, '<radialGradient id="PFX-soot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#140b06" stop-opacity=".9"/><stop offset=".45" stop-color="#2e1c10" stop-opacity=".6"/><stop offset=".8" stop-color="#5a3a1e" stop-opacity=".25"/><stop offset="1" stop-color="#5a3a1e" stop-opacity="0"/></radialGradient>')
p.insert(-1, '<linearGradient id="PFX-win" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a7be0"/><stop offset="1" stop-color="#1d4fa6"/></linearGradient>')

# sombra y cuerpo
p.append(f'<rect x="{BX0+2}" y="{BY0+3}" width="{BX1-BX0}" height="{BY1-BY0}" rx="5" fill="#000" opacity=".25"/>')
p.append(f'<rect x="{BX0}" y="{BY0}" width="{BX1-BX0}" height="{BY1-BY0}" rx="5" fill="url(#PFX-wht)" stroke="{INK}" stroke-width="1.6"/>')
# cresta superior e inferior: dientes negros entre bornes con la boca de cada borne
for y0, y1 in ((BY0, BY0 + 14), (BY1 - 14, BY1)):
    p.append(f'<rect x="{BX0+1}" y="{y0}" width="{BX1-BX0-2}" height="{y1-y0}" fill="#2a2d31"/>')
    for x in XS:
        p.append(f'<rect x="{x-11}" y="{y0}" width="22" height="{y1-y0}" fill="#121315"/>')
    for x in (60, 100, 140):
        p.append(f'<rect x="{x-3}" y="{y0}" width="6" height="{y1-y0}" fill="#3d4146"/>')
# bocas en el borde (donde llega el cable)
for x in XS:
    p.append(f'<rect x="{x-6}" y="{BY0-2}" width="12" height="4" fill="#000"/><rect x="{x-6}" y="{BY1-2}" width="12" height="4" fill="#000"/>')

# cuerpo oscuro central
p.append(f'<rect x="{BX0}" y="94" width="{BX1-BX0}" height="134" fill="url(#PFX-drk)" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<text x="{BX0+12}" y="112" {F} font-size="10" font-weight="800" fill="#e9ebee" letter-spacing=".5">CJX2-0910</text>')
p.append(f'<text x="{BX1-12}" y="112" text-anchor="end" {F} font-size="9" font-weight="700" fill="#aeb4bb">9 A</text>')
# ventanas laterales fijas
for x0 in (() if VAR == "p3" else (BX0 + 10, BX1 - 46)):
    p.append(f'<rect x="{x0-2}" y="122" width="40" height="44" rx="2" fill="#15171a"/>')
    p.append(f'<rect x="{x0}" y="124" width="36" height="40" rx="2" fill="url(#PFX-win)" stroke="#0e1f40"/>')
    p.append(f'<rect x="{x0+3}" y="127" width="8" height="34" fill="#fff" opacity=".18"/>')
if VAR != 'p3': p.append(f'<rect x="{BX0+16}" y="174" width="18" height="16" fill="#1a1c1f"/><rect x="{BX1-34}" y="174" width="18" height="16" fill="#1a1c1f"/>')

# ---- Zona central segun la propuesta de estado (VAR) ----
# Region libre: x 60..140, y 114..184 (P3 usa todo el ancho, y 118..178)
import math

p.insert(p.index('</defs>'), '<radialGradient id="PFX-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="#7dff9a" stop-opacity=".8"/><stop offset="1" stop-color="#2fbf5a" stop-opacity="0"/></radialGradient>')
p.insert(p.index('</defs>'), '<radialGradient id="PFX-hot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>')


def carrier_static(sunk=0):
    x0, y0 = BX0 + 52, 116 + sunk
    g = [f'<rect x="{BX0+50}" y="114" width="80" height="70" rx="2" fill="#0b0c0d"/>']
    if not sunk:
        g.append(f'<rect x="{x0}" y="{y0+52}" width="76" height="10" fill="#000" opacity=".6"/>')
    g += [f'<rect x="{x0}" y="{y0}" width="76" height="52" rx="2" fill="#15171a" stroke="#000"/>',
          f'<rect x="{x0+3}" y="{y0+3}" width="33" height="46" rx="2" fill="url(#PFX-win)" stroke="#0e1f40"/>',
          f'<rect x="{x0+40}" y="{y0+3}" width="33" height="46" rx="2" fill="url(#PFX-win)" stroke="#0e1f40"/>',
          f'<rect x="{x0+6}" y="{y0+6}" width="7" height="40" fill="#fff" opacity=".18"/>']
    if sunk:
        g.append(f'<rect x="{x0}" y="{y0}" width="76" height="52" fill="#000" opacity=".3"/>')
    return g


if VAR == "p1":
    # LED de senalizacion verde en el portacontactos (como un modulo de senalizacion)
    p += carrier_static()
    p.append(f'<circle cx="100" cy="142" r="13" fill="#0d0e10" stroke="#000"/>')
    p.append(f'<circle cx="100" cy="142" r="9" fill="#24402c" stroke="#111"/>')
    p.append('<g data-show="out.energized">')
    p.append(f'<circle cx="100" cy="142" r="30" fill="url(#PFX-glow)"/>')
    p.append(f'<circle cx="100" cy="142" r="9" fill="#5dff7e" stroke="#0f5a25"/>')
    p.append(f'<circle cx="97" cy="139" r="3" fill="#fff" opacity=".85"/>')
    p.append('</g>')
    p.append(f'<text x="100" y="178" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#8d939b" data-show="!out.energized">OFF</text>')
    p.append(f'<text x="100" y="178" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#5dff7e" data-show="out.energized">ON</text>')

elif VAR == "p2":
    # Electroiman a la vista: nucleo fijo, bobina de cobre y armadura movil
    p.append(f'<rect x="{BX0+50}" y="114" width="80" height="70" rx="3" fill="#0b0c0d" stroke="#000"/>')
    p.append(f'<rect x="{BX0+53}" y="117" width="74" height="64" rx="2" fill="#1b2430"/>')
    # nucleo en E (fijo, abajo)
    core = f'M66 176 V148 H76 V160 H94 V148 H106 V160 H124 V148 H134 V176 Z'
    p.append(f'<path d="{core}" fill="#8e979f" stroke="#2b2f34" stroke-width="1"/>')
    p.append(''.join(f'<line x1="66" y1="{y}" x2="134" y2="{y}" stroke="#6b737b" stroke-width=".8"/>' for y in (165, 170)))
    # bobina (cobre), fria o caliente
    def coil(col):
        return ''.join(f'<rect x="{x}" y="150" width="14" height="10" rx="2" fill="{col}" stroke="#4a2a10" stroke-width=".8"/>' for x in (80, 106)) + \
               ''.join(f'<line x1="{x}" y1="150" x2="{x}" y2="160" stroke="#4a2a10" stroke-width=".6"/>' for x in (83, 86, 89, 92, 109, 112, 115, 118))
    p.append(f'<g data-show="!out.energized">{coil("#a86f3a")}</g>')
    p.append('<g data-show="out.energized">')
    p.append(f'<ellipse cx="100" cy="155" rx="40" ry="20" fill="url(#PFX-hot)"/>')
    p.append(coil("#ff9a3c"))
    # lineas de campo
    p.append(''.join(f'<path d="M{100-r} 146 A{r} {r*0.55:.1f} 0 0 1 {100+r} 146" fill="none" stroke="#6fd3ff" stroke-width="1.4" opacity="{o}" stroke-dasharray="3 2"/>' for r, o in ((20, .9), (30, .6))))
    p.append('</g>')
    # armadura (movil, arriba): abierta en reposo, pegada al nucleo al energizar
    def arm(y):
        return f'<path d="M66 {y-14} H134 V{y} H124 V{y-4} H106 V{y} H94 V{y-4} H76 V{y} H66 Z" fill="#a7afb7" stroke="#2b2f34" stroke-width="1"/>'
    p.append(f'<g data-show="!out.energized">{arm(138)}<text x="100" y="144" text-anchor="middle" {F} font-size="6" fill="#ffcf5a">entrehierro</text></g>')
    p.append(f'<g data-show="out.energized">{arm(148)}</g>')

elif VAR == "p3":
    # Contactos a la vista: una ventana por columna (1/L1, 3/L2, 5/L3, 13NO)
    for c in XS:
        p.append(f'<rect x="{c-17}" y="118" width="34" height="62" rx="2" fill="#0b0c0d"/>')
        p.append(f'<rect x="{c-15}" y="120" width="30" height="58" rx="2" fill="#1b2430"/>')
        # conductores que vienen del borne de arriba y van al de abajo
        p.append(f'<path d="M{c-9} 120 V160 M{c+9} 178 V160" stroke="#c7a15a" stroke-width="3"/>')
        p.append(f'<rect x="{c-13}" y="158" width="8" height="4" fill="#d9dde2"/><rect x="{c+5}" y="158" width="8" height="4" fill="#d9dde2"/>')
        p.append(f'<g data-show="!out.energized"><rect x="{c-14}" y="140" width="28" height="5" rx="1" fill="#d9dde2" stroke="#555"/><rect x="{c-2}" y="128" width="4" height="12" fill="#3a7be0"/></g>')
        p.append(f'<g data-show="out.energized"><rect x="{c-14}" y="153" width="28" height="5" rx="1" fill="#f4f6f8" stroke="#555"/><rect x="{c-2}" y="128" width="4" height="25" fill="#3a7be0"/>'
                 f'<circle cx="{c-9}" cy="158" r="3" fill="#ffe27a"/><circle cx="{c+9}" cy="158" r="3" fill="#ffe27a"/>'
                 f'<path d="M{c-9} 120 V158 H{c+9} V178" fill="none" stroke="#ffd23a" stroke-width="1.6" opacity=".9"/></g>')

elif VAR == "p4":
    # Indicador mecanico de posicion I/O (convencion de fabricante: O verde, I rojo).
    # Energizado: el portacontactos se hunde -> mas oscuro y mas chico (se aleja).
    def carrier_body(win_dark):
        x0, y0 = BX0 + 52, 116
        g = [f'<rect x="{x0}" y="{y0}" width="76" height="52" rx="2" fill="#15171a" stroke="#000"/>',
             f'<rect x="{x0+3}" y="{y0+3}" width="33" height="46" rx="2" fill="url(#PFX-win)" stroke="#0e1f40"/>',
             f'<rect x="{x0+40}" y="{y0+3}" width="33" height="46" rx="2" fill="url(#PFX-win)" stroke="#0e1f40"/>',
             f'<rect x="{x0+6}" y="{y0+6}" width="7" height="40" fill="#fff" opacity=".18"/>']
        if win_dark:
            g.append(f'<rect x="{x0}" y="{y0}" width="76" height="52" rx="2" fill="#000" opacity="{win_dark}"/>')
        return g

    def indicator(col, txt):
        return [f'<rect x="84" y="124" width="32" height="34" rx="2" fill="#111" stroke="#000"/>',
                f'<rect x="86" y="126" width="28" height="30" rx="1" fill="{col}"/>',
                f'<text x="100" y="149" text-anchor="middle" {F} font-size="20" font-weight="900" fill="#fff">{txt}</text>']

    p.append(f'<rect x="{BX0+50}" y="114" width="80" height="70" rx="2" fill="#0b0c0d"/>')  # cavidad
    p.append('<g data-show="!out.energized">')
    p.append(f'<rect x="{BX0+52}" y="168" width="76" height="10" fill="#000" opacity=".6"/>')  # sombra: sobresale
    p += carrier_body(0)
    p.append(f'<path d="M{BX0+53} 117 H{BX0+127}" stroke="#fff" stroke-width="1.5" opacity=".35"/>')
    p += indicator("#2e9e4f", "O")
    p.append(f'<text x="100" y="178" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#8d939b">OFF</text>')
    p.append('</g>')
    p.append('<g data-show="out.energized">')
    p.append(f'<rect x="{BX0+53}" y="117" width="74" height="64" rx="1" fill="none" stroke="#000" stroke-width="6" opacity=".7"/>')
    p.append('<g transform="translate(100 142) scale(.84) translate(-100 -142)">')
    p += carrier_body(.42)
    p += indicator("#d6332a", "I")
    p.append('</g>')
    p.append(f'<text x="100" y="180" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#ff8a80">ON</text>')
    p.append('</g>')
elif VAR == "p4b":
    # Indicador mecanico de posicion I/O en el portacontactos
    p.append('<g data-show="!out.energized">'); p += carrier_static(0)
    p.append(f'<rect x="84" y="124" width="32" height="34" rx="2" fill="#111" stroke="#000"/>')
    p.append(f'<rect x="86" y="126" width="28" height="30" rx="1" fill="#d6332a"/>')
    p.append(f'<text x="100" y="149" text-anchor="middle" {F} font-size="20" font-weight="900" fill="#fff">O</text>')
    p.append(f'<text x="100" y="178" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#8d939b">OFF</text>')
    p.append('</g>')
    p.append('<g data-show="out.energized">'); p += carrier_static(4)
    p.append(f'<rect x="84" y="128" width="32" height="34" rx="2" fill="#111" stroke="#000"/>')
    p.append(f'<rect x="86" y="130" width="28" height="30" rx="1" fill="#2e9e4f"/>')
    p.append(f'<text x="100" y="153" text-anchor="middle" {F} font-size="20" font-weight="900" fill="#fff">I</text>')
    p.append(f'<text x="100" y="180" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#7dff9a">ON</text>')
    p.append('</g>')

# portaetiqueta blanco con la tension de bobina
p.append(f'<rect x="{BX0+46}" y="188" width="88" height="32" rx="2" fill="#f2f3f5" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<text x="100" y="201" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#59606a">BOBINA</text>')
p.append(f'<text x="100" y="215" text-anchor="middle" {F} font-size="11" font-weight="800" fill="{INK}" data-text="param.coil">24VDC</text>')

# bornes de potencia y auxiliar, en sus alveolos
for x, t, lab in zip(XS, TOP, TOPL):
    p.append(f'<rect x="{x-17}" y="{YT-17}" width="34" height="34" rx="3" fill="#c9ced4" stroke="#8a929c"/>')
    p.append(term(x, YT, 11.0))
    p.append(jw_term(t, x, YT))
    p.append(f'<text x="{x}" y="{YT-21}" text-anchor="middle" {F} font-size="8.5" font-weight="700" fill="{INK}">{lab}</text>')
for x, t, lab in zip(XS, BOT, BOTL):
    p.append(f'<rect x="{x-17}" y="{YB-17}" width="34" height="34" rx="3" fill="#c9ced4" stroke="#8a929c"/>')
    p.append(term(x, YB, 11.0))
    p.append(jw_term(t, x, YB))
    p.append(f'<text x="{x}" y="{YB+28}" text-anchor="middle" {F} font-size="8.5" font-weight="700" fill="{INK}">{lab}</text>')

# bobina quemada: hollin y recalentamiento en el cuerpo, carcasas amarillentas
p.append('<g data-show="damaged">')
p.append(f'<rect x="{BX0}" y="{BY0}" width="{BX1-BX0}" height="{BY1-BY0}" rx="5" fill="#9a6a2e" opacity=".28"/>')
p.append(f'<ellipse cx="100" cy="176" rx="104" ry="118" fill="url(#PFX-soot)"/>')
p.append(f'<path d="M58 222 q3 6 0 10 M120 224 q-2 5 1 8" stroke="#1a0f08" stroke-width="4" stroke-linecap="round" fill="none" opacity=".7"/>')
p.append(f'<rect x="{BX0+46}" y="188" width="88" height="32" rx="2" fill="#2a1d14" stroke="#000"/>')
p.append(f'<text x="100" y="208" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#ffb199">BOBINA QUEMADA</text>')
p.append('</g>')

# bobina: A1 arriba a la izquierda, A2 abajo a la derecha (pestanas en las esquinas)
for x, cy, name, ty in ((20, 14, "A1", 34), (180, 306, "A2", 292)):
    p.append(f'<rect x="{x-13}" y="{cy-13}" width="26" height="26" rx="3" fill="#2a2d31" stroke="{INK}" stroke-width="1.2"/>')
    p.append(term(x, cy, 8.0))
    p.append(jw_term(name, x, cy))
p.append(f'<text x="38" y="30" {F} font-size="9" font-weight="800" fill="{INK}">A1</text>')
p.append(f'<text x="162" y="309" text-anchor="end" {F} font-size="9" font-weight="800" fill="#f2f3f5">A2</text>')

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, f"contactor-{VAR}.svg"), "w").write(finish(p, "contactor"))
print("ok")
