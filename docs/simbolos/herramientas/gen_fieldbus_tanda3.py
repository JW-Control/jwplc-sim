"""Catalogo, tanda 3 (propuesta del 10/11/2026, por aprobar): equipos Modbus
RTU. Sin fotos propias todavia: aspecto y medidas de los catalogos; hay que
validarlos con fotos de JW Control (lineamientos 2.1).

  remote-io.svg        modulo de E/S remotas 8DI/8DO de riel DIN (70 mm):
                       arriba + - A B DC DI1-DI8, abajo C1 DO1-DO4 C2
                       DO5-DO8; LED PWR, uno por entrada (verde) y por salida
                       (ambar), y la direccion Modbus.
  energy-meter.svg     medidor PZEM-016: caja con la bornera L N A B y el TC
                       de anillo (CT1 entra la fase, CT2 sale a la carga);
                       la lectura va en un rotulo (el equipo real no tiene
                       pantalla).
  temp-controller.svg  controlador 48 x 48 con RS-485: frente con PV (rojo) y
                       SV (verde), LED OUT y AL1 y teclas; la bornera trasera
                       asoma arriba (L N A B 11 14) y abajo (R1 R2 R3 21 24).

Escala 4 px/mm. Uso: python3 gen_fieldbus_tanda3.py <carpeta>
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


def led(x, y, col, expr, r=4.5):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="#3a3f45" stroke="{INK}" stroke-width=".8"/>'
            f'<g data-show="{expr}"><circle cx="{x}" cy="{y}" r="{r + 5}" fill="{col}" opacity=".35"/><circle cx="{x}" cy="{y}" r="{r}" fill="{col}"/></g>')


def row(names, xs, cy, top, r=8.0, H=0, col="#e8eaed"):
    s = []
    for name, x in zip(names, xs):
        s.append(term(x, cy, r))
        s.append(jw_term(name, x, cy))
        s.append(f'<rect x="{x - 5}" y="{0 if top else H - 3}" width="10" height="3" fill="#000"/>')
        s.append(f'<text x="{x}" y="{cy + (22 if top else -16)}" text-anchor="middle" {F} font-size="7.5" font-weight="800" fill="{col}">{name}</text>')
    return s


# ================================================================ E/S remotas
TOP = ["+", "-", "A", "B", "DC"] + [f"DI{k}" for k in range(1, 9)]
BOT = ["C1", "DO1", "DO2", "DO3", "DO4", "C2", "DO5", "DO6", "DO7", "DO8"]
W, H = 280, 300
p = header("Modulo de E/S remotas Modbus RTU 8DI/8DO de riel DIN (70 mm). Escala 4 px/mm. Propuesta por aprobar.", W, H)
p.append(f'<rect x="2" y="2" width="276" height="296" rx="6" fill="#2b2f35" stroke="{INK}" stroke-width="1.6"/>')
for cy in (20, 280):
    p.append(f'<rect x="8" y="{cy - 14}" width="264" height="28" rx="3" fill="#1d6b3a" stroke="#0f3a1f"/>')
p += row(TOP, [20 * (k + 1) for k in range(len(TOP))], 20, True)
p += row(BOT, [20 * (k + 1) + 20 for k in range(len(BOT))], 280, False, H=H)
p.append(f'<rect x="20" y="58" width="240" height="184" rx="4" fill="#3a3f45" stroke="#202328"/>')
p.append(f'<text x="30" y="78" {F} font-size="11" font-weight="800" fill="#e8eaed">MODBUS RTU · 8DI / 8DO</text>')
p.append(f'<text x="30" y="92" {F} font-size="8" fill="#c9cdd3">24VDC · RS-485 · 8N1</text>')
p.append(f'<text x="250" y="78" text-anchor="end" {F} font-size="9" font-weight="800" fill="#f2c230" data-text="param.address">3</text>')
p.append(f'<text x="236" y="78" text-anchor="end" {F} font-size="8" fill="#c9cdd3">ID</text>')
p.append(led(250, 94, "#2fbf5a", "out.powered", 4))
p.append(f'<text x="236" y="97" text-anchor="end" {F} font-size="7" fill="#c9cdd3">PWR</text>')
for k in range(8):
    x = 44 + 26 * k
    p.append(led(x, 128, "#2fbf5a", f"out.di{k + 1}"))
    p.append(f'<text x="{x}" y="146" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#c9cdd3">DI{k + 1}</text>')
    p.append(led(x, 186, "#f2a51a", f"out.do{k + 1}"))
    p.append(f'<text x="{x}" y="204" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#c9cdd3">DO{k + 1}</text>')
p.append(f'<text x="30" y="232" {F} font-size="7" fill="#9aa0a6">DO1-DO4: común C1 · DO5-DO8: común C2</text>')
save("remote-io.svg", finish(p, "rio"))

# ================================================================ medidor PZEM-016
W, H = 240, 260
p = header("Medidor de energia Peacefair PZEM-016 con RS-485 y TC de anillo. Escala 4 px/mm. Propuesta por aprobar.", W, H)
# caja
p.append(f'<rect x="10" y="70" width="220" height="150" rx="6" fill="#1f2a3a" stroke="{INK}" stroke-width="1.6"/>')
p.append(f'<text x="24" y="94" {F} font-size="12" font-weight="800" fill="#e8eaed">PZEM-016</text>')
p.append(f'<text x="24" y="108" {F} font-size="8" fill="#c9cdd3">AC 80-260V · 100A · RS-485</text>')
p.append('<g id="energy-meter-logo"></g>')
p.append(led(206, 90, "#2fbf5a", "out.powered", 4))
p.append(f'<text x="194" y="93" text-anchor="end" {F} font-size="7" fill="#c9cdd3">PWR</text>')
# lectura (anotacion del simulador: el equipo no tiene pantalla)
p.append(f'<rect x="20" y="118" width="200" height="22" rx="3" fill="#0b0f14" stroke="#3a4a5e"/>')
p.append(f'<text x="120" y="133" text-anchor="middle" {F} font-size="9.5" font-weight="700" fill="#7fe3a8" data-text="out.lectura">sin tensión</text>')
p.append(f'<text x="120" y="156" text-anchor="middle" {F} font-size="9" font-weight="700" fill="#c9cdd3" data-text="out.kwh:d3:kWh">0,000 kWh</text>')
# bornera L N A B abajo
p.append(f'<rect x="20" y="214" width="200" height="34" rx="3" fill="#1d6b3a" stroke="#0f3a1f"/>')
p += row(["L", "N", "A", "B"], [40, 80, 160, 200], 232, False, r=9.0, H=H)
# TC de anillo arriba: la fase entra por CT1, pasa por el anillo y sale por CT2
p.append(f'<circle cx="120" cy="44" r="30" fill="#2b2f35" stroke="{INK}" stroke-width="1.4"/><circle cx="120" cy="44" r="14" fill="#0f141a" stroke="#000"/>')
p.append(f'<path d="M40 22 V44 H106 M134 44 H200 V22" fill="none" stroke="#7a4a22" stroke-width="3.4"/>')
p.append(f'<path d="M120 74 V84" stroke="#33373d" stroke-width="5"/>')
p += row(["CT1", "CT2"], [40, 200], 14, True, r=8.0)
p.append(f'<text x="120" y="12" text-anchor="middle" {F} font-size="7" fill="#9aa0a6">fase por el TC</text>')
save("energy-meter.svg", finish(p, "pzem"))

# ================================================================ controlador de temperatura 48 x 48
W, H = 200, 300
p = header("Controlador de temperatura de panel 48 x 48 mm con RS-485 (tipo Autonics TK4S / REX-C100 con comunicacion); la bornera trasera asoma arriba y abajo. Escala 4 px/mm. Propuesta por aprobar.", W, H)
# bornera trasera (detras del frente)
p.append(f'<rect x="10" y="2" width="180" height="296" rx="4" fill="#202226" stroke="{INK}" stroke-width="1.4"/>')
p += row(["L", "N", "A", "B", "11", "14"], [20, 40, 80, 100, 140, 160], 20, True)
p += row(["R1", "R2", "R3", "21", "24"], [40, 60, 80, 140, 160], 280, False, H=H)
# frente de 48 mm
FX, FY = 4, 54
p.append(f'<rect x="{FX}" y="{FY}" width="192" height="192" rx="6" fill="#2b2f35" stroke="{INK}" stroke-width="1.8"/>')
p.append(f'<rect x="{FX + 10}" y="{FY + 12}" width="172" height="64" rx="3" fill="#0a0b0c" stroke="#000"/>')
p.append(f'<text x="{FX + 172}" y="{FY + 62}" text-anchor="end" font-family="monospace" font-size="44" font-weight="800" fill="#ff4a3a" data-text="out.pvTxt">25.0</text>')
p.append(f'<text x="{FX + 16}" y="{FY + 26}" {F} font-size="8" font-weight="800" fill="#ff8a7a">PV</text>')
p.append(f'<rect x="{FX + 10}" y="{FY + 84}" width="172" height="44" rx="3" fill="#0a0b0c" stroke="#000"/>')
p.append(f'<text x="{FX + 172}" y="{FY + 118}" text-anchor="end" font-family="monospace" font-size="30" font-weight="800" fill="#3ddc84" data-text="out.svTxt">40.0</text>')
p.append(f'<text x="{FX + 16}" y="{FY + 98}" {F} font-size="8" font-weight="800" fill="#8ff0b8">SV</text>')
for k, (lab, col, expr) in enumerate((("OUT", "#ff4a3a", "out.salida"), ("AL1", "#f2a51a", "out.alarma"))):
    x = FX + 24 + 44 * k
    p.append(led(x, FY + 146, col, expr, 4))
    p.append(f'<text x="{x + 9}" y="{FY + 149}" {F} font-size="8" font-weight="800" fill="#c9cdd3">{lab}</text>')
for k, lab in enumerate(("SET", "◀", "▼", "▲")):
    x = FX + 26 + 44 * k
    p.append(f'<rect x="{x - 16}" y="{FY + 160}" width="32" height="20" rx="4" fill="#3a3f45" stroke="#000"/>')
    p.append(f'<text x="{x}" y="{FY + 174}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#e8eaed">{lab}</text>')
p.append('<g id="temp-controller-logo"></g>')
save("temp-controller.svg", finish(p, "tic"))
print("ok")
