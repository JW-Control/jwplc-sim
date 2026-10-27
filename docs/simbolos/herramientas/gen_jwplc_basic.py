"""JWPLC Basic, vista frontal, para la Placa y la Escena de JWPLC Sim.

Base: el dibujo de bornes de la página web de JW Control
(docs/simbolos/fuentes/JWPLC_Basic_Pines_Frente.svg, 27/10/2026), en sus
mismas unidades. Se toma el equipo (caja, borneras, pantalla, botonera, logo,
RJ-45, USB-C y RS-485) y se dejan fuera las banderas de cada borne, las
llamadas laterales y la leyenda. Ajustes:

  - los tornillos de bornera caen en una grilla de 57 unidades (20 px en la
    escena; data-grid en la raíz): L+ y M, 1M e I0.0-I0.7 arriba, el RS-485 en
    la parte baja de la caja y los ocho relés abajo (COM y NO de cada uno);
  - rótulos «serigrafía» (aprobados por JW Control, opción B): el nombre de
    cada borne en gris sobre la caja, del lado de adentro (los cables entran
    por el borde de afuera), y una franja del color de su función en la
    bornera: rojo L+, negro M y 1M, verde entradas, naranja relés, morado
    RS-485. El detalle va en el <title> de cada borne (se ve al pasar el mouse);
  - la pantalla queda negra con el área #tft de 320 x 170 para el framebuffer
    simulado, y cada tecla es un grupo #btn-* con data-btn.

Partes para la app (contrato con app/renderer/scene.js y app.js):
  raíz            data-grid="57" (unidades por paso de la grilla de la escena)
  .borne          data-bloque (sup-a, sup-b, med, inf-1 … inf-8), data-pos
                  (1 = izquierda), data-senal, data-entrada (y del borde por
                  donde entra el cable) y <title>; dentro, <use href="#tornillo-borne" x y>
  .led-ancla      punto del LED de estado de cada entrada (I0_n) y relé (Q0_n)
  #tft            área de la pantalla (320 x 170)
  #btn-up …       teclas (class tecla, data-btn BTN_UP … BTN_OK)
  #rj45, #usb     conectores

Uso: gen_jwplc_basic.py <svg de la web> <salida.svg>
"""
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
s = open(SRC).read()
els = [m.group(0) for m in re.finditer(r'<(rect|circle|line|text|polyline|path|g)\b([^>]*?)(/>|>(.*?)</\1>)', s, re.S)]
assert len(els) == 351, f"el SVG de la web cambió de estructura ({len(els)} elementos)"
assert "Pantalla a color" in s and 'fill="#7ed98a"' in s

F = 'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"'
U = 57                          # paso de la grilla (20 px en la escena)
VX, VY, VW, VH = 421, 403, 23 * U, 27 * U
YT, YM, YB = 460, 1486, 1828    # filas de tornillos: arriba, RS-485, abajo
TOP_A = [934, 991]
TOP_B = [1105 + U * i for i in range(9)]
MED = [1105 + U * i for i in range(4)]
BOT = [649 + 114 * k + d for k in range(8) for d in (0, U)]
for x in TOP_A + TOP_B + MED + BOT:
    assert (x - VX) % U == 0
for y in (YT, YM, YB):
    assert (y - VY) % U == 0

COL = {"pwr": "#e53935", "gnd": "#1a1a1a", "in": "#7cb342", "out": "#f57c00", "rs": "#8e44ad"}
SILK = "#b7bcc2"


def el(i):
    return els[i]


def attr(e, k):
    return float(re.search(rf'\s{k}="([-\d.]+)"', e).group(1))


p = ['<?xml version="1.0" encoding="UTF-8"?>',
     '<!--\n  SPDX-FileCopyrightText: 2026 JW Control\n  SPDX-License-Identifier: CC-BY-SA-4.0\n\n'
     '  JWPLC Basic, vista frontal (dibujo de bornes de la web de JW Control con\n'
     '  rótulos de serigrafía). Generado por docs/simbolos/herramientas/gen_jwplc_basic.py:\n'
     '  no editar a mano. Contrato con la app: ver el encabezado del generador.\n-->',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VX} {VY} {VW} {VH}" width="{VW}" height="{VH}" data-grid="{U}" role="img" aria-label="JWPLC Basic">',
     '<defs><g id="tornillo-borne"><circle r="22" fill="#e6e6e6" stroke="#8c8c8c" stroke-width="3"/>'
     '<line x1="-14" y1="14" x2="14" y2="-14" stroke="#9e9e9e" stroke-width="4"/></g></defs>']

# ---------------------------------------------------------------- caja
lower = el(65).replace('height="378.0"', f'height="{YB - 58 - 1380 + 1:.1f}"')   # baja hasta las borneras de relé
p += [lower, el(66)]
p += [el(i) for i in range(67, 80)]            # tornillos de la caja y «BASIC»
# pantalla: marco negro y el área de 320 x 170 del framebuffer
scr = el(80)
sx, sy, sw, sh = (attr(scr, k) for k in ("x", "y", "width", "height"))
th = sw * 170 / 320
p.append(scr)
p.append(f'<rect id="tft" x="{sx:.1f}" y="{sy + (sh - th) / 2:.2f}" width="{sw:.1f}" height="{th:.2f}" fill="#000"/>')
# botonera: cada tecla en su grupo
KEYS = [("btn-up", "BTN_UP", (130, 131)), ("btn-down", "BTN_DOWN", (132, 133)), ("btn-left", "BTN_LEFT", (134, 135)),
        ("btn-right", "BTN_RIGHT", (136, 137)), ("btn-esc", "BTN_ESC", (138, 139, 140)), ("btn-ok", "BTN_OK", (141, 142))]
for gid, btn, idx in KEYS:
    p.append(f'<g id="{gid}" class="tecla" data-btn="{btn}">' + "".join(el(i) for i in idx) + "</g>")
p += [el(i) for i in range(143, 149)]          # zumbador y logo JW Control
p.append('<g id="rj45">' + el(149) + el(150) + "</g>")
p.append('<g id="usb">' + el(160) + el(161) + "</g>")

# ---------------------------------------------------------------- borneras
def block(x0, x1, y0, h=116):
    return f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{h}" rx="4" fill="#7ed98a" stroke="#3f9a4c" stroke-width="3"/>'


def stripe(x, y, col):
    return f'<rect x="{x - 24}" y="{y}" width="48" height="7" rx="2" fill="{col}"/>'


def silk(x, y, txt, size=22, weight=600):
    return f'<text x="{x}" y="{y}" text-anchor="middle" {F} font-size="{size}" font-weight="{weight}" fill="{SILK}">{txt}</text>'


def borne(bloque, pos, senal, x, y, entrada, titulo):
    return (f'<g class="borne" data-bloque="{bloque}" data-pos="{pos}" data-senal="{senal}" data-entrada="{entrada}">'
            f'<title>{titulo}</title><use href="#tornillo-borne" x="{x}" y="{y}"/></g>')


def led(senal, x, y):
    return f'<circle class="led-ancla" data-senal="{senal}" cx="{x}" cy="{y}" r="12" fill="#24272b" stroke="#16181b" stroke-width="2"/>'


bt, bb = YT - 58, YT + 58          # bornera superior: 402 a 518
p.append(block(TOP_A[0] - 28, TOP_A[1] + 27, bt))
p.append(block(TOP_B[0] - 29, TOP_B[-1] + 29, bt))
TOP = [("sup-a", 1, "24VDC", "L+", "pwr", "L+ · alimentación 24 VDC"), ("sup-a", 2, "M0", "M", "gnd", "M · 0 V de la alimentación"),
       ("sup-b", 1, "M1", "1M", "gnd", "1M · común de las entradas (0 V)")] + \
      [("sup-b", i + 2, f"I0_{i}", f"I0.{i}", "in", f"I0.{i} · entrada digital 24 VDC") for i in range(8)]
for (bl, pos, sig, name, col, tit), x in zip(TOP, TOP_A + TOP_B):
    p.append(stripe(x, bb - 9, COL[col]))
    p.append(silk(x, bb + 30, name))
    p.append(borne(bl, pos, sig, x, YT, bt, tit))
    if sig.startswith("I0_"):
        p.append(led(sig, x, bb + 58))
# RS-485 (parte baja de la caja)
mt = YM - 57
p.append(block(MED[0] - 28, MED[-1] + 28, mt, 115))
for i, (sig, name, tit) in enumerate([("RS485_GND", "GND", "GND · común del RS-485"), ("RS485_A", "A", "A (D+) · RS-485"),
                                      ("RS485_B", "B", "B (D−) · RS-485"), ("RS485_SHIELD", "SH", "SHIELD · malla del cable RS-485")]):
    x = MED[i]
    p.append(stripe(x, mt + 115 - 9, COL["gnd" if i == 0 else "rs"]))
    p.append(silk(x, mt + 115 + 28, name, 20))
    p.append(borne("med", i + 1, sig, x, YM, mt, tit))
# relés: un bloque de dos bornes por salida (COM y NO)
ft = YB - 58
for k in range(8):
    x1, x2 = BOT[2 * k], BOT[2 * k + 1]
    p.append(block(x1 - 27, x1 + 85, ft))
    for pos, x, name in ((1, x1, "COM"), (2, x2, "NO")):
        p.append(stripe(x, ft + 2, COL["out"]))
        p.append(silk(x, ft - 12, name, 17))
        p.append(borne(f"inf-{k + 1}", pos, f"Q0_{k}", x, YB, YB + 58, f"Q0.{k} {name} · salida a relé (contacto {'común' if pos == 1 else 'normalmente abierto'})"))
    p.append(silk((x1 + x2) / 2, ft - 40, f"Q0.{k}", 22, 700))
    p.append(led(f"Q0_{k}", (x1 + x2) / 2, ft - 82))

p.append("</svg>")
open(OUT, "w").write("\n".join(p) + "\n")
print(f"{OUT}: viewBox {VX} {VY} {VW} {VH}, grilla {U}")
