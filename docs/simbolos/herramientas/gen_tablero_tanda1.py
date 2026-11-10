"""Catalogo, tanda 1 (propuesta del 10/11/2026, por aprobar): equipos de
tablero sin familia previa. Sin fotos propias todavia: medidas y aspecto de
los catalogos de cada fabricante; hay que validarlos con fotos de JW Control
(lineamientos 2.1).

  motor-protector.svg  guardamotor CHINT NS2-25 (como Schneider GV2-ME), 45 x
                       89 mm, con el auxiliar lateral NS2-AE11. Polos 1/3/5 y
                       2/4/6 en x = 40, 80, 120 (calzan sobre el contactor
                       CJX2); auxiliar 13/21 arriba y 14/22 abajo. Perilla
                       negra O - TRIP - I (out.knob), dial de ajuste y TEST.
  timer-relay.svg      rele temporizador multifuncion de riel DIN (tipo
                       Schneider RE22R2 / CHINT NJS2-Z), 22,5 mm reales; aqui
                       30 mm para que entren cinco bornes abajo. LED U y R,
                       dial de tiempo y aguja de avance.
  ssr.svg              rele de estado solido Fotek SSR-40DA, 45 x 62,5 mm:
                       salida 1-2 arriba, entrada 3 (+) y 4 (-) abajo, LED.
  stack-light.svg      torre de senalizacion LED de 3 niveles con zumbador
                       (tipo LTA-205-3, Ø50), equipo de campo a 2 px/mm; cable
                       de 5 hilos abajo: COM, R, A, V, Z.

Uso: python3 gen_tablero_tanda1.py <carpeta>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import F, INK, finish, header, jw_term, term  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def save(name, text):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(text)


# ================================================================ guardamotor NS2-25
W, H = 240, 360
p = header("Guardamotor CHINT NS2-25 (tipo Schneider GV2-ME) con auxiliar lateral NS2-AE11, vista frontal. Escala 4 px/mm (polos alineados con el contactor CJX2). Propuesta por aprobar.", W, H)
for d in (
    '<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b4047"/><stop offset=".15" stop-color="#4c525a"/><stop offset=".85" stop-color="#4c525a"/><stop offset="1" stop-color="#33383e"/></linearGradient>',
    '<linearGradient id="PFX-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6069"/><stop offset="1" stop-color="#42474e"/></linearGradient>',
    '<linearGradient id="PFX-knob" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3e44"/><stop offset=".5" stop-color="#16181b"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>',
):
    p.insert(-1, d)
# Cuerpo principal (45 mm) y bloque auxiliar lateral.
p.append('<rect x="2" y="6" width="180" height="348" rx="6" fill="#000" opacity=".25" transform="translate(2 3)"/>')
p.append(f'<rect x="2" y="6" width="180" height="348" rx="6" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.6"/>')
p.append(f'<rect x="186" y="40" width="52" height="280" rx="4" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<text x="212" y="176" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd3" transform="rotate(-90 212 176)">NS2-AE11</text>')
# Bornes de potencia y auxiliares.
for k, cx in enumerate((40, 80, 120)):
    top, bot = str(2 * k + 1), str(2 * k + 2)
    for cy, name, lab in ((30, top, f"{top}/L{k+1}"), (330, bot, f"{bot}/T{k+1}")):
        p.append(f'<rect x="{cx-15}" y="{cy-16}" width="30" height="32" rx="3" fill="#25292e" stroke="{INK}"/>')
        p.append(term(cx, cy, 10.0))
        p.append(jw_term(name, cx, cy))
        p.append(f'<rect x="{cx-6}" y="{0 if cy < 100 else H-4}" width="12" height="4" fill="#000"/>')
        p.append(f'<text x="{cx}" y="{cy + (26 if cy < 100 else -22)}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#e6e8eb">{lab}</text>')
for cx, top, bot in ((200, "13", "14"), (220, "21", "22")):
    for cy, name in ((58, top), (302, bot)):
        p.append(term(cx, cy, 8.0))
        p.append(jw_term(name, cx, cy))
        p.append(f'<text x="{cx}" y="{cy + (20 if cy < 100 else -14)}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#e6e8eb">{name}</text>')
    p.append(f'<line x1="{cx}" y1="40" x2="{cx}" y2="46" stroke="#000" stroke-width="3"/>')
p.append(f'<text x="200" y="98" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#2fbf5a">NA</text>')
p.append(f'<text x="220" y="98" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#e05a4a">NC</text>')
# Frente: placa con el modelo y el dial de ajuste.
p.append(f'<rect x="14" y="62" width="156" height="236" rx="5" fill="url(#PFX-front)" stroke="#202328" stroke-width="1.2"/>')
p.append('<g id="motor-protector-logo"></g>')
p.append(f'<text x="24" y="80" {F} font-size="11" font-weight="800" fill="#e8eaed">NS2-25</text>')
p.append(f'<text x="24" y="92" {F} font-size="7" fill="#c9cdd3">IEC/EN60947-2 · 690V~</text>')
# Dial de ajuste (corriente del motor): flecha que gira con el ajuste.
DX, DY = 128, 104
p.append(f'<circle cx="{DX}" cy="{DY}" r="20" fill="#e9ebee" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<g data-rotate="out.ajusteRel:0:1:-120:120:{DX}:{DY}"><path d="M{DX} {DY-17} L{DX+5} {DY-4} H{DX-5} Z" fill="#1f5fc8"/><circle cx="{DX}" cy="{DY}" r="6" fill="#1f5fc8"/></g>')
p.append(f'<text x="{DX}" y="{DY+33}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#e8eaed" data-text="out.ajusteTxt">3,2 A (2,5-4)</text>')
# TEST
p.append('<g data-action="test" data-kind="momentary">')
p.append(f'<rect x="24" y="104" width="34" height="18" rx="3" fill="#25292e" stroke="{INK}"/>')
p.append(f'<rect x="32" y="110" width="18" height="6" rx="2" fill="#e05a4a"/>')
p.append(f'<text x="41" y="132" text-anchor="middle" {F} font-size="7" font-weight="800" fill="#e8eaed">TEST</text>')
p.append('</g>')
# Perilla O - TRIP - I: gira con out.knob (0, 0,5, 1).
KX, KY = 92, 214
for ang, txt, col in ((-60, "O", "#e8eaed"), (0, "TRIP", "#f2c230"), (60, "I", "#e8eaed")):
    import math
    a = math.radians(ang)
    p.append(f'<text x="{KX + 62 * math.sin(a):.1f}" y="{KY - 62 * math.cos(a) + 3:.1f}" text-anchor="middle" {F} font-size="{9 if txt != "TRIP" else 7.5}" font-weight="800" fill="{col}">{txt}</text>')
p.append('<g data-action="knob" data-kind="toggle">')
p.append(f'<circle cx="{KX}" cy="{KY}" r="48" fill="#25292e" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<g data-rotate="out.knob:0:1:-60:60:{KX}:{KY}">')
p.append(f'<rect x="{KX-16}" y="{KY-44}" width="32" height="88" rx="8" fill="#000" opacity=".35" transform="translate(2 3)"/>')
p.append(f'<rect x="{KX-16}" y="{KY-44}" width="32" height="88" rx="8" fill="url(#PFX-knob)" stroke="#000" stroke-width="1.2"/>')
p.append(f'<path d="M{KX} {KY-40} L{KX+6} {KY-28} H{KX-6} Z" fill="#f2f3f5"/>')
p.append('</g></g>')
# Disparado: la perilla queda en TRIP; ademas un rotulo, porque de lejos no se lee.
p.append(f'<g data-show="out.tripped"><rect x="40" y="276" width="104" height="16" rx="3" fill="#c0392b"/><text x="92" y="288" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#fff">DISPARADO</text></g>')
save("motor-protector.svg", finish(p, "ns2"))

# ================================================================ temporizador multifuncion
W, H = 120, 380
p = header("Rele temporizador multifuncion de riel DIN (tipo Schneider RE22R2 / CHINT NJS2-Z), A1-A2, 15-16-18 y 25-26-28. 22,5 mm reales, aqui 30 mm para los cinco bornes de abajo. Escala 4 px/mm. Propuesta por aprobar.", W, H)
p.insert(-1, '<linearGradient id="PFX-gry" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9cdd2"/><stop offset=".12" stop-color="#e6e9ec"/><stop offset=".88" stop-color="#e6e9ec"/><stop offset="1" stop-color="#bfc4c9"/></linearGradient>')
p.insert(-1, '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
p.append(f'<rect x="2" y="2" width="116" height="376" rx="5" fill="url(#PFX-gry)" stroke="{INK}" stroke-width="1.6"/>')
TOP = (("A1", 20), ("15", 60), ("25", 100))
BOT = (("A2", 20), ("16", 40), ("18", 60), ("26", 80), ("28", 100))
for row, cy, r in ((TOP, 22, 9.0), (BOT, 358, 7.5)):
    p.append(f'<rect x="6" y="{cy-14}" width="108" height="28" rx="3" fill="#d5d9dd" stroke="#9aa1a8"/>')
    for name, cx in row:
        p.append(term(cx, cy, r))
        p.append(jw_term(name, cx, cy))
        p.append(f'<rect x="{cx-5}" y="{0 if cy < 100 else H-3}" width="10" height="3" fill="#000"/>')
        p.append(f'<text x="{cx}" y="{cy + (24 if cy < 100 else -18)}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}">{name}</text>')
# Frente: LED U (alimentado) y R (rele cerrado).
for x, lab, col, expr in ((36, "U", "#2fbf5a", "out.energized"), (84, "R", "#f2c230", "out.closed")):
    p.append(f'<circle cx="{x}" cy="74" r="6" fill="#4a4f56" stroke="{INK}"/>')
    p.append(f'<g data-show="{expr}"><circle cx="{x}" cy="74" r="13" fill="{col}" opacity=".35"/><circle cx="{x}" cy="74" r="6" fill="{col}"/><circle cx="{x}" cy="74" r="6" fill="url(#PFX-led)"/></g>')
    p.append(f'<text x="{x}" y="94" text-anchor="middle" {F} font-size="9" font-weight="800" fill="{INK}">{lab}</text>')
# Funcion elegida (rotulo) y dial de tiempo con la aguja de avance.
p.append(f'<rect x="10" y="104" width="100" height="26" rx="3" fill="#fff" stroke="#9aa1a8"/>')
p.append(f'<text x="60" y="114" text-anchor="middle" {F} font-size="6.5" font-weight="700" fill="#59606a">FUNCIÓN</text>')
p.append(f'<text x="60" y="125" text-anchor="middle" {F} font-size="7" font-weight="800" fill="{INK}" data-text="param.mode">retardo a la conexión</text>')
CX, CY = 60, 196
p.append(f'<circle cx="{CX}" cy="{CY}" r="44" fill="#fff" stroke="#9aa1a8" stroke-width="1.2"/>')
import math
for k in range(11):
    a = math.radians(-135 + 27 * k)
    x0, y0 = CX + 36 * math.sin(a), CY - 36 * math.cos(a)
    x1, y1 = CX + 42 * math.sin(a), CY - 42 * math.cos(a)
    p.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="{INK}" stroke-width="{1.6 if k % 5 == 0 else .9}"/>')
# aguja roja de avance (0 a 1 del tiempo)
p.append(f'<g data-rotate="out.progress:0:1:-135:135:{CX}:{CY}"><line x1="{CX}" y1="{CY}" x2="{CX}" y2="{CY-38}" stroke="#d62a1e" stroke-width="2.4" stroke-linecap="round"/></g>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="16" fill="#2b2f35" stroke="{INK}"/><rect x="{CX-2}" y="{CY-15}" width="4" height="12" rx="1.5" fill="#e8eaed"/>')
p.append(f'<text x="{CX}" y="{CY+62}" text-anchor="middle" {F} font-size="11" font-weight="800" fill="{INK}" data-text="out.timeTxt">5 s</text>')
p.append(f'<text x="{CX}" y="{CY+76}" text-anchor="middle" {F} font-size="7" fill="#59606a" data-text="param.coil">24VDC</text>')
p.append(f'<text x="{CX}" y="292" text-anchor="middle" {F} font-size="7" fill="#59606a">15─┬─18 · 25─┬─28</text>')
p.append(f'<text x="{CX}" y="302" text-anchor="middle" {F} font-size="7" fill="#59606a">  └─16      └─26</text>')
save("timer-relay.svg", finish(p, "tmr"))

# ================================================================ SSR Fotek SSR-40DA
W, H = 180, 260
p = header("Rele de estado solido Fotek SSR-40DA (45 x 62,5 mm), salida 1-2 (24-380VAC 40A) arriba, entrada 3(+) 4(-) 3-32VDC abajo. Vista frontal. Escala 4 px/mm. Propuesta por aprobar.", W, H)
p.insert(-1, '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4f2"/><stop offset=".45" stop-color="#ff3b2f"/><stop offset="1" stop-color="#ff3b2f" stop-opacity="0"/></radialGradient>')
# base metalica con las orejas de fijacion (no son bornes)
p.append(f'<rect x="4" y="20" width="172" height="220" rx="6" fill="#8a9097" stroke="{INK}" stroke-width="1.4"/>')
for cy in (36, 224):
    p.append(f'<circle cx="90" cy="{cy}" r="7" fill="#2b2f35" stroke="{INK}"/>')
# tapa negra con la etiqueta blanca
p.append(f'<rect x="14" y="4" width="152" height="252" rx="6" fill="#1d2024" stroke="{INK}" stroke-width="1.6"/>')
p.append(f'<rect x="30" y="70" width="120" height="120" rx="3" fill="#f2f2ee" stroke="#9aa1a8"/>')
p.append(f'<text x="90" y="86" text-anchor="middle" {F} font-size="9" font-weight="800" fill="{INK}">SOLID STATE RELAY</text>')
p.append(f'<text x="90" y="100" text-anchor="middle" {F} font-size="13" font-weight="800" fill="{INK}">SSR-40 DA</text>')
p.append(f'<text x="90" y="118" text-anchor="middle" {F} font-size="8" fill="{INK}">OUTPUT: 24-380VAC</text>')
p.append(f'<text x="90" y="129" text-anchor="middle" {F} font-size="8" fill="{INK}">40A</text>')
p.append(f'<text x="90" y="180" text-anchor="middle" {F} font-size="8" fill="{INK}">INPUT: 3-32VDC</text>')
p.append('<g id="ssr-logo"></g>')
# LED rojo de entrada
p.append(f'<circle cx="90" cy="150" r="5" fill="#4a1410" stroke="#000"/>')
p.append(f'<g data-show="out.input"><circle cx="90" cy="150" r="14" fill="url(#PFX-led)"/><circle cx="90" cy="150" r="4.5" fill="#ff5a4a"/></g>')
p.append(f'<text x="106" y="153" {F} font-size="7" font-weight="700" fill="{INK}">ON</text>')
# bornes: 1 y 2 (carga) arriba, 3 (+) y 4 (-) abajo
for name, cx, cy, lab, col in (("1", 40, 32, "1", INK), ("2", 140, 32, "2", INK), ("3", 40, 228, "3 +", "#c0392b"), ("4", 140, 228, "4 −", "#2f62d6")):
    p.append(f'<rect x="{cx-18}" y="{cy-18}" width="36" height="36" rx="3" fill="#c3c8ce" stroke="{INK}"/>')
    p.append(term(cx, cy, 11.0))
    p.append(jw_term(name, cx, cy))
    p.append(f'<rect x="{cx-6}" y="{0 if cy < 100 else H-4}" width="12" height="4" fill="#000"/>')
    # numero del borne por dentro: debajo de los de arriba, encima de los de abajo
    p.append(f'<text x="{cx}" y="{cy + 28 if cy < 100 else cy - 26}" text-anchor="middle" {F} font-size="10" font-weight="800" fill="{col if col != INK else "#e8eaed"}">{lab}</text>')
p.append(f'<text x="90" y="40" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd3">LOAD ~</text>')
p.append(f'<text x="90" y="232" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd3">INPUT =</text>')
save("ssr.svg", finish(p, "ssr"))

# ================================================================ torre de senalizacion (campo, 2 px/mm)
W, H = 120, 460
p = header("Torre de senalizacion LED 3 niveles con zumbador (tipo LTA-205-3, Ø50 mm), equipo de campo a 2 px/mm; cable de 5 hilos COM, R, A, V, Z. Propuesta por aprobar.", W, H)
p.insert(-1, '<linearGradient id="PFX-cap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2d32"/><stop offset=".4" stop-color="#4a4f56"/><stop offset="1" stop-color="#1c1e22"/></linearGradient>')
p.insert(-1, '<linearGradient id="PFX-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset=".3" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>')
X0, X1 = 10, 110            # Ø50 mm = 100 px
# zumbador arriba (con sus ondas al sonar)
p.append(f'<g data-show="out.buzzer" fill="none" stroke="#f2a51a" stroke-width="3" stroke-linecap="round" opacity=".9">'
         f'<path d="M30 16 Q60 -2 90 16"/><path d="M20 26 Q60 0 100 26" opacity=".6"/></g>')
p.append(f'<rect x="{X0}" y="20" width="100" height="44" rx="10" fill="url(#PFX-cap)" stroke="{INK}" stroke-width="1.4"/>')
for k in range(7):
    p.append(f'<rect x="{24 + 11 * k}" y="34" width="5" height="16" rx="2.5" fill="#0d0e10"/>')
TIERS = (("red", "#e0392b", "#5a1610"), ("amber", "#f2a51a", "#5a3a08"), ("green", "#2fbf5a", "#0f3a1c"))
y = 64
for out, on_col, off_col in TIERS:
    p.append(f'<rect x="{X0}" y="{y}" width="100" height="86" fill="{off_col}" stroke="{INK}" stroke-width="1.2"/>')
    p.append(f'<g data-show="out.{out}"><rect x="{X0 - 6}" y="{y - 4}" width="112" height="94" rx="10" fill="{on_col}" opacity=".3"/>'
             f'<rect x="{X0}" y="{y}" width="100" height="86" fill="{on_col}"/><rect x="{X0 + 30}" y="{y + 8}" width="40" height="70" rx="8" fill="#fff" opacity=".55"/></g>')
    # LED visible apagado
    p.append(f'<g data-show="!out.{out}">' + "".join(f'<circle cx="{40 + 20 * i}" cy="{y + 43}" r="4" fill="#000" opacity=".35"/>' for i in range(3)) + '</g>')
    p.append(f'<rect x="{X0}" y="{y}" width="100" height="86" fill="url(#PFX-glass)"/>')
    p.append(f'<rect x="{X0 - 2}" y="{y + 82}" width="104" height="8" rx="2" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    y += 90
# base y tubo
p.append(f'<rect x="{X0}" y="{y}" width="100" height="26" rx="4" fill="url(#PFX-cap)" stroke="{INK}" stroke-width="1.2"/>')
p.append(f'<rect x="48" y="{y + 26}" width="24" height="44" fill="url(#PFX-cap)" stroke="{INK}"/>')
p.append(f'<text x="60" y="{y + 17}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#c9cdd3" data-text="param.rating">24VDC</text>')
# cable de 5 hilos con su funcion
WIRES = (("COM", 20, "#1b1d20"), ("R", 40, "#e0392b"), ("A", 60, "#f2a51a"), ("V", 80, "#2fbf5a"), ("Z", 100, "#eef1f4"))
ys = y + 70
for name, x, col in WIRES:
    path = f"M60 {ys} C60 {ys + 14} {x} {ys + 8} {x} {ys + 24} V{H - 14}"
    p.append(f'<path d="{path}" fill="none" stroke="#6b737c" stroke-width="5"/>')
    p.append(f'<path d="{path}" fill="none" stroke="{col}" stroke-width="3.4"/>')
    p.append(f'<rect x="{x - 4}" y="{H - 24}" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{x - 5}" y="{H - 4}" width="10" height="4" fill="#16181b"/>')
    p.append(f'<text x="{x}" y="{H - 30}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e8eaed">{name}</text>')
    p.append(jw_term(name, x, H - 18))
save("stack-light.svg", finish(p, "stk"))
print("ok")
