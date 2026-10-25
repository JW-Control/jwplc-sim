"""Bloque de planta: tanque fermentador de café (jwsim/fermentador 2.0).

Esquema de proceso, no vista frontal de un equipo: muestra lo que trae el
bloque de fábrica y deja afuera, en la regleta de bornes de abajo, solo lo que
se cablea al tablero.

  - Terma solar de 80 L (izquierda) con su temperatura.
  - Ida de agua caliente por la electroválvula Y1 al serpentín del tanque;
    retorno por la bomba M1 y el flujostato FS1 a la terma. Las cañerías se
    pintan calientes cuando hay flujo.
  - Tanque con el mosto (líquido) y la masa (granos); serpentín de cobre que
    se ve con agua caliente mientras está lleno.
  - Recirculación de mosto: salida por el fondo, bomba M2, entrada por arriba.
  - Sonda PT100 de la masa (vaina por el costado) y electrodo de pH con ATC
    (por arriba): sus cables sí bajan dibujados hasta la regleta, porque son
    los que se llevan a los transmisores.
  - Visor con T masa, T mosto, pH, terma, llenado del serpentín y tiempo.

Bornes abajo (lado b), cx múltiplo de 20, agrupados con su rótulo:
Y1 (A1 A2), M1 (U1 U2), M2 (U1 U2), FS1 (C NA), PT100 (R R B) y
pH + T mosto (pH REF T T).

Uso: python3 gen_fermentador.py <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, term, jw_term

P = "fermentador"
W, H = 920, 620
STRIP = 500                 # comienzo de la regleta
TY = 578                    # tornillos de la regleta
HOT, COLD = "#d9472b", "#8a929c"
COPPER = "#b5651d"
OK, OFF = "#2fbf5a", "#c9ced4"

# Bornes: (id, x, rótulo corto); grupos: (rótulo, x0, x1).
TERMS = [
    ("Y1_A1", 40, "A1"), ("Y1_A2", 80, "A2"),
    ("M1_U1", 140, "U1"), ("M1_U2", 180, "U2"),
    ("M2_U1", 240, "U1"), ("M2_U2", 280, "U2"),
    ("FS_C", 340, "C"), ("FS_NO", 380, "NA"),
    ("TT_R1", 460, "R"), ("TT_R2", 500, "R"), ("TT_R3", 540, "B"),
    ("AT_PH", 640, "pH"), ("AT_REF", 680, "REF"), ("AT_T1", 720, "T"), ("AT_T2", 760, "T"),
]
GROUPS = [("Y1 VÁLVULA", 40, 80), ("M1 RETORNO", 140, 180), ("M2 MOSTO", 240, 280),
          ("FS1 FLUJO", 340, 380), ("PT100 MASA", 460, 540), ("pH + T MOSTO", 640, 760)]


def text(x, y, s, size=9, weight=700, fill=INK, anchor="middle", extra=""):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" {F} font-size="{size}" font-weight="{weight}" fill="{fill}" {extra}>{s}</text>'


def pipe(d, flow="out.flujo"):
    """Cañería: gris sin flujo, roja con flujo."""
    return [f'<path d="{d}" fill="none" stroke="{COLD}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" data-show="!{flow}"/>',
            f'<path d="{d}" fill="none" stroke="{HOT}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" data-show="{flow}"/>',
            f'<path d="{d}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1" stroke-linejoin="round"/>']


def pump(cx, cy, out, tag, name):
    p = [f'<circle cx="{cx}" cy="{cy}" r="22" fill="{OFF}" stroke="{INK}" stroke-width="2" data-show="!{out}"/>',
         f'<circle cx="{cx}" cy="{cy}" r="22" fill="{OK}" stroke="{INK}" stroke-width="2" data-show="{out}"/>',
         f'<g data-spin="{out}:{cx}:{cy}:2">']
    for a in (0, 120, 240):
        p.append(f'<path d="M{cx} {cy} L{cx} {cy-17} A6 6 0 0 1 {cx+7} {cy-12} Z" fill="{INK}" transform="rotate({a} {cx} {cy})"/>')
    p += ['</g>', f'<circle cx="{cx}" cy="{cy}" r="4" fill="#f4f5f7" stroke="{INK}"/>',
          text(cx, cy + 36, tag, 11, 800), text(cx, cy + 47, name, 7, 700, "#59606a")]
    return p


def readout(y, label, expr):
    x0, w = 790, 116
    return [f'<rect x="{x0}" y="{y}" width="{w}" height="40" rx="4" fill="#15181c" stroke="{INK}"/>',
            text(x0 + 8, y + 13, label, 7.5, 800, "#8fa3b8", "start"),
            text(x0 + w - 8, y + 33, "—", 15, 800, "#e9f7ee", "end", f'data-text="{expr}"')]


p = header("Bloque de planta: fermentador de café con terma solar, Y1, M1, M2, FS1, PT100 y electrodo de pH. "
           "Generado por docs/simbolos/herramientas/gen_fermentador.py.", W, H)
p.append(f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="10" fill="#eef1f4" stroke="{INK}" stroke-width="2"/>')
p.append(text(20, 26, "FERMENTADOR DE CAFÉ", 13, 800, INK, "start"))
p.append(text(20, 40, "bloque de planta · sin cablear al tablero", 8, 600, "#59606a", "start"))

# --- terma solar
p.append('<polygon points="34,58 150,58 168,104 52,104" fill="#1f4f8f" stroke="#0d2342" stroke-width="1.5"/>')
for i in range(1, 4):
    p.append(f'<line x1="{34+29*i}" y1="58" x2="{52+29*i}" y2="104" stroke="#6fa0d8" stroke-width="1"/>')
p.append('<line x1="43" y1="81" x2="159" y2="81" stroke="#6fa0d8" stroke-width="1"/>')
p.append(f'<path d="M100 104 V124" stroke="{INK}" stroke-width="2"/>')
p.append(f'<rect x="40" y="124" width="120" height="200" rx="44" fill="#d9dde2" stroke="{INK}" stroke-width="2"/>')
p.append('<rect x="46" y="200" width="108" height="118" rx="38" fill="#e46a4a" opacity=".22"/>')
p += [text(100, 168, "TERMA SOLAR", 9, 800), text(100, 182, "80 L", 8, 700, "#59606a"),
      text(100, 214, "—", 17, 800, INK, "middle", 'data-text="out.tTerma:d1:°C"')]

# --- ida: terma → Y1 → serpentín
p += pipe("M160 160 H380")
p.append('<polygon points="244,146 260,160 244,174" fill="' + OFF + '" stroke="' + INK + '" stroke-width="1.6" data-show="!out.valvula"/>')
p.append('<polygon points="276,146 260,160 276,174" fill="' + OFF + '" stroke="' + INK + '" stroke-width="1.6" data-show="!out.valvula"/>')
p.append('<polygon points="244,146 260,160 244,174" fill="' + OK + '" stroke="' + INK + '" stroke-width="1.6" data-show="out.valvula"/>')
p.append('<polygon points="276,146 260,160 276,174" fill="' + OK + '" stroke="' + INK + '" stroke-width="1.6" data-show="out.valvula"/>')
p.append(f'<path d="M260 160 V134" stroke="{INK}" stroke-width="2"/>')
p.append(f'<rect x="246" y="112" width="28" height="22" rx="2" fill="#3a3e44" stroke="{INK}"/>')
p += [text(260, 127, "Y1", 9, 800, "#f4f5f7"), text(260, 192, "VÁLVULA AGUA CALIENTE", 7, 700, "#59606a")]

# --- tanque
TANK = "M380 80 Q380 60 400 60 H620 Q640 60 640 80 V400 L522 444 H498 L380 400 Z"
p.append(f'<path d="{TANK}" fill="#dfe3e7" stroke="{INK}" stroke-width="2.4"/>')
p.append('<path d="M383 118 H637 V398 L521 441 H499 L383 398 Z" fill="#d8a24a" opacity=".55"/>')
for y in range(214, 400, 16):
    for x in range(396, 630, 20):
        dx = 10 if (y // 16) % 2 else 0
        cx = x + dx
        if cx > 628:
            continue
        p.append(f'<ellipse cx="{cx}" cy="{y}" rx="7" ry="4.5" fill="#6b3f1f" opacity=".85"/>')
p += [text(392, 138, "MOSTO", 8, 800, "#5a3a10", "start"), text(414, 206, "MASA", 8, 800, "#3a2410", "start")]
COIL = ("M380 175 H404 V232 H596 A15 15 0 0 1 596 262 H404 A15 15 0 0 0 404 292 H596 A15 15 0 0 1 596 322 "
        "H404 A15 15 0 0 0 404 352 H596 A11 11 0 0 1 596 374 H380")
p.append(f'<path d="{COIL}" fill="none" stroke="{COPPER}" stroke-width="6" stroke-linejoin="round"/>')
p.append(f'<path d="{COIL}" fill="none" stroke="{HOT}" stroke-width="3" stroke-linejoin="round" data-show="out.serpentin>0.05"/>')
p += [text(500, 226, "SERPENTÍN", 7, 800, "#5a3a10")]

# --- retorno: serpentín → M1 → FS1 → terma
p += pipe("M380 374 H322")
p += pipe("M278 374 H234")
p += pipe("M206 374 H100 V324")
p += pump(300, 374, "out.bombaRetorno", "M1", "BOMBA RETORNO")
p.append(text(300, 344, "EN SECO", 9, 800, "#d11a1a", "middle", 'data-show="out.bombaEnSeco"'))
p.append(f'<rect x="206" y="362" width="28" height="24" rx="3" fill="#f4f5f7" stroke="{INK}" stroke-width="1.6"/>')
p.append(f'<path d="M220 366 L228 380" stroke="{INK}" stroke-width="2"/>')
p.append(f'<circle cx="220" cy="352" r="5" fill="{OFF}" stroke="{INK}" data-show="!out.flujo"/>')
p.append(f'<circle cx="220" cy="352" r="5" fill="{OK}" stroke="{INK}" data-show="out.flujo"/>')
p += [text(220, 404, "FS1", 10, 800), text(220, 414, "FLUJOSTATO", 7, 700, "#59606a")]

# --- recirculación de mosto: fondo → M2 (junto al cono) → entra por arriba del costado
p += pipe("M510 444 V456 H656 V400 H678", "out.bombaMosto")
p += pipe("M722 400 H750 V96 H640", "out.bombaMosto")
p += pump(700, 400, "out.bombaMosto", "M2", "BOMBA MOSTO")

# --- sonda PT100 (masa) por el costado
p.append(f'<rect x="556" y="314" width="96" height="8" rx="4" fill="#c0c6cd" stroke="{INK}"/>')
p.append(f'<rect x="652" y="304" width="30" height="28" rx="3" fill="#3a3e44" stroke="{INK}"/>')
p += [text(667, 288, "PT100", 8, 800), text(667, 298, "T MASA", 7, 700, "#59606a")]
for k, (x, col) in enumerate(((460, "#c62828"), (500, "#c62828"), (540, "#f4f5f7"))):
    d = f"M{674 - 6 + 6 * k} 332 C{674 - 6 + 6 * k} 470 {x} 440 {x} {STRIP + 6}"
    p.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="4.5"/>')
    p.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2.8"/>')

# --- electrodo de pH con ATC por arriba
p.append(f'<rect x="580" y="36" width="20" height="26" rx="2" fill="#3a3e44" stroke="{INK}"/>')
p.append(f'<rect x="586" y="62" width="8" height="176" fill="#e8eef3" stroke="{INK}"/>')
p.append(f'<circle cx="590" cy="242" r="8" fill="#cfe6f7" stroke="{INK}"/>')
p += [text(574, 46, "pH + ATC", 8, 800, INK, "end"), text(574, 56, "T MOSTO", 7, 700, "#59606a", "end")]
for x, col in ((640, "#1b1d20"), (680, "#59606a"), (720, "#f4f5f7"), (760, "#f4f5f7")):
    d = f"M590 36 V28 H774 V{STRIP - 20} C774 {STRIP - 6} {x} {STRIP - 14} {x} {STRIP + 6}"
    p.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="4.5"/>')
    p.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2.8"/>')

# --- visor
p.append(text(848, 32, "VALORES", 8, 800, "#59606a"))
for i, (lab, ex) in enumerate((("T MASA", "out.tMasa:d1:°C"), ("T MOSTO", "out.tMosto:d1:°C"), ("pH", "out.ph:d2"),
                               ("TERMA", "out.tTerma:d1:°C"), ("SERPENTÍN", "out.serpentin:%"), ("TIEMPO", "out.horas:hm"))):
    p += readout(40 + 48 * i, lab, ex)

# --- regleta
p.append(f'<rect x="10" y="{STRIP}" width="{W-20}" height="{H-STRIP-10}" rx="4" fill="#c9ced4" stroke="{INK}" stroke-width="1.4"/>')
for lab, x0, x1 in GROUPS:
    p.append(f'<rect x="{x0-18}" y="{STRIP+8}" width="{x1-x0+36}" height="14" rx="2" fill="#3a3e44"/>')
    p.append(text((x0 + x1) / 2, STRIP + 18, lab, 8, 800, "#f4f5f7"))
for tid, x, lab in TERMS:
    p += [text(x, TY - 18, lab, 9, 800), term(x, TY, 9.0), jw_term(tid, x, TY)]

with open(sys.argv[1] if len(sys.argv) > 1 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(finish(p, P))
