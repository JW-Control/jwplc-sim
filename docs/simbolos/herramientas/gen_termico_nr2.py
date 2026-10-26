"""Relé térmico CHINT NR2-25 (JWPLC Sim), vista frontal a 4 px/mm.

Medidas de la ficha CHINT serie NR2 (P-115, «NR2-25 con MB-2»): ancho 45 mm,
alto 66 mm con los pines (pines unos 19 mm sobre el cuerpo de 47 mm).
Colores de la foto del catálogo: cuerpo blanco, panel gris claro, dial de
ajuste azul con la ranura en cruz, botón STOP rojo y RESET azul (A/H) sobre
una pastilla gris oscura, tornillos cobrizos.

Bornes (cx múltiplo de 20, viewBox de 200 de ancho como el contactor CJX2,
para que los pines 1/3/5 caigan bajo sus bornes 2/4/6 en x = 40, 80, 120):
  arriba: pines 1/L1 3/L2 5/L3 (x = 40, 80, 120)
  fila auxiliar: 98 97 (NO) y 96 95 (NC) en x = 20, 80, 120, 180
  abajo: 2/T1 4/T2 6/T3 en x = 40, 100, 160
Estados: dial según el ajuste (out.ajusteRel; la ventana muestra out.ajusteTxt), botón RESET en H o A
(param.rearme), banderín naranja de disparo en la ventana (out.tripped),
botón STOP hundido (out.stop) y aviso de falta de fase (out.faltaFase).

Uso: gen_termico_nr2.py <salida.svg>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, INK, F

OUT = sys.argv[1]
W, H = 200, 280
MM = 4
BX0, BX1 = 10, 190          # cuerpo de 45 mm
BY0 = 84                    # pines (19 mm en la ficha; 21 aquí para llegar al borde)
BY1 = BY0 + 47 * MM         # 272


def y(mm):
    return BY0 + mm * MM


def x(mm):
    return BX0 + mm * MM


p = header("Relé térmico CHINT NR2-25 (rango 2,5-4 A por defecto). Vista frontal. Escala 4 px/mm (ficha CHINT NR2, P-115).", W, H)
defs = p.index('</defs>')
p[defs:defs] = [
    '<linearGradient id="PFX-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset="1" stop-color="#e6e8eb"/></linearGradient>',
    '<linearGradient id="PFX-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e6e9"/><stop offset="1" stop-color="#d2d6da"/></linearGradient>',
    '<radialGradient id="PFX-dial" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#4f8fdc"/><stop offset=".6" stop-color="#1f5fb4"/><stop offset="1" stop-color="#143f80"/></radialGradient>',
    '<radialGradient id="PFX-stop" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff6b7a"/><stop offset=".55" stop-color="#e5203a"/><stop offset="1" stop-color="#a3101f"/></radialGradient>',
    '<radialGradient id="PFX-rst" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#7fb8f5"/><stop offset=".55" stop-color="#2f83da"/><stop offset="1" stop-color="#1b5aa3"/></radialGradient>',
    '<linearGradient id="PFX-cu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a5a35"/><stop offset=".45" stop-color="#e6a777"/><stop offset="1" stop-color="#8a4c2c"/></linearGradient>',
    '<radialGradient id="PFX-cuscr" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#d9a27c"/><stop offset=".6" stop-color="#8f5536"/><stop offset="1" stop-color="#5a301c"/></radialGradient>',
]

# ---------------------------------------------------------------- pines 1/3/5
for cx, lab in ((40, "1"), (80, "3"), (120, "5")):
    p.append(f'<rect x="{cx-5}" y="0" width="10" height="{BY0-20}" fill="url(#PFX-cu)" stroke="#5a301c" stroke-width=".8"/>')
    p.append(f'<rect x="{cx-14}" y="{BY0-34}" width="28" height="34" rx="2" fill="#2b2e33" stroke="{INK}" stroke-width="1.1"/>')
    p.append(f'<rect x="{cx-9}" y="{BY0-30}" width="18" height="8" fill="#41454b"/>')
    p.append(f'<text x="{cx+16}" y="{BY0-40}" {F} font-size="9" font-weight="700" fill="{INK}">{lab}</text>')
    p.append(jw_term(lab, cx, 12))
# lengüeta de fijación (MB-2) a la derecha, sobre el cuerpo
p.append(f'<rect x="150" y="{BY0-18}" width="22" height="18" rx="2" fill="#2b2e33" stroke="{INK}" stroke-width="1.1"/>')

# ---------------------------------------------------------------- cuerpo
p.append(f'<rect x="{BX0+2}" y="{BY0+3}" width="{BX1-BX0}" height="{BY1-BY0}" rx="4" fill="#000" opacity=".22"/>')
p.append(f'<rect x="{BX0}" y="{BY0}" width="{BX1-BX0}" height="{BY1-BY0}" rx="4" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.6"/>')
# franja gris inferior y canal entre panel y borneras
p.append(f'<rect x="{BX0+1}" y="{y(45.2)}" width="{BX1-BX0-2}" height="{BY1-y(45.2)-1}" fill="#8f949a"/>')
p.append(f'<rect x="{BX0+1}" y="{y(21.6)}" width="{BX1-BX0-2}" height="7" fill="#c9cdd2"/>')
p.append(f'<line x1="{BX0}" y1="{y(33.6)}" x2="{BX1}" y2="{y(33.6)}" stroke="#b4b9bf" stroke-width="1.2"/>')

# rótulo: CHNT ® ▬ NR2-25
p.append(f'<text x="{x(1.6)}" y="{BY0+11}" {F} font-size="10.5" font-weight="900" fill="#1d6fc1" letter-spacing=".3">CHNT</text>')
p.append(f'<text x="{x(10.6)}" y="{BY0+7}" {F} font-size="5" fill="#1d6fc1">®</text>')
p.append(f'<rect x="{x(12.2)}" y="{BY0+6}" width="22" height="4" fill="#1d6fc1"/>')
p.append(f'<text x="{x(43.2)}" y="{BY0+11}" text-anchor="end" {F} font-size="10" font-weight="700" fill="#7d838a">NR2-25</text>')

# panel rebajado
p.append(f'<rect x="{x(1.7)}" y="{y(3.4)}" width="{(42.2-1.7)*MM}" height="{(21.2-3.4)*MM}" rx="5" fill="url(#PFX-panel)" stroke="#9aa0a6" stroke-width="1"/>')
# alojamiento gris del dial
DX, DY, DR = x(8.9), y(11.0), 5.7 * MM
p.append(f'<path d="M{x(2.4)} {y(4.2)}H{x(15.6)}Q{x(16.6)} {y(4.2)} {x(16.6)} {y(5.4)}V{y(15.5)}Q{x(16.6)} {y(20.4)} {x(12.6)} {y(20.4)}H{x(2.4)}Z" fill="#a7acb1" stroke="#80868c" stroke-width=".8"/>')
# escala del dial (marcas) y flecha de referencia
for k in range(7):
    a = math.radians(-150 + k * 50)
    r0, r1 = DR + 1.5, DR + 4.5
    p.append(f'<line x1="{DX+r0*math.sin(a):.1f}" y1="{DY-r0*math.cos(a):.1f}" x2="{DX+r1*math.sin(a):.1f}" y2="{DY-r1*math.cos(a):.1f}" stroke="#3d4248" stroke-width="1"/>')
p.append(f'<path d="M{x(2.9)} {y(5.0)}l6 0l-3 -5z" fill="#1d6fc1"/>')
# dial azul: gira con el ajuste (-150° en el mínimo del rango, +150° en el máximo)
p.append(f'<g data-rotate="out.ajusteRel:0:1:-150:150:{DX}:{DY}">')
p.append(f'<circle cx="{DX}" cy="{DY}" r="{DR}" fill="url(#PFX-dial)" stroke="#0f2f63" stroke-width="1.2"/>')
for k in range(9):
    a = math.radians(-120 + k * 30)
    p.append(f'<line x1="{DX+(DR-2)*math.sin(a):.1f}" y1="{DY-(DR-2)*math.cos(a):.1f}" x2="{DX+(DR-5)*math.sin(a):.1f}" y2="{DY-(DR-5)*math.cos(a):.1f}" stroke="#cfe1f7" stroke-width=".9"/>')
p.append(f'<path d="M{DX-10} {DY}H{DX+10}M{DX} {DY-10}V{DY+10}" stroke="#e8f1fb" stroke-width="3" stroke-linecap="round"/>')
p.append(f'<path d="M{DX} {DY-DR+1}l-3 6h6z" fill="#fff"/>')
p.append('</g>')
# TEST: lengüeta roja (se acciona con destornillador)
p.append(f'<g data-action="test" data-kind="momentary">')
p.append(f'<rect x="{x(3.0)}" y="{y(17.2)}" width="12" height="9" rx="1.5" fill="#d42a2a" stroke="#7a1010" stroke-width=".8"/>')
p.append(f'<rect data-show="out.test" x="{x(3.0)}" y="{y(17.2)}" width="12" height="9" rx="1.5" fill="#000" opacity=".35"/>')
p.append('</g>')
p.append(f'<text x="{x(6.6)}" y="{y(19.3)}" {F} font-size="7" font-weight="700" fill="#2b2f35">TEST</text>')

# ventana: banderín de disparo (naranja) y aviso de falta de fase
p.append(f'<rect x="{x(23)}" y="{y(4.4)}" width="{17*MM}" height="{5.0*MM}" rx="1.5" fill="#f4f5f6" stroke="#a5abb1" stroke-width="1"/>')
p.append(f'<g data-show="out.tripped"><rect x="{x(23.6)}" y="{y(5.0)}" width="{15.8*MM}" height="{3.8*MM}" rx="1" fill="#ff8a1c"/>'
         f'<text x="{x(31.5)}" y="{y(8.0)}" text-anchor="middle" {F} font-size="9" font-weight="900" fill="#3a1600">DISPARO</text></g>')
p.append(f'<text data-show="!out.tripped" x="{x(31.5)}" y="{y(8.0)}" text-anchor="middle" {F} font-size="7.5" font-weight="700" fill="#3d4248" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>')

# STOP / RESET
p.append(f'<text x="{x(27.6)}" y="{y(11.6)}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#4a5058">STOP</text>')
p.append(f'<text x="{x(37.0)}" y="{y(11.6)}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#4a5058">RESET</text>')
p.append(f'<rect x="{x(23)}" y="{y(12.6)}" width="{18.6*MM}" height="{8.0*MM}" rx="{4.0*MM}" fill="#3c4045" stroke="{INK}" stroke-width="1"/>')
SX, RX, BY = x(27.6), x(37.0), y(16.6)
p.append(f'<g data-action="stop" data-kind="momentary"><circle cx="{SX}" cy="{BY}" r="13" fill="#1d1f22"/>'
         f'<circle data-show="!out.stop" cx="{SX}" cy="{BY}" r="11.5" fill="url(#PFX-stop)"/>'
         f'<circle data-show="!out.stop" cx="{SX}" cy="{BY}" r="6" fill="none" stroke="#ff9aa4" stroke-width="1.2" opacity=".8"/>'
         f'<circle data-show="out.stop" cx="{SX}" cy="{BY+1}" r="10" fill="url(#PFX-stop)" opacity=".85"/></g>')
p.append(f'<g data-action="reset" data-kind="momentary"><circle cx="{RX}" cy="{BY}" r="13" fill="#1d1f22"/>'
         f'<circle cx="{RX}" cy="{BY}" r="11.5" fill="url(#PFX-rst)"/>'
         # ranura en cruz: gira hacia H (manual) o A (automático)
         f'<g data-show="param.rearme=manual (H)" transform="rotate(-30 {RX} {BY})"><path d="M{RX-8} {BY}H{RX+8}M{RX} {BY-8}V{BY+8}" stroke="#e8f1fb" stroke-width="2.6" stroke-linecap="round"/></g>'
         f'<g data-show="param.rearme=automático (A)" transform="rotate(30 {RX} {BY})"><path d="M{RX-8} {BY}H{RX+8}M{RX} {BY-8}V{BY+8}" stroke="#e8f1fb" stroke-width="2.6" stroke-linecap="round"/></g>'
         f'<text x="{RX-7}" y="{BY-4}" text-anchor="middle" {F} font-size="6" font-weight="800" fill="#fff">A</text>'
         f'<text x="{RX+7}" y="{BY+9}" text-anchor="middle" {F} font-size="6" font-weight="800" fill="#fff">H</text>'
         # al disparar, el RESET sobresale (aro claro)
         f'<circle data-show="out.tripped" cx="{RX}" cy="{BY}" r="13.5" fill="none" stroke="#ffcf6a" stroke-width="2"/></g>')

# aviso de falta de fase (sobre la etiqueta del modelo)
p.append(f'<g data-show="out.faltaFase"><rect x="{x(1.7)}" y="{y(21.9)}" width="{40.5*MM}" height="12" rx="2" fill="#ffd400" stroke="#8a6d00"/>'
         f'<text x="{x(22)}" y="{y(21.9)+9}" text-anchor="middle" {F} font-size="8.5" font-weight="800" fill="#2b2200">FALTA DE FASE</text></g>')


# ---------------------------------------------------------------- borneras
def screw(cx, cy, r=8.5):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+2.5}" fill="#3a3d42"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-cuscr)" stroke="{INK}" stroke-width="1.1"/>'
            f'<path d="M{cx-r*.6:.1f} {cy}H{cx+r*.6:.1f}M{cx} {cy-r*.6:.1f}V{cy+r*.6:.1f}" stroke="#2a160c" stroke-width="2.2" stroke-linecap="round"/>')


AY = y(27.4)
for cx, lab in ((20, "98"), (80, "97"), (120, "96"), (180, "95")):
    p.append(screw(cx, AY, 7.5))
    p.append(f'<text x="{cx}" y="{y(32.6)}" text-anchor="middle" {F} font-size="8.5" font-weight="700" fill="#5b6168">{lab}</text>')
    p.append(jw_term(lab, cx, AY))
p.append(f'<text x="50" y="{AY+4}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#5b6168">NO</text>')
p.append(f'<text x="150" y="{AY+4}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#5b6168">NC</text>')
# puente NO/NC dibujado como en la tapa: 97-98 y 95-96 separados eléctricamente
TY = y(38.4)
for cx, lab in ((40, "2/T1"), (100, "4/T2"), (160, "6/T3")):
    p.append(screw(cx, TY, 9.5))
    p.append(f'<text x="{cx}" y="{y(44.4)}" text-anchor="middle" {F} font-size="9" font-weight="700" fill="#3d4248">{lab}</text>')
    p.append(jw_term(lab.split("/")[0], cx, TY))
# bocas de los bornes inferiores en el borde
for cx in (20, 40, 80, 100, 120, 160, 180):
    p.append(f'<rect x="{cx-6}" y="{BY1-2}" width="12" height="4" fill="#000"/>')

open(OUT, "w").write(finish(p, "nr2"))
