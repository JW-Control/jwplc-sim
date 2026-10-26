"""Variador Delta VFD-EL (VFD007EL21A, armazón A), vista frontal a 4 px/mm.

Medidas aproximadas del armazón A (72 x 142 mm): 70 x 141 mm dentro de un
viewBox de 300 x 580. Pendiente de contrastar con el manual y fotos del
VFD-EL (colores, posición exacta de teclas y bornes).

Bornes (cx múltiplo de 20; en el equipo real los de control están bajo la
tapa inferior, aquí se reparten arriba y abajo para cablear el plano):
  arriba: R/L1 S/L2 PE  RA RB RC  SG+ SG-
  abajo:  U/T1 V/T2 W/T3  MI1 … MI6 DCM +24V
Teclado: pantalla LED (out.lcd) con los indicadores F/H/U (out.modo), LEDs
RUN STOP FWD REV, teclas RUN, STOP/RESET, MODE, ▲, ▼, ENTER (acciones
momentáneas) y la perilla de frecuencia (acción pot, se arrastra en vertical).

Uso: gen_vfd_el.py <salida.svg>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import header, finish, jw_term, INK, F

OUT = sys.argv[1]
W, H = 300, 580
BX0, BX1, BY0, BY1 = 10, 290, 6, 574

p = header("Variador Delta VFD-EL (VFD007EL21A, 0,75 kW, 1F 230 V). Vista frontal. Escala 4 px/mm (medidas aproximadas).", W, H)
defs = p.index('</defs>')
p[defs:defs] = [
    '<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9dcdf"/><stop offset=".12" stop-color="#eef0f2"/><stop offset=".88" stop-color="#eceef0"/><stop offset="1" stop-color="#cfd3d7"/></linearGradient>',
    '<linearGradient id="PFX-pad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f45"/><stop offset="1" stop-color="#25292e"/></linearGradient>',
    '<linearGradient id="PFX-key" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d646c"/><stop offset="1" stop-color="#3e444b"/></linearGradient>',
    '<radialGradient id="PFX-knob" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#9aa1a9"/><stop offset=".6" stop-color="#5d646c"/><stop offset="1" stop-color="#2f3439"/></radialGradient>',
    '<linearGradient id="PFX-tb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3f44"/><stop offset="1" stop-color="#202327"/></linearGradient>',
]

# cuerpo
p.append(f'<rect x="{BX0+3}" y="{BY0+4}" width="{BX1-BX0}" height="{BY1-BY0}" rx="8" fill="#000" opacity=".22"/>')
p.append(f'<rect x="{BX0}" y="{BY0}" width="{BX1-BX0}" height="{BY1-BY0}" rx="8" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.6"/>')


def screw(cx, cy, r=7.5):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+2}" fill="#15171a"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1"/>'
            f'<path d="M{cx-r*.6:.1f} {cy}H{cx+r*.6:.1f}M{cx} {cy-r*.6:.1f}V{cy+r*.6:.1f}" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>')


# ---------------------------------------------------------------- bornera superior
TOP = [("R", "R/L1", 20), ("S", "S/L2", 60), ("PE", "PE", 100), ("RA", "RA", 140), ("RB", "RB", 180), ("RC", "RC", 220), ("SG+", "SG+", 260), ("SG-", "SG-", 280)]
p.append(f'<rect x="{BX0+1}" y="{BY0}" width="{BX1-BX0-2}" height="40" rx="7" fill="url(#PFX-tb)"/>')
for t, lab, cx in TOP:
    p.append(screw(cx, 24, 6.5 if cx >= 260 else 7.5))
    p.append(jw_term(t, cx, 24))
    p.append(f'<rect x="{cx-5}" y="{BY0-3}" width="10" height="4" fill="#000"/>')
for t, lab, cx in TOP:
    col = "#2f8f3a" if t == "PE" else "#3d4248"
    p.append(f'<text x="{cx}" y="58" text-anchor="middle" {F} font-size="{7 if cx >= 260 else 8.5}" font-weight="700" fill="{col}">{lab}</text>')
p.append(f'<text x="200" y="70" text-anchor="middle" {F} font-size="6.5" fill="#6b7178">RELÉ · RS-485</text>')

# ---------------------------------------------------------------- rótulo
p.append(f'<path d="M28 96l9 -16l9 16z" fill="none" stroke="#1e5bb8" stroke-width="2.6" stroke-linejoin="round"/>')
p.append(f'<text x="51" y="96" {F} font-size="15" font-weight="900" font-style="italic" fill="#1e5bb8" letter-spacing=".5">DELTA</text>')
p.append(f'<text x="272" y="96" text-anchor="end" {F} font-size="12" font-weight="800" fill="#5b6168">VFD-EL</text>')

# ---------------------------------------------------------------- teclado
p.append('<rect x="24" y="106" width="252" height="258" rx="12" fill="url(#PFX-pad)" stroke="#111" stroke-width="1.4"/>')
# pantalla LED de 4 dígitos con indicadores F/H/U
p.append('<rect x="38" y="120" width="224" height="62" rx="5" fill="#0b0b0c" stroke="#000" stroke-width="1.2"/>')
p.append('<rect x="76" y="126" width="178" height="50" rx="2" fill="#160707"/>')
for k, (m, yy) in enumerate((("F", 136), ("H", 154), ("U", 172))):
    p.append(f'<text x="54" y="{yy}" text-anchor="middle" {F} font-size="11" font-weight="800" fill="#3a1410">{m}</text>')
    p.append(f'<text data-show="out.modo={m}" x="54" y="{yy}" text-anchor="middle" {F} font-size="11" font-weight="800" fill="#ff3b26">{m}</text>')
p.append('<text data-text="out.lcd" x="248" y="167" text-anchor="end" font-family="monospace" font-size="42" font-weight="700" fill="#ff3b26" letter-spacing="2"></text>')
# LEDs de estado
for lab, cx, key, col in (("RUN", 66, "ledRun", "#3be35e"), ("STOP", 122, "ledStop", "#ff3b30"), ("FWD", 178, "ledFwd", "#3be35e"), ("REV", 234, "ledRev", "#3be35e")):
    p.append(f'<circle cx="{cx}" cy="196" r="4.5" fill="#1a1c1f" stroke="#000" stroke-width=".8"/>')
    p.append(f'<circle data-show="out.{key}" cx="{cx}" cy="196" r="4.5" fill="{col}"/>')
    p.append(f'<circle data-show="out.{key}" cx="{cx}" cy="196" r="9" fill="{col}" opacity=".25"/>')
    p.append(f'<text x="{cx}" y="214" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#d5d9de">{lab}</text>')


def keycap(action, cx, cy, w, h, label, col="#eef1f4", size=11):
    return (f'<g data-action="{action}" data-kind="momentary">'
            f'<rect x="{cx-w/2}" y="{cy-h/2+2}" width="{w}" height="{h}" rx="6" fill="#111"/>'
            f'<rect data-show="!out.k_{action}" x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="6" fill="url(#PFX-key)" stroke="#16191c" stroke-width="1"/>'
            f'<rect data-show="out.k_{action}" x="{cx-w/2}" y="{cy-h/2+2}" width="{w}" height="{h}" rx="6" fill="#30353b" stroke="#16191c" stroke-width="1"/>'
            f'<text x="{cx}" y="{cy+size*0.36+1}" text-anchor="middle" {F} font-size="{size}" font-weight="800" fill="{col}">{label}</text></g>')


p.append(keycap("run", 64, 254, 66, 36, "RUN", "#6ff08b", 12))
p.append(keycap("stop", 236, 254, 66, 36, "STOP", "#ff7b70", 11))
p.append(f'<text x="236" y="283" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#ff9d95">RESET</text>')
p.append(keycap("mode", 56, 326, 50, 34, "MODE", size=9.5))
p.append(keycap("up", 118, 326, 50, 34, "▲", size=14))
p.append(keycap("down", 182, 326, 50, 34, "▼", size=14))
p.append(keycap("enter", 244, 326, 50, 34, "ENTER", size=9))

# perilla de frecuencia: se arrastra en vertical (arriba sube); gira -135° a +135°
KX, KY = 150, 254
for k in range(11):
    import math
    a = math.radians(-135 + k * 27)
    p.append(f'<line x1="{KX+31*math.sin(a):.1f}" y1="{KY-31*math.cos(a):.1f}" x2="{KX+36*math.sin(a):.1f}" y2="{KY-36*math.cos(a):.1f}" stroke="#aeb4bb" stroke-width="{1.6 if k in (0, 10) else 1}"/>')
p.append(f'<text x="{KX-30}" y="{KY+36}" text-anchor="middle" {F} font-size="7" fill="#aeb4bb">MIN</text>')
p.append(f'<text x="{KX+30}" y="{KY+36}" text-anchor="middle" {F} font-size="7" fill="#aeb4bb">MAX</text>')
p.append(f'<g data-action="pot" data-kind="drag" data-drag="y:0:-1.2:0:100">')
p.append(f'<circle cx="{KX}" cy="{KY}" r="28" fill="#000" opacity="0"/>')
p.append(f'<g data-rotate="out.pot|param.pot:0:100:-135:135:{KX}:{KY}">')
p.append(f'<circle cx="{KX}" cy="{KY+2}" r="25" fill="#111"/>')
p.append(f'<circle cx="{KX}" cy="{KY}" r="25" fill="url(#PFX-knob)" stroke="#16191c" stroke-width="1.2"/>')
for k in range(16):
    a = math.radians(k * 22.5)
    p.append(f'<line x1="{KX+22*math.sin(a):.1f}" y1="{KY-22*math.cos(a):.1f}" x2="{KX+25*math.sin(a):.1f}" y2="{KY-25*math.cos(a):.1f}" stroke="#2b3035" stroke-width="1.4"/>')
p.append(f'<line x1="{KX}" y1="{KY-6}" x2="{KX}" y2="{KY-21}" stroke="#f4f6f8" stroke-width="3" stroke-linecap="round"/>')
p.append('</g></g>')

# ---------------------------------------------------------------- tapa frontal
for k in range(6):
    yy = 384 + k * 10
    p.append(f'<rect x="40" y="{yy}" width="220" height="4" rx="2" fill="#c4c8cd"/>')
p.append('<rect x="44" y="448" width="212" height="52" rx="3" fill="#f8f9fa" stroke="#b4b9bf" stroke-width="1"/>')
p.append(f'<text x="54" y="464" {F} font-size="10" font-weight="800" fill="#2b2f35">VFD007EL21A</text>')
p.append(f'<text x="54" y="478" {F} font-size="7.5" fill="#4a5058">0,75 kW · entrada 1F 200-240 V 50/60 Hz</text>')
p.append(f'<text x="54" y="490" {F} font-size="7.5" fill="#4a5058">salida 3F 0-240 V · 0,1-600 Hz · 4,2 A</text>')
# aviso de referencia sin modelar (AVI/ACI)
p.append('<g data-show="out.aviso"><rect x="30" y="368" width="240" height="14" rx="3" fill="#ffd400" stroke="#8a6d00"/>'
         f'<text x="150" y="378" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#2b2200">02-00 = AVI/ACI: sin modelar (0 Hz)</text></g>')

# ---------------------------------------------------------------- bornera inferior
BOT = [("U", "U/T1", 20), ("V", "V/T2", 60), ("W", "W/T3", 100)] + [(f"MI{i}", f"MI{i}", 120 + 20 * i) for i in range(1, 7)] + [("DCM", "DCM", 260), ("+24V", "+24V", 280)]
p.append(f'<rect x="{BX0+1}" y="530" width="{BX1-BX0-2}" height="{BY1-530}" rx="7" fill="url(#PFX-tb)"/>')
for t, lab, cx in BOT:
    small = cx >= 140
    p.append(screw(cx, 554, 6.2 if small else 7.5))
    p.append(jw_term(t, cx, 554))
    p.append(f'<rect x="{cx-5}" y="{BY1-1}" width="10" height="4" fill="#000"/>')
    p.append(f'<text x="{cx}" y="{524 if not small else 525}" text-anchor="middle" {F} font-size="{8.5 if not small else 6.4}" font-weight="700" fill="#3d4248">{lab}</text>')
p.append('<path d="M132 510H272" stroke="#9aa0a6" stroke-width="1"/>')
p.append(f'<text x="202" y="507" text-anchor="middle" {F} font-size="6.5" fill="#6b7178">ENTRADAS (NPN: a DCM)</text>')

open(OUT, "w").write(finish(p, "vfdel"))
