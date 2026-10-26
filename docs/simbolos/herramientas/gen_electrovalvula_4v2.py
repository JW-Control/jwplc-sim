"""Electrovalvulas Airtac 4V210-08 / 4V220-08 con cilindro Airtac MBL20x100-CA, vista frontal.

Referencias entregadas por JW Control (26/10/2026): fotos de la 4V210-08
(bobina AC220V con conector negro y DC24V con conector traslucido), fotos del
MBL y los catalogos de Airtac 4V200 (p. "Dimensiones", 4V210 y 4V220 con
conector DIN) y MBL/MBLC (p. 339). Medidas usadas (mm):

    4V210-08   5/2 monoestable (retorno por resorte): largo 117 (tapa 5,
               placa 53, piloto 23, bobina 36), alto 35, 67 hasta el conector
    4V220-08   5/2 biestable (doble solenoide, con memoria): largo 171
               (bobina 36, piloto 23, placa 53, piloto 23, bobina 36)
               A y B arriba, R P S abajo (1/4" en A, B y P; 1/8" en R y S)
    MBL20-CA   A = 131 + carrera, AC = 70 + carrera, AB = 40, MB = 21,
               tapas AD = 15,5 de Ø27, vastago Ø8 (rosca M8x1,25, EA = 20),
               rosca frontal M22x1,5 (DA = 26) con tuerca G = 29 (GA = 7),
               puertos 1/8" a PA = 7,5 de cada extremo, oreja trasera con
               agujero Ø8

Escala de campo: 2 px/mm (la mitad de la de tablero; lineamientos 2.3).

Disposicion: el cilindro arriba, con los puertos hacia el frente (como en la
foto) y la valvula abajo. Mangueras de PU azul Ø6: A al puerto trasero y B al
delantero (P->A: el cilindro sale; P->B: entra). La manguera con presion se
dibuja azul intenso y la que descarga, palida. Silenciadores de bronce
sinterizado en R y S; la alimentacion entra por P desde abajo.

4V210: el conector DIN se dibuja girado 180 grados (prensaestopas a la
derecha; el real admite montarse asi) para que el cable baje a los bornes sin
cruzar las mangueras. Bornes A1/A2 (hilos 1 y 2), bocas en x = 420 y 460.
4V220: bobina A+ a la derecha (P->A, sale) y A- a la izquierda (P->B, entra),
cada una con su conector y su cable: bornes A-1/A-2 en x = 40 y 80 y
A+1/A+2 en x = 520 y 560.

Estados: LED de cada conector (traslucido) encendido con su bobina; mangueras
segun la corredera (out.energized en la 4V210, out.spoolA en la 4V220);
vastago con data-translate (100 mm = 200 px); bobina cortada (damaged):
hollin sobre las bobinas y los conectores, LED apagado. Los textos de las
bobinas siguen a param.coil (24VDC o 230VAC).

Uso: python3 gen_electrovalvula_4v2.py 4v210|4v220 <salida.svg>
"""
import sys

from fam22 import F, INK, header, finish, jw_term

MODEL = sys.argv[1] if len(sys.argv) > 1 else "4v210"
BI = MODEL == "4v220"
P = "solenoid-valve-2" if BI else "solenoid-valve"
W, H = 720, 380


def mm(v):
    return v * 2


p = header(f"Electrovalvula Airtac {'4V220-08 (5/2 biestable, doble solenoide' if BI else '4V210-08 (5/2 monoestable'}, conector DIN) con cilindro Airtac MBL20x100-CA, vista frontal segun fotos y catalogos del fabricante. Escala de campo 2 px/mm.", W, H)
for d in (
    '<linearGradient id="PFX-alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1a8"/><stop offset=".2" stop-color="#f1f3f5"/><stop offset=".45" stop-color="#d3d8dd"/><stop offset=".8" stop-color="#a7aeb5"/><stop offset="1" stop-color="#6e757c"/></linearGradient>',
    '<linearGradient id="PFX-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9b0b6"/><stop offset=".25" stop-color="#eceff2"/><stop offset=".55" stop-color="#d7dbdf"/><stop offset=".85" stop-color="#b0b6bc"/><stop offset="1" stop-color="#80878e"/></linearGradient>',
    '<linearGradient id="PFX-rod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7b838b"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".55" stop-color="#c4cad0"/><stop offset="1" stop-color="#5f666d"/></linearGradient>',
    '<linearGradient id="PFX-nut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f969d"/><stop offset=".3" stop-color="#e9ecef"/><stop offset=".6" stop-color="#b3bac1"/><stop offset="1" stop-color="#5d646b"/></linearGradient>',
    '<linearGradient id="PFX-blkv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4046"/><stop offset=".3" stop-color="#25282c"/><stop offset="1" stop-color="#101113"/></linearGradient>',
    '<linearGradient id="PFX-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f1ec"/><stop offset="1" stop-color="#d9dad3"/></linearGradient>',
    '<linearGradient id="PFX-din" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5f66" stop-opacity=".92"/><stop offset=".5" stop-color="#2e3237" stop-opacity=".88"/><stop offset="1" stop-color="#1a1c1f" stop-opacity=".95"/></linearGradient>',
    '<linearGradient id="PFX-brz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6a3a"/><stop offset=".4" stop-color="#d2b27a"/><stop offset="1" stop-color="#7a5a2c"/></linearGradient>',
    '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".4" stop-color="#ffb020"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="PFX-soot" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#140f0b" stop-opacity=".92"/><stop offset=".6" stop-color="#2a2019" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>',
    '<pattern id="PFX-sint" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#b8955c"/><circle cx="1" cy="1" r=".7" fill="#7a5a2c"/><circle cx="2.4" cy="2.2" r=".5" fill="#e0c48f"/></pattern>',
):
    p.insert(-1, d)

# ================================================================ cilindro MBL20 x 100 (CA)
CY = 56
X_RE = 40                      # extremo trasero (oreja)
X_RC = X_RE + mm(21)           # tapa trasera, cara exterior: 82
X_FC = X_RC + mm(70 + 100)     # tapa delantera, cara exterior: 422
AD = mm(15.5)                  # largo de cada tapa: 31
X_TIP = X_FC + mm(40)          # punta del vastago retraido (AB = 40): 502
STROKE = mm(100)               # 200 px
PORT_R, PORT_F = X_RC + mm(7.5), X_FC - mm(7.5)   # 97 y 407

# --- vastago (se dibuja primero: el cuerpo lo tapa cuando entra)
p.append(f'<g data-translate="out.position:0:1:x:{STROKE}">')
ROD0 = X_TIP - mm(40) - STROKE
p.append(f'<rect x="{ROD0}" y="{CY - mm(4)}" width="{X_TIP - ROD0}" height="{mm(8)}" fill="url(#PFX-rod)" stroke="#4b5157" stroke-width=".9"/>')
# rosca M8 en los ultimos 20 mm
TH0 = X_TIP - mm(20)
x = TH0 + 1
while x < X_TIP - 1:
    p.append(f'<line x1="{x:.1f}" y1="{CY - mm(4) + 1}" x2="{x + 1.6:.1f}" y2="{CY + mm(4) - 1}" stroke="#59606a" stroke-width=".8"/>')
    x += mm(1.25)
p.append(f'<rect x="{X_TIP - 2}" y="{CY - mm(4) + 1}" width="2" height="{mm(8) - 2}" fill="#8f969d"/>')
# tuerca del vastago M8 (13 entre caras, 6 de espesor)
RN = TH0 + 4
p.append(f'<rect x="{RN}" y="{CY - mm(7.5)}" width="{mm(6)}" height="{mm(15)}" rx="1.5" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width=".9"/>')
for f in (-.28, .28):
    p.append(f'<line x1="{RN}" y1="{CY + f * mm(15):.1f}" x2="{RN + mm(6)}" y2="{CY + f * mm(15):.1f}" stroke="#5d646b" stroke-width=".8"/>')
p.append('</g>')

# --- rosca frontal M22 x 1,5 (DA = 26) y tuerca de 29 entre caras (GA = 7)
p.append(f'<rect x="{X_FC}" y="{CY - mm(11)}" width="{mm(26)}" height="{mm(22)}" fill="url(#PFX-rod)" stroke="#4b5157" stroke-width=".9"/>')
x = X_FC + mm(7) + 2
while x < X_FC + mm(26) - 1:
    p.append(f'<line x1="{x:.1f}" y1="{CY - mm(11) + 1}" x2="{x + 2:.1f}" y2="{CY + mm(11) - 1}" stroke="#5d646b" stroke-width=".9"/>')
    x += mm(1.5)
NX = X_FC + 2
p.append(f'<rect x="{NX}" y="{CY - mm(16.7)}" width="{mm(7)}" height="{mm(33.4)}" rx="2" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width="1"/>')
for f in (-.25, .25):
    p.append(f'<line x1="{NX}" y1="{CY + f * mm(33.4):.1f}" x2="{NX + mm(7)}" y2="{CY + f * mm(33.4):.1f}" stroke="#5d646b" stroke-width=".9"/>')


# --- tapas, camisa y oreja trasera
def cover(x0, port):
    s = [f'<rect x="{x0}" y="{CY - mm(13.5)}" width="{AD}" height="{mm(27)}" rx="3" fill="url(#PFX-alu)" stroke="#4f565c" stroke-width="1"/>',
         f'<line x1="{x0 + 2}" y1="{CY - mm(13.5) + 4}" x2="{x0 + AD - 2}" y2="{CY - mm(13.5) + 4}" stroke="#fff" stroke-width="1.4" opacity=".7"/>']
    return s


p += cover(X_RC, PORT_R)
p += cover(X_FC - AD, PORT_F)
BX0, BX1 = X_RC + AD, X_FC - AD
p.append(f'<rect x="{BX0 - 2}" y="{CY - mm(12.5)}" width="{BX1 - BX0 + 4}" height="{mm(25)}" fill="url(#PFX-bar)" stroke="#5d646b" stroke-width="1"/>')
# rebordes donde la camisa se engasta en las tapas
for xx in (BX0 + 5, BX1 - 5):
    p.append(f'<line x1="{xx}" y1="{CY - mm(12.5) + 1}" x2="{xx}" y2="{CY + mm(12.5) - 1}" stroke="#8f969d" stroke-width="1.6"/>')
# etiqueta de la camisa
LX0, LW = (BX0 + BX1) / 2 - 60, 120
p.append(f'<rect x="{LX0}" y="{CY - 15}" width="{LW}" height="30" rx="1.5" fill="#fbfbfb" stroke="#c9cdd2" stroke-width=".7"/>')
p.append(f'<text x="{LX0 + 6}" y="{CY - 3}" {F} font-size="11" font-weight="900" font-style="italic" fill="#1f5fc8">AirTAC</text>')
p.append(f'<text x="{LX0 + 56}" y="{CY - 3}" {F} font-size="8" font-weight="700" fill="#38b2a6">CYLINDER</text>')
p.append(f'<text x="{LX0 + 6}" y="{CY + 10}" {F} font-size="7.5" fill="#2b2f35">MODEL: MBL20X100CA</text>')
# oreja trasera (CA): espiga roscada con agujero transversal de Ø8
p.append(f'<rect x="{X_RE}" y="{CY - mm(9)}" width="{X_RC - X_RE + 2}" height="{mm(18)}" rx="2" fill="url(#PFX-rod)" stroke="#4b5157" stroke-width=".9"/>')
x = X_RE + mm(13)
while x < X_RC - 1:
    p.append(f'<line x1="{x:.1f}" y1="{CY - mm(9) + 1}" x2="{x + 2:.1f}" y2="{CY + mm(9) - 1}" stroke="#5d646b" stroke-width=".9"/>')
    x += mm(1.5)
p.append(f'<circle cx="{X_RE + mm(6)}" cy="{CY}" r="{mm(4)}" fill="#1d2023" stroke="#4b5157" stroke-width="1"/>')
p.append(f'<circle cx="{X_RE + mm(6) - 1.5}" cy="{CY - 1.5}" r="{mm(4) - 3}" fill="#2f3439"/>')
# eje
p.append(f'<line x1="{X_RE - 10}" y1="{CY}" x2="{X_RE}" y2="{CY}" stroke="#8a9099" stroke-width="1" stroke-dasharray="6 3 1.5 3"/>')


# --- mangueras (detras de los racores): A al puerto trasero, B al delantero
def hose(path, live_expr=None):
    s = [f'<path d="{path}" fill="none" stroke="#1a3a66" stroke-width="{mm(6) + 2}" stroke-linejoin="round"/>']
    if live_expr is None:   # siempre con presion (alimentacion)
        s.append(f'<path d="{path}" fill="none" stroke="#1f6fe0" stroke-width="{mm(6) - 1}"/>'
                 f'<path d="{path}" fill="none" stroke="#9cc7ff" stroke-width="2" stroke-dasharray="10 8"/>')
        return s
    s.append(f'<g data-show="{live_expr}"><path d="{path}" fill="none" stroke="#1f6fe0" stroke-width="{mm(6) - 1}" stroke-linejoin="round"/>'
             f'<path d="{path}" fill="none" stroke="#9cc7ff" stroke-width="2" stroke-dasharray="10 8" stroke-linejoin="round"/></g>')
    s.append(f'<g data-show="!{live_expr}"><path d="{path}" fill="none" stroke="#7fa6d6" stroke-width="{mm(6) - 1}" stroke-linejoin="round"/></g>')
    s.append(f'<path d="{path}" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".35" transform="translate(-3 0)" stroke-linejoin="round"/>')
    return s


def rounded(points, r=12):
    """Polilinea ortogonal con esquinas redondeadas."""
    d = f"M{points[0][0]} {points[0][1]}"
    for i in range(1, len(points) - 1):
        (x0, y0), (x1, y1), (x2, y2) = points[i - 1], points[i], points[i + 1]
        dx0, dy0 = (x1 - x0), (y1 - y0)
        dx1, dy1 = (x2 - x1), (y2 - y1)
        l0, l1 = abs(dx0) + abs(dy0), abs(dx1) + abs(dy1)
        a = (x1 - dx0 / l0 * r, y1 - dy0 / l0 * r)
        b = (x1 + dx1 / l1 * r, y1 + dy1 / l1 * r)
        d += f" L{a[0]:.1f} {a[1]:.1f} Q{x1} {y1} {b[0]:.1f} {b[1]:.1f}"
    d += f" L{points[-1][0]} {points[-1][1]}"
    return d




# racor rapido: cuerpo niquelado y aro azul (codo en los puertos del cilindro)
def fitting_cyl(x):
    return (f'<circle cx="{x}" cy="{CY}" r="10" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width="1"/>'
            f'<circle cx="{x}" cy="{CY}" r="7" fill="#2f86e8" stroke="#16467e" stroke-width="1"/>'
            f'<circle cx="{x}" cy="{CY}" r="3.5" fill="#0d2c55"/>')




def fitting_up(x, y_face, up=True):
    sgn = -1 if up else 1
    y1 = y_face + sgn * 6
    s = [f'<rect x="{x - 8}" y="{min(y_face, y1)}" width="16" height="6" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width=".8"/>']
    y2 = y1 + sgn * 8
    s.append(f'<rect x="{x - 9}" y="{min(y1, y2)}" width="18" height="8" rx="1.5" fill="#2f86e8" stroke="#16467e" stroke-width=".9"/>')
    return s


# ================================================================ valvula
# Tramos de izquierda a derecha (mm): tapa o bobina, piloto, placa, piloto, bobina.
SEGS = [("coil", 36), ("pilot", 23), ("plate", 53), ("pilot", 23), ("coil", 36)] if BI else [("cap", 5), ("plate", 53), ("pilot", 23), ("coil", 36)]
VL, VT = (100 if BI else 120), 210
VB = VT + mm(35)               # 280
X = [VL]
for _, w in SEGS:
    X.append(X[-1] + mm(w))
VR = X[-1]
X_PLATE = X[[k for k, _ in SEGS].index("plate")]
PA_, PB_ = X_PLATE + mm(16.5), X_PLATE + mm(38)                   # A y B (arriba)
PR_, PP_, PS_ = X_PLATE + mm(8), X_PLATE + mm(27), X_PLATE + mm(45.5)   # R, P y S (abajo)
FIT_TOP = VT - 14
LIVE_A = "out.spoolA" if BI else "out.energized"
CT, CB = VT - 2, VB + 2
DT = VB - mm(67)               # techo del conector: 146

# --- mangueras (detras de los racores) y racores del cilindro
p += hose(rounded([(PA_, FIT_TOP), (PA_, 132), (PORT_R, 132), (PORT_R, CY + 6)]), LIVE_A)
p += hose(rounded([(PB_, FIT_TOP), (PB_, 112), (PORT_F, 112), (PORT_F, CY + 6)]), "!" + LIVE_A)
p += hose(f"M{PP_} {VB + 14} V{H}")
p += [fitting_cyl(PORT_R), fitting_cyl(PORT_F)]

# --- cuerpo
p.append(f'<rect x="{VL + 2}" y="{VT + 4}" width="{VR - VL}" height="{VB - VT}" rx="4" fill="#000" opacity=".25"/>')


def plate(x0, x1):
    s = [f'<rect x="{x0}" y="{VT}" width="{x1 - x0}" height="{VB - VT}" fill="url(#PFX-plate)" stroke="#8f948c" stroke-width="1"/>',
         f'<rect x="{x1 - 16}" y="{VT + 1}" width="12" height="6" fill="#c9cbc4"/>',
         f'<text x="{PA_}" y="{VT + 11}" text-anchor="middle" font-family="serif" font-size="8" fill="#2b2f35">A</text>',
         f'<text x="{PB_}" y="{VT + 11}" text-anchor="middle" font-family="serif" font-size="8" fill="#2b2f35">B</text>',
         f'<circle cx="{(PA_ + PB_) / 2}" cy="{VT + 8}" r="2.6" fill="#9aa0a6" stroke="#3f454b" stroke-width=".6"/>',
         f'<text x="{x0 + 6}" y="{VT + 24}" {F} font-size="11" font-weight="900" font-style="italic" fill="#1f5fc8">AirTAC</text>',
         f'<text x="{x0 + 61}" y="{VT + 23}" font-family="serif" font-size="6.5" fill="#1f5fc8">VALVE</text>',
         f'<line x1="{x0 + 5}" y1="{VT + 28}" x2="{x1 - 8}" y2="{VT + 28}" stroke="#e46a2c" stroke-width="1.2"/>',
         f'<text x="{x0 + 6}" y="{VT + 37}" font-family="serif" font-size="7" fill="#2b2f35">Model: {"4V220-08" if BI else "4V210-08"}</text>',
         f'<text x="{x0 + 6}" y="{VT + 46}" font-family="serif" font-size="6" fill="#2b2f35">0.15~0.8MPa</text>']
    # simbolo 5/2 impreso: resorte o solenoide | dos cuadros | solenoide
    sx, sy = x0 + 62, VT + 39
    left = f'<rect x="{sx - 5}" y="{sy + 1.5}" width="5" height="4"/>' if BI else f'<path d="M{sx} {sy + 3.5}l-2 -2l-2 4l-2 -4l-1 2"/>'
    s.append(f'<g stroke="#2b2f35" stroke-width=".7" fill="none"><rect x="{sx}" y="{sy}" width="11" height="7"/><rect x="{sx + 11}" y="{sy}" width="11" height="7"/>'
             f'{left}<rect x="{sx + 22}" y="{sy + 1.5}" width="5" height="4"/>'
             f'<path d="M{sx + 2} {sy + 7}l7 -7M{sx + 13} {sy}l7 7M{sx + 13} {sy + 7}l7 -7"/></g>')
    for t, x in (("R", PR_), ("P", PP_), ("S", PS_)):
        s.append(f'<text x="{x + (-9 if t == "R" else 9 if t == "S" else 0)}" y="{VB - 4}" text-anchor="middle" font-family="serif" font-size="8" fill="#2b2f35">{t}</text>')
    for x in (PP_ - 10, PP_ + 10):
        s.append(f'<circle cx="{x}" cy="{VB - 16}" r="3.4" fill="#4b5057" stroke="#2b2f35" stroke-width=".6"/>')
    return s


def pilot(x0, x1):
    mo = (x0 + x1) / 2 + 3
    return [f'<rect x="{x0}" y="{VT}" width="{x1 - x0}" height="{VB - VT}" fill="url(#PFX-blkv)" stroke="#000" stroke-width="1"/>',
            f'<rect x="{mo - 5}" y="{VT - 6}" width="10" height="7" rx="2" fill="#e8262c" stroke="#7a1014" stroke-width=".8"/>',
            f'<rect x="{mo - 3}" y="{VT - 5}" width="4" height="2" rx="1" fill="#ff8a8e" opacity=".8"/>']


LINES = {
    "24VDC": ("DC24V  3.0W", "Voltage range:", "DC21.6V~26.4V", "100%ED"),
    "230VAC": ("AC220V  4.5VA", "Voltage range:", "AC187V~253V", "50/60Hz"),
}


def coil(x0, x1, right, led):
    """Bobina con su conector DIN; right: el pilot queda a la izquierda y el extremo libre a la derecha."""
    s = []
    inner = x0 if right else x1                 # lado del piloto
    outer = x1 if right else x0                 # extremo libre
    sg = 1 if right else -1
    # placa de sujecion (plateada) del lado del piloto
    s.append(f'<rect x="{inner - 3 if right else inner - 2}" y="{VT - 2}" width="5" height="{VB - VT + 4}" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width=".7"/>')
    c0, c1 = (x0 + 2, x1) if right else (x0, x1 - 2)
    s.append(f'<rect x="{c0}" y="{CT}" width="{c1 - c0}" height="{CB - CT}" rx="5" fill="url(#PFX-blkv)" stroke="#000" stroke-width="1"/>')
    # tuerca moleteada en el extremo libre
    nx = outer - 2 if right else outer - 10
    s.append(f'<rect x="{nx}" y="{(VT + VB) / 2 - 14}" width="12" height="28" rx="3" fill="#202326" stroke="#000" stroke-width=".8"/>')
    for k in range(5):
        yy = (VT + VB) / 2 - 11 + k * 5.5
        s.append(f'<line x1="{nx + 2}" y1="{yy}" x2="{nx + 11}" y2="{yy}" stroke="#4b5057" stroke-width="1.2"/>')
    # impresion vertical: como en la foto, la primera linea es la columna de la derecha
    tx = c0 + 8
    for cv, ls in LINES.items():
        s.append(f'<g data-show="param.coil={cv}">')
        for i, t in enumerate(ls):
            s.append(f'<text transform="translate({tx + (4 - i) * 11} {CT + 6}) rotate(90)" {F} font-size="8" font-weight="700" fill="#e8eaed">{t}</text>')
        s.append('</g>')
    s.append(f'<text transform="translate({tx} {CT + 6}) rotate(90)" {F} font-size="8" font-weight="700" fill="#e8eaed">IP65</text>')
    s.append(f'<text x="{tx + 4}" y="{CB - 8}" text-anchor="middle" {F} font-size="11" font-weight="700" fill="#e8eaed">CE</text>')
    # conector DIN traslucido; el prensaestopas mira hacia el extremo libre
    d0, d1 = (c0, c1 - 4) if right else (c0 + 4, c1)
    s.append(f'<rect x="{d0}" y="{DT}" width="{d1 - d0}" height="{CT - DT + 6}" rx="5" fill="url(#PFX-din)" stroke="#0b0c0e" stroke-width="1"/>')
    s.append(f'<rect x="{d0 + 8}" y="{DT + 8}" width="{d1 - d0 - 16}" height="{CT - DT - 16}" rx="4" fill="none" stroke="#6b7179" stroke-width="1.2" opacity=".8"/>')
    s.append(f'<text x="{(d0 + d1) / 2}" y="{DT + 32}" text-anchor="middle" {F} font-size="9" font-weight="900" font-style="italic" fill="#777d85" opacity=".9">AirTAC</text>')
    for yy in (DT + 16, DT + 20, DT + 44):
        s.append(f'<line x1="{d0 + 16}" y1="{yy}" x2="{d1 - 16}" y2="{yy}" stroke="#6b7179" stroke-width="1.2" opacity=".7"/>')
    lx, ly = (d0 + 14 if right else d1 - 14), CT - 6
    s.append(f'<g data-show="!{led}"><circle cx="{lx}" cy="{ly}" r="3" fill="#5a3a12" stroke="#000" stroke-width=".5"/></g>')
    s.append(f'<g data-show="{led}"><circle cx="{lx}" cy="{ly}" r="13" fill="url(#PFX-led)"/><circle cx="{lx}" cy="{ly}" r="3.2" fill="#ffd36b"/>'
             f'<rect x="{d0 + 2}" y="{DT + 2}" width="{d1 - d0 - 4}" height="{CT - DT}" rx="4" fill="#ffb020" opacity=".12"/></g>')
    gy = DT + 20
    g0 = d1 - 2 if right else d0 - 16           # cuerpo del prensaestopas
    k0 = d1 + 14 if right else d0 - 26          # tuerca
    s.append(f'<rect x="{g0}" y="{gy - 13}" width="18" height="26" rx="3" fill="url(#PFX-blkv)" stroke="#000" stroke-width="1"/>')
    s.append(f'<rect x="{k0}" y="{gy - 11}" width="12" height="22" rx="4" fill="#202326" stroke="#000" stroke-width="1"/>')
    for k in range(4):
        s.append(f'<line x1="{k0 + 2 + k * 2.6:.1f}" y1="{gy - 10}" x2="{k0 + 2 + k * 2.6:.1f}" y2="{gy + 10}" stroke="#3c4046" stroke-width="1"/>')
    gland_end = k0 + 12 if right else k0
    return s, gland_end, gy, (c0, c1)


coils = []
for (kind, _), x0, x1 in zip(SEGS, X, X[1:]):
    if kind == "cap":
        p.append(f'<rect x="{x0}" y="{VT + 2}" width="{x1 - x0 + 4}" height="{VB - VT - 4}" rx="3" fill="url(#PFX-blkv)" stroke="#000" stroke-width="1"/>')
        p.append(f'<circle cx="{x0 + 4}" cy="{VB - 4}" r="3.2" fill="url(#PFX-nut)" stroke="#3f454b" stroke-width=".7"/>')
    elif kind == "plate":
        p += plate(x0, x1)
    elif kind == "pilot":
        p += pilot(x0, x1)
    else:
        right = x0 > X_PLATE
        led = ("out.coilPlus" if right else "out.coilMinus") if BI else "out.energized"
        s, gend, gy, span = coil(x0, x1, right, led)
        p += s
        coils.append((right, gend, gy, span))

# --- daño: hollin sobre las bobinas y los conectores
p.append('<g data-show="damaged">')
for right, gend, gy, (c0, c1) in coils:
    p.append(f'<ellipse cx="{(c0 + c1) / 2}" cy="{(DT + CB) / 2 + 10}" rx="{(c1 - c0) / 2 + 18}" ry="{(CB - DT) / 2 + 6}" fill="url(#PFX-soot)"/>'
             f'<path d="M{c0 + 12} {DT + 4} q8 10 0 18 q-6 8 4 16" fill="none" stroke="#120c08" stroke-width="3" opacity=".8"/>')
cx_dmg = (coils[-1][3][0] + coils[-1][3][1]) / 2
p.append(f'<text x="{cx_dmg}" y="{CB + 16}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#e05a4a">{"BOBINAS CORTADAS" if BI else "BOBINA CORTADA"}</text></g>')

# ================================================================ racores y silenciadores
p += fitting_up(PA_, VT)
p += fitting_up(PB_, VT)
p += fitting_up(PP_, VB, up=False)
for x in (PR_, PS_):
    p.append(f'<rect x="{x - 6}" y="{VB}" width="12" height="5" fill="url(#PFX-brz)" stroke="#5a4020" stroke-width=".7"/>')
    p.append(f'<rect x="{x - 8}" y="{VB + 5}" width="16" height="6" rx="1" fill="url(#PFX-brz)" stroke="#5a4020" stroke-width=".7"/>')
    p.append(f'<path d="M{x - 9} {VB + 11} H{x + 9} V{VB + 34} Q{x} {VB + 40} {x - 9} {VB + 34} Z" fill="url(#PFX-sint)" stroke="#5a4020" stroke-width=".8"/>')
p.append(f'<text x="{PP_ + 12}" y="{H - 10}" {F} font-size="9" font-weight="700" fill="#4a90e2">P · aire 0,15–0,8 MPa</text>')

# ================================================================ cables de los conectores y bornes
SPLIT_Y = 300


def cable(gend, gy, col, wires, tag):
    """Cable desde el prensaestopas hasta la columna col; abre dos hilos a las bocas."""
    s = []
    jacket = rounded([(gend, gy), (col, gy), (col, SPLIT_Y)], r=16)
    s.append(f'<path d="{jacket}" fill="none" stroke="#0c0d0f" stroke-width="13" stroke-linecap="round"/>')
    s.append(f'<path d="{jacket}" fill="none" stroke="#33373d" stroke-width="9" stroke-linecap="round"/>')
    mid = (wires[0][0] + wires[1][0]) / 2
    for x, term, n in wires:
        path = f"M{col + (x - mid) * .1:.1f} {SPLIT_Y} C{col} {SPLIT_Y + 18} {x} {SPLIT_Y + 8} {x} {SPLIT_Y + 30} V{H - 14}"
        s.append(f'<path d="{path}" fill="none" stroke="#6b737c" stroke-width="5"/>')
        s.append(f'<path d="{path}" fill="none" stroke="#1b1d20" stroke-width="3.4"/>')
        s.append(f'<rect x="{x - 6}" y="{H - 52}" width="12" height="10" rx="2" fill="#f4f5f7" stroke="#8a9099" stroke-width=".6"/>')
        s.append(f'<text x="{x}" y="{H - 44}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}">{n}</text>')
        s.append(f'<rect x="{x - 4}" y="{H - 24}" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
        s.append(f'<rect x="{x - 5}" y="{H - 4}" width="10" height="4" fill="#16181b"/>')
        s.append(f'<text x="{x + 8}" y="{H - 28}" {F} font-size="10" font-weight="800" fill="#e8eaed">{term}</text>')
        s.append(jw_term(term, x, H - 18))
    s.append(f'<rect x="{col - 11}" y="{SPLIT_Y - 6}" width="22" height="8" rx="2" fill="#0c0d0f"/>')
    if tag:
        # marcador del cable con la funcion de la bobina
        s.append(f'<rect x="{col - 14}" y="{SPLIT_Y - 44}" width="28" height="16" rx="3" fill="#f2c230" stroke="#8a6d10" stroke-width=".8"/>'
                 f'<text x="{col}" y="{SPLIT_Y - 32}" text-anchor="middle" {F} font-size="10" font-weight="900" fill="{INK}">{tag}</text>')
    return s


for right, gend, gy, _ in coils:
    if not BI:
        p += cable(gend, gy, 400, ((420, "A1", "1"), (460, "A2", "2")), None)
    elif right:
        p += cable(gend, gy, 500, ((520, "A+1", "1"), (560, "A+2", "2")), "A+")
    else:
        p += cable(gend, gy, 60, ((40, "A-1", "1"), (80, "A-2", "2")), "A−")

with open(sys.argv[2] if len(sys.argv) > 2 else f"{P}.svg", "w", encoding="utf-8") as f:
    f.write(finish(p, P))
print("ok")
