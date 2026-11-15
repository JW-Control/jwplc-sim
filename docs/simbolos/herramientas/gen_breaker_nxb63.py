"""Interruptor termomagnetico CHINT NXB-63 de 1, 2 y 3 polos (jwsim/breaker).

Mismo frente que la red de 230 VAC (gen_red230_nxb63.py, foto de JW Control
del 26/10/2026), pero como equipo suelto: entrada 1/3/5 arriba y salida
2/4/6 abajo, las dos cableables. La palanca se acciona con un clic
(data-action="lever"). Estados como el equipo: cerrado, manijas arriba e
indicador rojo; abierto o disparado, manijas abajo e indicador verde. El
disparo, que el equipo no distingue de una apertura a mano, se avisa con un
rotulo (lineamientos 2.5). El calibre (C6, C16...) sigue a la curva y la
corriente nominal (out.rating).

Escala 4 px/mm, un modulo de 20 mm por polo (18 mm reales): viewBox
80 x 340 (1P), 160 x 340 (2P) y 240 x 340 (3P). Propuesta por aprobar.

Uso: python3 gen_breaker_nxb63.py <carpeta>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import F, INK, finish, header, jw_term  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
BLUE = "#2e7fd6"
TXT = "#3a3f45"
H = 340
Y0, Y1 = 8, 332


def screw(cx, cy):
    """Tornillo combinado (ranura + Pozidriv) galvanizado en su resalte redondo."""
    return (f'<circle cx="{cx}" cy="{cy}" r="17" fill="url(#PFX-boss)" stroke="#c4c9ce" stroke-width="1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="11.5" fill="url(#PFX-zinc)" stroke="#5f6f7d" stroke-width="1"/>'
            f'<path d="M{cx-7} {cy}H{cx+7}M{cx} {cy-7}V{cy+7}" stroke="#46525d" stroke-width="3" stroke-linecap="round"/>'
            f'<rect x="{cx-2.5}" y="{cy-2.5}" width="5" height="5" fill="#5b6873"/>')


def breaker(np):
    W = 80 * np
    poles = [40 + 80 * k for k in range(np)]
    p = header(f"Interruptor termomagnetico {np}P CHINT NXB-63 (curva y calibre segun parametros), vista frontal. Escala 4 px/mm. Propuesta por aprobar.", W, H)
    for d in (
        '<linearGradient id="PFX-wht" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6e8ea"/><stop offset=".1" stop-color="#fbfbfc"/><stop offset=".9" stop-color="#fbfbfc"/><stop offset="1" stop-color="#e2e5e8"/></linearGradient>',
        '<radialGradient id="PFX-boss" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#d9dde1"/><stop offset=".72" stop-color="#eef0f2"/><stop offset="1" stop-color="#ffffff"/></radialGradient>',
        '<linearGradient id="PFX-zinc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3ecf3"/><stop offset=".45" stop-color="#9fb2c2"/><stop offset=".7" stop-color="#cfdbe5"/><stop offset="1" stop-color="#7f93a4"/></linearGradient>',
        f'<linearGradient id="PFX-hdl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa0ea"/><stop offset="1" stop-color="{BLUE}"/></linearGradient>',
        '<linearGradient id="PFX-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f97e6"/><stop offset=".55" stop-color="#2f80d8"/><stop offset="1" stop-color="#2569b5"/></linearGradient>',
    ):
        p.insert(-1, d)
    p.append(f'<rect x="1" y="{Y0+2}" width="{W-2}" height="{Y1-Y0}" rx="5" fill="#000" opacity=".2"/>')
    for k in range(np):
        p.append(f'<rect x="{1 + 80*k}" y="{Y0}" width="78" height="{Y1-Y0}" rx="5" fill="url(#PFX-wht)" stroke="#9aa1a8" stroke-width="1.2"/>')
    for k in range(1, np):
        p.append(f'<rect x="{80*k - 1}" y="{Y0}" width="2" height="{Y1-Y0}" fill="#b9bfc5"/>')
    for y in (67, 265):
        p.append(f'<line x1="3" y1="{y}" x2="{W-3}" y2="{y}" stroke="#c9ced3" stroke-width="1.6"/>')
        p.append(f'<line x1="3" y1="{y+2}" x2="{W-3}" y2="{y+2}" stroke="#ffffff" stroke-width="1"/>')
    # Bornes: entrada arriba (1, 3, 5) y salida abajo (2, 4, 6), con su boca en el borde.
    for k, cx in enumerate(poles):
        top, bot = str(2 * k + 1), str(2 * k + 2)
        p.append(screw(cx, 32))
        p.append(f'<rect x="{cx-6}" y="0" width="12" height="8" fill="#16181b"/>')
        p.append(jw_term(top, cx, 32))
        p.append(f'<text x="{cx-28}" y="{36}" text-anchor="middle" {F} font-size="9" font-weight="700" fill="{TXT}">{top}</text>')
        p.append(screw(cx, 305))
        p.append(f'<rect x="{cx-6}" y="{H-8}" width="12" height="8" fill="#16181b"/>')
        p.append(jw_term(bot, cx, 305))
        p.append(f'<text x="{cx-28}" y="309" text-anchor="middle" {F} font-size="9" font-weight="700" fill="{TXT}">{bot}</text>')
    # Franja azul con el hueco del logo (sin archivo oficial).
    p.append(f'<path d="M5 72 H68 L76 80 V94 H5 Z" fill="{BLUE}"/>')
    p.append('<g id="breaker-logo"></g>')
    for k in range(1, np):
        p.append(f'<rect x="{5 + 80*k}" y="73" width="70" height="7" rx="1" fill="{BLUE}"/>')
    # Textos impresos del polo izquierdo; el calibre sigue a los parametros.
    p.append(f'<text x="7" y="112" {F} font-size="12.5" fill="{TXT}">NXB-63</text>')
    p.append(f'<text x="7" y="125" {F} font-size="12.5" fill="{TXT}" data-text="out.rating">C6</text>')
    p.append(f'<line x1="7" y1="128" x2="32" y2="128" stroke="{TXT}" stroke-width=".8"/>')
    for i, t in enumerate(("230/400V~", "50/60Hz", "6000A")):
        p.append(f'<text x="7" y="{136 + 8*i}" {F} font-size="7" fill="{TXT}">{t}</text>')
    p.append(f'<line x1="7" y1="154" x2="32" y2="154" stroke="{TXT}" stroke-width=".8"/>')
    p.append(f'<text x="7" y="162" {F} font-size="7" fill="{TXT}">IEC60898-1</text>')
    if np > 1:
        p.append(f'<text x="57" y="162" {F} font-size="7" fill="{TXT}">↕ I ON</text>')
        p.append(f'<text x="57" y="170" {F} font-size="7" fill="{TXT}">  O OFF</text>')
        for k in range(np):
            x = 112 + 14 * k + (66 if np == 3 else 0)
            a, b = str(2 * k + 1), str(2 * k + 2)
            p.append(f'<text x="{x-5}" y="146" {F} font-size="7" fill="{TXT}">{a}</text>')
            p.append(f'<text x="{x-5}" y="170" {F} font-size="7" fill="{TXT}">{b}</text>')
            p.append(f'<path d="M{x} 148 v4 l-3 3 m3 -3 m0 0 v2 q3 2 0 4 q-3 2 0 4 v3" fill="none" stroke="{TXT}" stroke-width=".9"/>')
    else:
        p.append(f'<text x="7" y="170" {F} font-size="7" fill="{TXT}">I ON · O OFF</text>')
    # Indicador de posicion de contactos: verde abierto, rojo cerrado.
    for cx in [x + 6 for x in poles]:
        p.append(f'<rect x="{cx-6}" y="124" width="12" height="8" rx="1.2" fill="#0e2a1c"/>')
        p.append(f'<rect data-show="!out.on" x="{cx-5}" y="125" width="10" height="6" fill="#1f7a4a"/>')
        p.append(f'<rect data-show="out.on" x="{cx-5}" y="125" width="10" height="6" fill="#d23a2c"/>')
    # Palanca: un clic la sube o la baja.
    p.append('<g data-action="lever" data-kind="toggle">')
    p.append(f'<rect x="3" y="176" width="{W-6}" height="88" fill="#eef0f2"/>')
    for cx in poles:
        p.append(f'<rect x="{cx-31}" y="177" width="11" height="86" rx="5" fill="#fbfbfc" stroke="#cfd4d9"/>')
        p.append(f'<rect x="{cx+20}" y="177" width="11" height="86" rx="5" fill="#fbfbfc" stroke="#cfd4d9"/>')
    p.append('<g data-show="out.on">')
    for cx in poles:
        p.append(f'<rect x="{cx-19}" y="200" width="38" height="58" rx="2" fill="url(#PFX-hdl)" stroke="#1f5ea6" stroke-width="1"/>')
        p.append(f'<rect x="{cx-19}" y="252" width="38" height="6" fill="#1e4f8a" opacity=".55"/>')
    p.append(f'<rect x="3" y="177" width="{W-6}" height="36" rx="4" fill="url(#PFX-bar)" stroke="#1f5ea6" stroke-width="1.2"/>')
    p.append(f'<line x1="8" y1="184" x2="{W-8}" y2="184" stroke="#8cc0f2" stroke-width="1"/>')
    for cx in poles:
        p.append(f'<rect x="{cx-6}" y="179" width="12" height="5" rx="1" fill="#163f6e"/>')
    p.append('</g><g data-show="!out.on">')
    for cx in poles:
        p.append(f'<rect x="{cx-19}" y="179" width="38" height="46" rx="2" fill="url(#PFX-hdl)" stroke="#1f5ea6" stroke-width="1"/>')
        p.append(f'<rect x="{cx-19}" y="179" width="38" height="5" fill="#1e4f8a" opacity=".45"/>')
    p.append(f'<rect x="3" y="222" width="{W-6}" height="40" rx="4" fill="url(#PFX-bar)" stroke="#1f5ea6" stroke-width="1.2"/>')
    p.append(f'<line x1="8" y1="229" x2="{W-8}" y2="229" stroke="#8cc0f2" stroke-width="1"/>')
    for cx in poles:
        p.append(f'<rect x="{cx-6}" y="251" width="12" height="5" rx="1" fill="#163f6e"/>')
    p.append('</g></g>')
    # Disparo (por sobrecarga o cortocircuito): rotulo sobre la palanca baja.
    p.append('<g data-show="out.tripped">')
    p.append(f'<rect x="6" y="190" width="{W-12}" height="18" rx="3" fill="#c0392b" stroke="#6e1a12" stroke-width="1"/>')
    p.append(f'<text x="{W/2}" y="203" text-anchor="middle" {F} font-size="10" font-weight="800" fill="#fff">DISPARÓ</text>')
    p.append('</g>')
    return finish(p, f"brk{np}")


for np, name in ((1, "breaker.svg"), (2, "breaker__2p.svg"), (3, "breaker__3p.svg")):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(breaker(np))
print("ok")
