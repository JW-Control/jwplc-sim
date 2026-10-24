"""Red 230 VAC como interruptor termomagnetico 2P CHINT NXB-63 C16 (vista frontal).

Escala 4 px/mm. Modulo DIN de 18 mm por polo: cuerpo 36 x 81 mm (144 x 324 px)
dentro de un viewBox de 160 x 340. Los bornes de salida (2/L y 4/N) quedan
abajo en x = 40 y 120 (multiplos de 20; el centro real de cada polo esta a
1 mm). Arriba entra la red (cables marron y azul, no cableables).

Estados (lineamientos 2.5): en servicio la palanca esta arriba y el indicador
de posicion de contactos se ve rojo (ON); disparada, la palanca baja y el
indicador se ve verde (OFF), como en el equipo real.

Uso: python3 gen_red230_nxb63.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

W, H = 160, 340
X0, X1 = 8, 152          # cuerpo: 36 mm
PL, PN = 40, 120         # bornes (polo L y polo N)
P = "power-230vac"

p = header("Red 230 VAC: interruptor termomagnetico 2P CHINT NXB-63 C16 (36 x 81 mm). Vista frontal. Escala 4 px/mm.", W, H)
# Gradientes propios: plastico blanco, palanca y sombra de los alveolos.
p.insert(-1, '<linearGradient id="PFX-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6d9dc"/><stop offset=".12" stop-color="#f3f4f5"/><stop offset=".88" stop-color="#f3f4f5"/><stop offset="1" stop-color="#cfd3d7"/></linearGradient>')
p.insert(-1, '<linearGradient id="PFX-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset="1" stop-color="#e8eaec"/></linearGradient>')
p.insert(-1, '<linearGradient id="PFX-lev" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2d31"/><stop offset=".45" stop-color="#4b5056"/><stop offset="1" stop-color="#1d1f22"/></linearGradient>')
p.insert(-1, '<linearGradient id="PFX-hole" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3e43"/><stop offset="1" stop-color="#16181b"/></linearGradient>')


def screw(cx, cy, r=9.5):
    """Tornillo Pozidriv en su alveolo (borne de caja)."""
    return (f'<rect x="{cx-15}" y="{cy-15}" width="30" height="30" rx="3" fill="url(#PFX-hole)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-scr)" stroke="{INK}" stroke-width="1.3"/>'
            f'<path d="M{cx-r*.55:.1f} {cy}H{cx+r*.55:.1f}M{cx} {cy-r*.55:.1f}V{cy+r*.55:.1f}" stroke="{INK}" stroke-width="2.3" stroke-linecap="round"/>'
            f'<path d="M{cx-r*.3:.1f} {cy-r*.3:.1f}L{cx+r*.3:.1f} {cy+r*.3:.1f}M{cx+r*.3:.1f} {cy-r*.3:.1f}L{cx-r*.3:.1f} {cy+r*.3:.1f}" stroke="{INK}" stroke-width=".9" opacity=".6"/>')


# Sombra y cuerpo (zonas de bornes arriba y abajo, frente elevado al medio).
p.append(f'<rect x="{X0}" y="10" width="{X1-X0}" height="{H-14}" rx="4" fill="#000" opacity=".22"/>')
p.append(f'<rect x="{X0}" y="8" width="{X1-X0}" height="{H-14}" rx="4" fill="url(#PFX-body)" stroke="{INK}" stroke-width="1.6"/>')
p.append(f'<line x1="80" y1="9" x2="80" y2="{H-7}" stroke="#9aa0a6" stroke-width="1.2"/>')  # union de los dos modulos
p.append(f'<rect x="{X0+2}" y="86" width="{X1-X0-4}" height="168" rx="3" fill="url(#PFX-face)" stroke="#8d939a" stroke-width="1.2"/>')

# Entrada de la red (arriba): cables marron (L) y azul (N) con su terminal.
for cx, col in ((PL, "#7a4a22"), (PN, "#2f62d6")):
    p.append(screw(cx, 44))
    p.append(f'<rect x="{cx-4}" y="0" width="8" height="34" fill="{col}" stroke="{INK}" stroke-width=".8"/>')
    p.append(f'<rect x="{cx-6}" y="22" width="12" height="12" rx="2" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
p.append(f'<text x="{PL-22}" y="44" text-anchor="end" {F} font-size="9" font-weight="700" fill="{INK}">1</text>')
p.append(f'<text x="{PN+22}" y="44" text-anchor="start" {F} font-size="9" font-weight="700" fill="{INK}">3</text>')

# Frente impreso: hueco del logo (sin archivo oficial de CHINT), modelo y datos.
p.append(f'<g id="{P}-logo"></g>')
p.append(f'<text x="80" y="104" text-anchor="middle" {F} font-size="11" font-weight="800" fill="{INK}">NXB-63</text>')
p.append(f'<text x="44" y="126" text-anchor="middle" {F} font-size="16" font-weight="800" fill="{INK}">C16</text>')
p.append(f'<rect x="96" y="111" width="38" height="18" fill="none" stroke="{INK}" stroke-width="1.1"/>')
p.append(f'<text x="115" y="124" text-anchor="middle" {F} font-size="10" font-weight="700" fill="{INK}">6000</text>')
p.append(f'<text x="80" y="242" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#3c4146">230/400V~  IEC/EN 60898-1</text>')

# Indicador de posicion de los contactos (uno por polo): rojo = cerrado.
for cx in (44, 116):
    p.append(f'<rect x="{cx-9}" y="136" width="18" height="9" rx="1.5" fill="#1d1f22"/>')
    p.append(f'<rect data-show="!tripped" x="{cx-7}" y="137.5" width="14" height="6" fill="#e0392b"/>')
    p.append(f'<rect data-show="tripped" x="{cx-7}" y="137.5" width="14" height="6" fill="#2fae4f"/>')

# Palanca (dos manijas unidas por un puente): arriba ON / I, abajo OFF / O.
p.append(f'<text x="80" y="160" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#c62f24">I  ON</text>')
p.append(f'<text x="80" y="234" text-anchor="middle" {F} font-size="8" font-weight="800" fill="#2a8f45">O  OFF</text>')
for cx in (44, 116):
    p.append(f'<rect x="{cx-16}" y="166" width="32" height="56" rx="4" fill="url(#PFX-hole)" stroke="{INK}" stroke-width="1"/>')


def lever(y):
    s = []
    for cx in (44, 116):
        s.append(f'<rect x="{cx-12}" y="{y}" width="24" height="26" rx="3" fill="url(#PFX-lev)" stroke="{INK}" stroke-width="1.2"/>')
        s.append("".join(f'<line x1="{cx-8}" y1="{y+6+4*k}" x2="{cx+8}" y2="{y+6+4*k}" stroke="#6c7278" stroke-width="1"/>' for k in range(4)))
    s.append(f'<rect x="56" y="{y+9}" width="48" height="8" rx="2" fill="url(#PFX-lev)" stroke="{INK}" stroke-width="1"/>')
    return s


p.append('<g data-show="!tripped">')
p += lever(169)
p.append('</g><g data-show="tripped">')
p += lever(193)
p.append('</g>')

# Salida (abajo): 2/L y 4/N, con la boca del borne en el borde inferior.
for cx, num, tag, col in ((PL, "2", "L", "#7a4a22"), (PN, "4", "N", "#2f62d6")):
    p.append(screw(cx, 296))
    p.append(f'<rect x="{cx-6}" y="{H-6}" width="12" height="6" fill="#16181b"/>')
    p.append(jw_term(tag, cx, 296))
    side = -1 if cx == PL else 1
    anc = "end" if side < 0 else "start"
    p.append(f'<text x="{cx+22*side}" y="292" text-anchor="{anc}" {F} font-size="9" font-weight="700" fill="{INK}">{num}</text>')
    p.append(f'<text x="{cx+22*side}" y="304" text-anchor="{anc}" {F} font-size="9" font-weight="800" fill="{col}">{tag}</text>')

out = finish(p, P)
with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(out)
