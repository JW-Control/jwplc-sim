"""Pulsador NA v5 (JWPLC Sim). Pulsador modular tipo XB2 / CHINT NP2-BA:
  frente  = cabeza + aro cromado, sujetos a la base metalica (ZB2-BZ101) con
            dos tornillos de fijacion (NO son bornes);
  espalda = bloque de contactos negro intercambiable (ZB2-BE101 NO 3-4 /
            ZB2-BE102 NC 1-2), con un borne de tornillo en cada extremo.
Vista frontal con el dispositivo girado 90 grados (como puede montarse en la
puerta) para que los extremos del bloque queden arriba y abajo: el bloque
asoma por detras de la base y sus bornes caen en la grilla (x=80).
Escala 4 px/mm; base ~36 x 48 mm (estimada de fotos), aro ~35 mm.
"""
import sys, os

OUT = sys.argv[1]
BLOCKS = sys.argv[2].split("-")
NAME = sys.argv[3]
INK = "#16181b"
W, H, CX, CY = 160, 240, 80, 120
F = 'font-family="sans-serif"'


def term(cx, cy, r=10):
    r = float(r)
    return (f'<rect x="{cx-r-3}" y="{cy-r-3}" width="{2*r+6}" height="{2*r+6}" rx="2" fill="#aab0b7" stroke="{INK}" stroke-width="1.1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1.3"/>'
            f'<path d="M{cx-5.5} {cy}H{cx+5.5}M{cx} {cy-5.5}V{cy+5.5}" stroke="{INK}" stroke-width="2.3" stroke-linecap="round"/>')


def fix_screw(x, y, up):
    """Tornillo de fijacion de la base (laton), visto de costado en el canto."""
    d = -1 if up else 1
    y2 = y + d * 8
    return (f'<rect x="{x-6}" y="{min(y, y2)}" width="12" height="8" rx="1.5" fill="url(#PFX-brs)" stroke="{INK}" stroke-width="1"/>'
            f'<line x1="{x}" y1="{min(y, y2)+1}" x2="{x}" y2="{max(y, y2)-1}" stroke="#3a2c14" stroke-width="1.6"/>')


p = ['<?xml version="1.0" encoding="UTF-8"?>',
     '<!-- Pulsador NA 22 mm modular (tipo Schneider XB2-BA + ZB2-BE101 / CHINT NP2-BA + NP2-BE101). Vista frontal girada 90 grados. Escala 4 px/mm. -->',
     f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">',
     '<defs>',
     '<linearGradient id="PFX-zmk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b6f72"/><stop offset=".5" stop-color="#4a4d50"/><stop offset="1" stop-color="#36383b"/></linearGradient>',
     '<linearGradient id="PFX-chr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfdfd"/><stop offset=".3" stop-color="#c9ced3"/><stop offset=".55" stop-color="#7f8790"/><stop offset=".75" stop-color="#eef0f2"/><stop offset="1" stop-color="#8a9199"/></linearGradient>',
     '<linearGradient id="PFX-brs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9cf95"/><stop offset="1" stop-color="#9c7a3c"/></linearGradient>',
     '<linearGradient id="PFX-scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#a5acb4"/></linearGradient>',
     '<linearGradient id="PFX-blk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1e21"/><stop offset=".35" stop-color="#3a3e44"/><stop offset="1" stop-color="#202226"/></linearGradient>',
     '<radialGradient id="PFX-mat" cx=".5" cy=".45" r=".55"><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>',
     '<radialGradient id="PFX-sun" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>',
     '</defs>']

# --- Espalda: bloques de contactos (detras de la base, asoman por sus extremos)
NUM = {"NO": ("3", "4"), "NC": ("1", "2")}
IEC = {"NO": ("3", "4"), "NC": ("1", "2")}
xs = [80] if len(BLOCKS) == 1 else [60, 100]
bw = 52 if len(BLOCKS) == 1 else 36
for i, (kind, bx) in enumerate(zip(BLOCKS, xs)):
    t1, t2 = f"{i+1}{IEC[kind][0]}", f"{i+1}{IEC[kind][1]}"
    p.append(f'<rect x="{bx-bw/2}" y="1" width="{bw}" height="{H-2}" rx="3" fill="url(#PFX-blk)" stroke="{INK}" stroke-width="1.6"/>')
    p.append(f'<rect x="{bx-6}" y="1" width="12" height="3" fill="#000"/><rect x="{bx-6}" y="{H-4}" width="12" height="3" fill="#000"/>')
    r = 10 if len(BLOCKS) == 1 else 8.5
    p.append(term(bx, 17, r))
    p.append(term(bx, H - 17, r))
    p.append(f'<circle class="jw-term" data-term="{t1}" cx="{bx}" cy="17" r="11"/>')
    p.append(f'<circle class="jw-term" data-term="{t2}" cx="{bx}" cy="{H-17}" r="11"/>')
    left = (i == 0)
    lx = bx - bw/2 - 4 if left else bx + bw/2 + 4
    anc = "end" if left else "start"
    p.append(f'<text x="{lx}" y="12" text-anchor="{anc}" {F} font-size="9" font-weight="700" fill="{INK}">{t1}</text>')
    p.append(f'<text x="{lx}" y="22" text-anchor="{anc}" {F} font-size="7" font-weight="800" fill="{"#2c8a4a" if kind=="NO" else "#c0392b"}">{kind}</text>')
    p.append(f'<text x="{lx}" y="{H-13}" text-anchor="{anc}" {F} font-size="9" font-weight="700" fill="{INK}">{t2}</text>')

# --- Frente: base metalica girada (vertical) con muescas y agujeros
base = ("M24 34 H136 V58 H144 V70 H136 V170 H144 V182 H136 V206 H24 V182 H16 V170 H24 V70 H16 V58 H24 Z")
p.append(f'<path d="{base}" transform="translate(0 2)" fill="#000" opacity=".25"/>')
p.append(f'<path d="{base}" fill="url(#PFX-zmk)" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>')
p.append('<path d="M25 36 H135" stroke="#8d9194" stroke-width="1.5"/>')
p.append(f'<circle cx="36" cy="48" r="6" fill="#0f1012" stroke="{INK}"/><circle cx="124" cy="192" r="6" fill="#0f1012" stroke="{INK}"/>')
# Tornillos de fijacion de la base (en los cantos, junto a los extremos del bloque)
p.append(fix_screw(128, 34, True))
p.append(fix_screw(32, 206, False))
# Numeros moldeados en la base que indican donde van los bornes del bloque
p.append(f'<text x="{CX}" y="50" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#b9bdc1">1 · 3</text>')
p.append(f'<text x="{CX}" y="198" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#b9bdc1">2 · 4</text>')

# --- Aro cromado delgado y cabeza rasante mate
p.append(f'<circle cx="{CX}" cy="{CY+2}" r="62" fill="#000" opacity=".3"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="62" fill="url(#PFX-chr)" stroke="{INK}" stroke-width="1.4"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="56.5" fill="#0d0e10"/>')
p.append('<g data-action="press" data-kind="momentary">')
p.append(f'<circle cx="{CX}" cy="{CY}" r="62" fill="#000" opacity="0"/>')
p.append('<g data-show="!out.pressed">')
p.append(f'<circle data-fill="param.color" fill="#2fbf5a" cx="{CX}" cy="{CY}" r="55"/>')
p.append(f'<circle cx="{CX}" cy="{CY}" r="55" fill="url(#PFX-mat)"/>')
p.append(f'<path d="M{CX-48} {CY-20} A52 52 0 0 1 {CX-14} {CY-51}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".2"/>')
p.append('</g>')
p.append('<g data-show="out.pressed">')
p.append(f'<circle data-fill="param.color" fill="#2fbf5a" cx="{CX}" cy="{CY+1}" r="53"/>')
p.append(f'<circle cx="{CX}" cy="{CY+1}" r="53" fill="url(#PFX-sun)"/>')
p.append('</g>')
p.append('</g>')
p.append('</svg>')

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, NAME), "w").write("\n".join(p).replace("PFX-", "pb" + "".join(BLOCKS).lower() + "-") + "\n")
print("ok")
