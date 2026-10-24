"""Piezas comunes de la familia 22 mm de JWPLC Sim (escala 4 px/mm).

xb2_*  : familia metalica tipo Schneider XB2 / CHINT NP2 (aro cromado, base de
         zamak con tornillos de fijacion, bloques traseros con bornes). 160x240.
ad16_* : pilotos/zumbadores monobloque tipo AD16-22 (cuerpo plastico, bornes
         atras). 120x200.
Todos los ids llevan el prefijo PFX-, que se reemplaza por uno propio del tipo.
"""
INK = "#16181b"
F = 'font-family="sans-serif"'

DEFS = [
    '<linearGradient id="PFX-zmk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b6f72"/><stop offset=".5" stop-color="#4a4d50"/><stop offset="1" stop-color="#36383b"/></linearGradient>',
    '<linearGradient id="PFX-chr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfdfd"/><stop offset=".3" stop-color="#c9ced3"/><stop offset=".55" stop-color="#7f8790"/><stop offset=".75" stop-color="#eef0f2"/><stop offset="1" stop-color="#8a9199"/></linearGradient>',
    '<linearGradient id="PFX-brs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9cf95"/><stop offset="1" stop-color="#9c7a3c"/></linearGradient>',
    '<linearGradient id="PFX-scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#a5acb4"/></linearGradient>',
    '<linearGradient id="PFX-blk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1e21"/><stop offset=".35" stop-color="#3a3e44"/><stop offset="1" stop-color="#202226"/></linearGradient>',
    '<radialGradient id="PFX-off" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>',
    '<radialGradient id="PFX-on" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".45"/><stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></radialGradient>',
    '<radialGradient id="PFX-burn" cx=".55" cy=".5" r=".6"><stop offset="0" stop-color="#1a1410" stop-opacity=".9"/><stop offset=".6" stop-color="#2b211a" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>',
    '<radialGradient id="PFX-dome" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>',
    '<linearGradient id="PFX-knob" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4f56"/><stop offset=".5" stop-color="#25282c"/><stop offset="1" stop-color="#121315"/></linearGradient>',
]


def header(comment, w, h):
    return ['<?xml version="1.0" encoding="UTF-8"?>', f'<!-- {comment} -->',
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">', '<defs>', *DEFS, '</defs>']


def finish(p, prefix):
    p.append('</svg>')
    return "\n".join(p).replace("PFX-", prefix + "-") + "\n"


def term(cx, cy, r=10.0, metal="scr"):
    return (f'<rect x="{cx-r-3}" y="{cy-r-3}" width="{2*r+6}" height="{2*r+6}" rx="2" fill="#aab0b7" stroke="{INK}" stroke-width="1.1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-{metal})" stroke="{INK}" stroke-width="1.3"/>'
            f'<path d="M{cx-r*.55:.1f} {cy}H{cx+r*.55:.1f}M{cx} {cy-r*.55:.1f}V{cy+r*.55:.1f}" stroke="{INK}" stroke-width="2.3" stroke-linecap="round"/>')


def jw_term(name, cx, cy):
    return f'<circle class="jw-term" data-term="{name}" cx="{cx}" cy="{cy}" r="11"/>'


# ---------------------------------------------------------------- XB2 160x240
XW, XH, XC, XY = 160, 240, 80, 120


def xb2_blocks(blocks):
    """blocks: lista de (borne_arriba, borne_abajo, marca, color_marca)."""
    p = []
    xs = [80] if len(blocks) == 1 else [60, 100]
    bw = 52 if len(blocks) == 1 else 36
    r = 10.0 if len(blocks) == 1 else 8.5
    for i, ((t1, t2, tag, col), bx) in enumerate(zip(blocks, xs)):
        p.append(f'<rect x="{bx-bw/2}" y="1" width="{bw}" height="{XH-2}" rx="3" fill="url(#PFX-blk)" stroke="{INK}" stroke-width="1.6"/>')
        p.append(f'<rect x="{bx-6}" y="1" width="12" height="3" fill="#000"/><rect x="{bx-6}" y="{XH-4}" width="12" height="3" fill="#000"/>')
        p += [term(bx, 17, r), term(bx, XH - 17, r), jw_term(t1, bx, 17), jw_term(t2, bx, XH - 17)]
        left = i == 0
        lx, anc = (bx - bw / 2 - 4, "end") if left else (bx + bw / 2 + 4, "start")
        p.append(f'<text x="{lx}" y="12" text-anchor="{anc}" {F} font-size="9" font-weight="700" fill="{INK}">{t1}</text>')
        p.append(f'<text x="{lx}" y="22" text-anchor="{anc}" {F} font-size="7" font-weight="800" fill="{col}">{tag}</text>')
        p.append(f'<text x="{lx}" y="{XH-13}" text-anchor="{anc}" {F} font-size="9" font-weight="700" fill="{INK}">{t2}</text>')
    return p


def xb2_base(top_text="", bottom_text="", top_data_text=None):
    base = "M24 34 H136 V58 H144 V70 H136 V170 H144 V182 H136 V206 H24 V182 H16 V170 H24 V70 H16 V58 H24 Z"
    p = [f'<path d="{base}" transform="translate(0 2)" fill="#000" opacity=".25"/>',
         f'<path d="{base}" fill="url(#PFX-zmk)" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>',
         '<path d="M25 36 H135" stroke="#8d9194" stroke-width="1.5"/>',
         f'<circle cx="36" cy="48" r="6" fill="#0f1012" stroke="{INK}"/><circle cx="124" cy="192" r="6" fill="#0f1012" stroke="{INK}"/>',
         f'<rect x="122" y="26" width="12" height="8" rx="1.5" fill="url(#PFX-brs)" stroke="{INK}"/><line x1="128" y1="27" x2="128" y2="33" stroke="#3a2c14" stroke-width="1.6"/>',
         f'<rect x="26" y="206" width="12" height="8" rx="1.5" fill="url(#PFX-brs)" stroke="{INK}"/><line x1="32" y1="207" x2="32" y2="213" stroke="#3a2c14" stroke-width="1.6"/>']
    dt = f' data-text="{top_data_text}"' if top_data_text else ""
    if top_text or dt:
        p.append(f'<text x="{XC}" y="50" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd1"{dt}>{top_text}</text>')
    if bottom_text:
        p.append(f'<text x="{XC}" y="198" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#c9cdd1">{bottom_text}</text>')
    return p


def xb2_bezel(inner="#0d0e10"):
    return [f'<circle cx="{XC}" cy="{XY+2}" r="62" fill="#000" opacity=".3"/>',
            f'<circle cx="{XC}" cy="{XY}" r="62" fill="url(#PFX-chr)" stroke="{INK}" stroke-width="1.4"/>',
            f'<circle cx="{XC}" cy="{XY}" r="56.5" fill="{inner}"/>']


def lens(cx, cy, r, rings=True):
    """Lente de piloto: color + difusor + estados apagado/encendido/quemado."""
    p = [f'<circle data-fill="param.color" fill="#2fbf5a" cx="{cx}" cy="{cy}" r="{r}"/>']
    if rings:
        p.append("".join(f'<circle cx="{cx}" cy="{cy}" r="{k*r:.1f}" fill="none" stroke="#fff" stroke-width="1" opacity=".16"/>' for k in (.25, .47, .69, .89)))
    p += [f'<circle data-show="!out.lit" cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-off)"/>',
          f'<circle data-show="!out.lit" cx="{cx}" cy="{cy}" r="{r*.13:.1f}" fill="#000" opacity=".25"/>',
          f'<circle data-show="out.lit" cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-on)"/>',
          '<g data-show="damaged">',
          f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#PFX-burn)"/>',
          f'<path d="M{cx-r*.11:.1f} {cy-r*.73:.1f} L{cx+r*.07:.1f} {cy-r*.25:.1f} L{cx-r*.15:.1f} {cy+r*.11:.1f} L{cx+r*.18:.1f} {cy+r*.62:.1f}M{cx-r*.15:.1f} {cy+r*.11:.1f} L{cx-r*.55:.1f} {cy+r*.33:.1f}" fill="none" stroke="#d9d2c5" stroke-width="1.3" opacity=".7"/>',
          '</g>',
          f'<path d="M{cx-r*.84:.1f} {cy-r*.33:.1f} A{r*.9:.1f} {r*.9:.1f} 0 0 1 {cx-r*.25:.1f} {cy-r*.87:.1f}" fill="none" stroke="#fff" stroke-width="2" opacity=".35" stroke-linecap="round"/>']
    return p


def halo(cx, cy, r):
    return ['<g data-show="out.lit">',
            f'<circle data-fill="param.color" fill="#2fbf5a" cx="{cx}" cy="{cy}" r="{r+16}" opacity=".18"/>',
            f'<circle data-fill="param.color" fill="#2fbf5a" cx="{cx}" cy="{cy}" r="{r+8}" opacity=".3"/>', '</g>']


# --------------------------------------------------------------- AD16 120x200
AW, AH, AC, AY = 120, 200, 60, 100


def ad16_back(t1, t2, l1, l2, c1="#59606a", c2="#59606a", AC=AC):
    """Cuerpo roscado de 22 mm (plastico) detras, con las dos placas de borne."""
    p = [f'<rect x="{AC-22}" y="1" width="44" height="{AH-2}" rx="4" fill="url(#PFX-blk)" stroke="{INK}" stroke-width="1.6"/>']
    for cy in (17, AH - 17):
        p.append(f'<rect x="{AC-15}" y="{cy-14}" width="30" height="28" rx="2" fill="#c3c8ce" stroke="{INK}" stroke-width="1.1"/>')
        p.append(term(AC, cy, 9.0))
    p.append(f'<rect x="{AC-6}" y="1" width="12" height="3" fill="#000"/><rect x="{AC-6}" y="{AH-4}" width="12" height="3" fill="#000"/>')
    p += [jw_term(t1, AC, 17), jw_term(t2, AC, AH - 17)]
    p.append(f'<text x="{AC-26}" y="15" text-anchor="end" {F} font-size="9" font-weight="700" fill="{c1}">{l1}</text>')
    p.append(f'<text x="{AC-26}" y="{AH-11}" text-anchor="end" {F} font-size="9" font-weight="700" fill="{c2}">{l2}</text>')
    return p
