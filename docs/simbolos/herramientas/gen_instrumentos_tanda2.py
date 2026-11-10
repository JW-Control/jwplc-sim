"""Catalogo, tanda 2 (propuesta del 10/11/2026, por aprobar): instrumentos.
Sin fotos propias todavia: aspecto y medidas de los catalogos; hay que
validarlos con fotos de JW Control (lineamientos 2.1).

  float-switch.svg     interruptor de nivel tipo pera (campo, 2 px/mm): cable
                       con contrapeso y la pera, colgando con el agua baja y
                       flotando con el agua alta; clic para subirla a mano.
                       Hilos BK, BN, BU arriba (van al tablero).
  level-electrodes.svg porta-electrodos de 3 varillas (campo, 2 px/mm): E1
                       corta (alto), E2 media (bajo), E3 larga (referencia);
                       el agua sube con el nivel (se arrastra sin tanque) y la
                       punta de cada varilla mojada se ve azul.
  level-relay.svg      rele de nivel por electrodos de riel DIN (tipo
                       Schneider RM4-LG01), como el temporizador: A1 E1 E2
                       arriba, A2 E3 11 12 14 abajo; LED U y R.
  pressure-switch.svg  presostato tipo Danfoss KP35 (2 px/mm): escala de
                       corte y diferencial, contacto 1-2-4 a la vista,
                       conexion de presion; la presion se arrastra.
  thermostat.svg       termostato tipo Danfoss KP77: igual, con capilar y
                       bulbo; la temperatura se arrastra.
  voltmeter.svg,       voltimetro y amperimetro digitales de 22 mm tipo piloto
  ammeter.svg          (AD16-22FS / AD16-22FSA) con display LED de 3 digitos
                       (rojo y verde), familia AD16 de fam22.py.

Uso: python3 gen_instrumentos_tanda2.py <carpeta>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fam22 import AC, AH, AW, AY, F, INK, ad16_back, finish, header, jw_term, term  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
WATER = "#2f7fd6"


def save(name, text):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(text)


def wires_top(names, xs, cols, top=6):
    """Hilos que suben a sus bornes (arriba), con terminal y rotulo."""
    s = []
    for name, x, col in zip(names, xs, cols):
        s.append(f'<rect x="{x - 5}" y="0" width="10" height="4" fill="#16181b"/>')
        s.append(f'<rect x="{x - 4}" y="{top}" width="8" height="12" rx="1.5" fill="#c9ced5" stroke="{INK}" stroke-width=".8"/>')
        s.append(jw_term(name, x, top + 8))
        s.append(f'<text x="{x + 7}" y="{top + 12}" {F} font-size="8" font-weight="800" fill="#e8eaed">{name}</text>')
    return s


# ================================================================ flotador tipo pera
W, H = 160, 300
p = header("Interruptor de nivel tipo pera (cable de 3 hilos BK/BN/BU), equipo de campo a 2 px/mm. Propuesta por aprobar.", W, H)
p.insert(-1, '<linearGradient id="PFX-pear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b6068"/><stop offset=".4" stop-color="#2e3237"/><stop offset="1" stop-color="#121417"/></linearGradient>')
p.insert(-1, '<clipPath id="PFX-tank"><rect x="4" y="70" width="152" height="226" rx="6"/></clipPath>')
# pared del tanque y agua (baja o alta segun el flotador)
p.append(f'<rect x="4" y="70" width="152" height="226" rx="6" fill="#0f141a" stroke="#3a4048" stroke-width="1.4"/>')
p.append(f'<g clip-path="url(#PFX-tank)"><rect data-show="!out.up" x="4" y="236" width="152" height="70" fill="{WATER}" opacity=".45"/>'
         f'<rect data-show="out.up" x="4" y="120" width="152" height="186" fill="{WATER}" opacity=".45"/></g>')
p += wires_top(("BK", "BN", "BU"), (40, 80, 120), ("#1b1d20", "#8a5a2b", "#2f62d6"))
for x, col in ((40, "#1b1d20"), (80, "#8a5a2b"), (120, "#2f62d6")):
    p.append(f'<path d="M{x} 18 V34 Q{x} 46 80 52" fill="none" stroke="#6b737c" stroke-width="5"/><path d="M{x} 18 V34 Q{x} 46 80 52" fill="none" stroke="{col}" stroke-width="3.4"/>')
p.append(f'<path d="M80 52 V110" stroke="#0c0d0f" stroke-width="9" stroke-linecap="round"/><path d="M80 52 V110" stroke="#33373d" stroke-width="6"/>')
# contrapeso fijo en el cable
p.append(f'<rect x="68" y="104" width="24" height="30" rx="5" fill="url(#PFX-pear)" stroke="#000"/>')
p.append('<g data-action="float" data-kind="toggle">')
p.append(f'<rect x="4" y="130" width="152" height="166" fill="#000" opacity="0"/>')
# abajo: cuelga vertical del cable; arriba: flota acostada (gira en el punto de union)
p.append(f'<g data-show="!out.up"><path d="M80 134 V190" stroke="#33373d" stroke-width="6"/>'
         f'<path d="M80 190 C60 190 56 214 60 240 C64 268 72 284 80 284 C88 284 96 268 100 240 C104 214 100 190 80 190 Z" fill="url(#PFX-pear)" stroke="#000" stroke-width="1.4"/>'
         f'<path d="M68 210 C66 226 66 244 70 262" fill="none" stroke="#fff" stroke-width="2" opacity=".25"/></g>')
p.append(f'<g data-show="out.up"><path d="M80 134 Q86 150 96 152" fill="none" stroke="#33373d" stroke-width="6"/>'
         f'<path d="M96 132 C96 112 120 108 140 112 C150 114 154 122 154 132 C154 142 150 150 140 152 C120 156 96 152 96 132 Z" fill="url(#PFX-pear)" stroke="#000" stroke-width="1.4"/>'
         f'<path d="M108 120 C120 116 134 116 144 120" fill="none" stroke="#fff" stroke-width="2" opacity=".25"/></g>')
p.append('</g>')
p.append(f'<text x="12" y="88" {F} font-size="8" font-weight="700" fill="#9aa0a6">BN cierra arriba</text>')
p.append(f'<text x="12" y="98" {F} font-size="8" font-weight="700" fill="#9aa0a6">BU cierra abajo</text>')
save("float-switch.svg", finish(p, "flt"))

# ================================================================ electrodos de nivel
W, H = 160, 320
p = header("Porta-electrodos de 3 varillas (E1 alto, E2 bajo, E3 referencia), equipo de campo a 2 px/mm. Propuesta por aprobar.", W, H)
p.insert(-1, '<clipPath id="PFX-tank"><rect x="4" y="76" width="152" height="240" rx="6"/></clipPath>')
p.insert(-1, '<linearGradient id="PFX-rod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d949b"/><stop offset=".4" stop-color="#eef1f3"/><stop offset="1" stop-color="#6d747b"/></linearGradient>')
BOT = 314       # fondo del tanque; 0 % ... 100 % = 220 px
p.append(f'<rect x="4" y="76" width="152" height="240" rx="6" fill="#0f141a" stroke="#3a4048" stroke-width="1.4"/>')
# agua: sube con el nivel (se arrastra cuando no hay tanque)
p.append('<g clip-path="url(#PFX-tank)">')
p.append(f'<g data-translate="out.nivel|param.nivel:0:100:y:-220" data-action="nivel" data-kind="drag" data-drag="y:{BOT}:-2.2:0:100" style="cursor:ns-resize">')
p.append(f'<rect x="4" y="{BOT}" width="152" height="240" fill="{WATER}" opacity=".45"/>')
p.append(f'<rect x="4" y="{BOT - 3}" width="152" height="6" fill="#8cc0f2" opacity=".7"/>')
p.append(f'<rect x="6" y="{BOT - 18}" width="30" height="14" rx="3" fill="#101317" fill-opacity=".8"/>')
p.append(f'<text x="21" y="{BOT - 8}" text-anchor="middle" {F} font-size="8.5" font-weight="700" fill="#e8eaed" data-text="out.nivel|param.nivel:d0:%">50 %</text>')
p.append('</g></g>')
# cabezal con los tres bornes y las varillas
p.append(f'<rect x="20" y="24" width="120" height="44" rx="6" fill="#2b2f35" stroke="{INK}" stroke-width="1.4"/>')
for name, x, tip, wet in (("E1", 40, 140, "out.wet1"), ("E2", 80, 250, "out.wet2"), ("E3", 120, 300, "out.wet2|out.wet1")):
    p.append(term(x, 46, 9.0))
    p.append(jw_term(name, x, 46))
    p.append(f'<rect x="{x - 5}" y="0" width="10" height="4" fill="#16181b"/>')
    p.append(f'<text x="{x}" y="{18}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#e8eaed">{name}</text>')
    p.append(f'<rect x="{x - 3}" y="68" width="6" height="{tip - 68}" fill="url(#PFX-rod)" stroke="#3f454b" stroke-width=".6"/>')
    if name != "E3":
        p.append(f'<g data-show="{wet}"><circle cx="{x}" cy="{tip}" r="7" fill="#8cc0f2" opacity=".9"/></g>')
p.append(f'<text x="48" y="{140 + 4}" {F} font-size="8" font-weight="700" fill="#c9cdd3">alto</text>')
p.append(f'<text x="88" y="{250 + 4}" {F} font-size="8" font-weight="700" fill="#c9cdd3">bajo</text>')
save("level-electrodes.svg", finish(p, "elec"))

# ================================================================ rele de nivel (riel DIN)
W, H = 120, 380
p = header("Rele de nivel por electrodos de riel DIN (tipo Schneider RM4-LG01 / CHINT NJYW1), A1 E1 E2 arriba y A2 E3 11 12 14 abajo. Escala 4 px/mm (30 mm). Propuesta por aprobar.", W, H)
p.insert(-1, '<linearGradient id="PFX-gry" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9cdd2"/><stop offset=".12" stop-color="#e6e9ec"/><stop offset=".88" stop-color="#e6e9ec"/><stop offset="1" stop-color="#bfc4c9"/></linearGradient>')
p.insert(-1, '<radialGradient id="PFX-led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
p.append(f'<rect x="2" y="2" width="116" height="376" rx="5" fill="url(#PFX-gry)" stroke="{INK}" stroke-width="1.6"/>')
for row, cy, r in (((("A1", 20), ("E1", 60), ("E2", 100)), 22, 9.0), ((("A2", 20), ("E3", 40), ("11", 60), ("12", 80), ("14", 100)), 358, 7.5)):
    p.append(f'<rect x="6" y="{cy - 14}" width="108" height="28" rx="3" fill="#d5d9dd" stroke="#9aa1a8"/>')
    for name, cx in row:
        p.append(term(cx, cy, r))
        p.append(jw_term(name, cx, cy))
        p.append(f'<rect x="{cx - 5}" y="{0 if cy < 100 else H - 3}" width="10" height="3" fill="#000"/>')
        p.append(f'<text x="{cx}" y="{cy + (24 if cy < 100 else -18)}" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}">{name}</text>')
for x, lab, col, expr in ((36, "U", "#2fbf5a", "out.energized"), (84, "R", "#f2c230", "out.closed")):
    p.append(f'<circle cx="{x}" cy="74" r="6" fill="#4a4f56" stroke="{INK}"/>')
    p.append(f'<g data-show="{expr}"><circle cx="{x}" cy="74" r="13" fill="{col}" opacity=".35"/><circle cx="{x}" cy="74" r="6" fill="{col}"/><circle cx="{x}" cy="74" r="6" fill="url(#PFX-led)"/></g>')
    p.append(f'<text x="{x}" y="94" text-anchor="middle" {F} font-size="9" font-weight="800" fill="{INK}">{lab}</text>')
p.append(f'<rect x="10" y="104" width="100" height="26" rx="3" fill="#fff" stroke="#9aa1a8"/>')
p.append(f'<text x="60" y="114" text-anchor="middle" {F} font-size="6.5" font-weight="700" fill="#59606a">FUNCIÓN</text>')
p.append(f'<text x="60" y="125" text-anchor="middle" {F} font-size="8" font-weight="800" fill="{INK}" data-text="param.modo">llenado</text>')
# esquema del tanque con los electrodos y el nivel que lee el rele
TX, TY = 30, 150
p.append(f'<rect x="{TX}" y="{TY}" width="60" height="110" rx="3" fill="#fff" stroke="{INK}" stroke-width="1.2"/>')
for lvl, y in (("alto", TY + 70), ("medio", TY + 40), ("bajo", TY + 8)):
    p.append(f'<g data-show="out.nivel={lvl}"><rect x="{TX + 1}" y="{y}" width="58" height="{TY + 109 - y}" fill="{WATER}" opacity=".5"/></g>')
for x, ln, lab in ((TX + 14, 34, "E1"), (TX + 30, 86, "E2"), (TX + 46, 104, "E3")):
    p.append(f'<line x1="{x}" y1="{TY}" x2="{x}" y2="{TY + ln}" stroke="{INK}" stroke-width="2"/>')
    p.append(f'<text x="{x}" y="{TY - 4}" text-anchor="middle" {F} font-size="7" font-weight="800" fill="{INK}">{lab}</text>')
p.append(f'<text x="60" y="{TY + 130}" text-anchor="middle" {F} font-size="7" fill="#59606a" data-text="param.coil">24VDC</text>')
p.append(f'<text x="60" y="{TY + 150}" text-anchor="middle" {F} font-size="7" fill="#59606a">11─┬─14 · 12</text>')
save("level-relay.svg", finish(p, "lvlr"))


# ================================================================ presostato y termostato (familia KP)
def kp(name, title, model, unit, vmax, scale_lo, scale_hi, q, bulb):
    W, H = 160, 300
    p = header(f"{title}, contacto 1-2-4, equipo de campo a 2 px/mm. Propuesta por aprobar.", W, H)
    p.insert(-1, '<linearGradient id="PFX-kp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9bfc6"/><stop offset=".15" stop-color="#dfe3e7"/><stop offset=".85" stop-color="#dfe3e7"/><stop offset="1" stop-color="#aeb4bb"/></linearGradient>')
    p.insert(-1, '<linearGradient id="PFX-brs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9cf95"/><stop offset="1" stop-color="#9c7a3c"/></linearGradient>')
    # cuerpo
    p.append(f'<rect x="20" y="20" width="120" height="196" rx="8" fill="url(#PFX-kp)" stroke="{INK}" stroke-width="1.6"/>')
    p.append('<g id="' + name + '-logo"></g>')
    p.append(f'<text x="80" y="40" text-anchor="middle" {F} font-size="11" font-weight="800" fill="{INK}">{model}</text>')
    # ventana de la escala de corte con el ajuste
    p.append(f'<rect x="30" y="50" width="100" height="40" rx="3" fill="#fbfbf8" stroke="#8a9099"/>')
    p.append(f'<text x="34" y="60" {F} font-size="6.5" font-weight="700" fill="#59606a">CUT-OUT · DIFF</text>')
    p.append(f'<text x="80" y="80" text-anchor="middle" {F} font-size="10" font-weight="800" fill="{INK}" data-text="out.ajusteTxt">{scale_lo} – {scale_hi} {unit}</text>')
    # contacto conmutado a la vista: 1-4 cerrado al subir
    p.append(f'<rect x="30" y="100" width="100" height="56" rx="3" fill="#2b2f35" stroke="{INK}"/>')
    p.append(f'<circle cx="54" cy="142" r="3" fill="#e8eaed"/><circle cx="106" cy="114" r="3" fill="#e8eaed"/><circle cx="106" cy="142" r="3" fill="#e8eaed"/>')
    p.append(f'<text x="50" y="152" {F} font-size="7" fill="#c9cdd3">1</text><text x="112" y="118" {F} font-size="7" fill="#c9cdd3">4</text><text x="112" y="146" {F} font-size="7" fill="#c9cdd3">2</text>')
    p.append(f'<g data-show="out.activado"><line x1="54" y1="142" x2="104" y2="116" stroke="#f2c230" stroke-width="3" stroke-linecap="round"/></g>')
    p.append(f'<g data-show="!out.activado"><line x1="54" y1="142" x2="104" y2="140" stroke="#e8eaed" stroke-width="3" stroke-linecap="round"/></g>')
    # valor medido
    p.append(f'<rect x="30" y="164" width="100" height="22" rx="3" fill="#101317"/>')
    p.append(f'<text x="80" y="179" text-anchor="middle" {F} font-size="11" font-weight="800" fill="#7fe3a8" data-text="out.texto">—</text>')
    # bornes 1, 2, 4 abajo
    p.append(f'<rect x="20" y="226" width="120" height="44" rx="4" fill="#3a3f45" stroke="{INK}"/>')
    for tname, x in (("1", 40), ("2", 80), ("4", 120)):
        p.append(term(x, 248, 9.0))
        p.append(jw_term(tname, x, 248))
        p.append(f'<rect x="{x - 5}" y="{H - 4}" width="10" height="4" fill="#16181b"/>')
        p.append(f'<text x="{x}" y="{H - 10}" text-anchor="middle" {F} font-size="9" font-weight="800" fill="#e8eaed">{tname}</text>')
    # magnitud medida a mano: deslizador a la derecha (0 abajo, max arriba)
    y0, span = 206, 180
    p.append(f'<rect x="146" y="{y0 - span}" width="8" height="{span}" rx="4" fill="#25292e" stroke="{INK}"/>')
    p.append(f'<g data-translate="out.{q}|param.{q}:0:{vmax}:y:-{span}" data-action="{q}" data-kind="drag" data-drag="y:{y0}:{-span / vmax:g}:0:{vmax}" style="cursor:ns-resize">')
    p.append(f'<rect x="140" y="{y0 - 6}" width="20" height="12" rx="3" fill="#e05a4a" stroke="#6e1a12"/>')
    p.append('</g>')
    # conexion de proceso: rosca de presion o capilar con bulbo
    if bulb:
        p.append(f'<path d="M24 200 C8 200 6 230 6 250 V290" fill="none" stroke="#b58a3c" stroke-width="2.4"/>')
        p.append(f'<rect x="1" y="262" width="10" height="34" rx="5" fill="url(#PFX-brs)" stroke="#3a2c14"/>')
    else:
        p.append(f'<rect x="4" y="196" width="18" height="12" fill="url(#PFX-brs)" stroke="#3a2c14"/>')
        p.append(f'<path d="M4 198 H22 M4 202 H22 M4 206 H22" stroke="#3a2c14" stroke-width=".6"/>')
    save(f"{name}.svg", finish(p, name.replace("-", "")[:6]))


kp("pressure-switch", "Presostato tipo Danfoss KP35 (-0,2 a 7,5 bar)", "KP 35", "bar", 10, "3,0", "4,0", "presion", False)
kp("thermostat", "Termostato tipo Danfoss KP77 (20 a 60 °C)", "KP 77", "°C", 120, "37,0", "40,0", "temperatura", True)


# ================================================================ voltimetro y amperimetro AD16
def meter(name, title, t1, t2, col, unit):
    p = header(f"{title}, 22 mm tipo piloto con display LED de 3 digitos, familia AD16. Escala 4 px/mm. Propuesta por aprobar.", AW, AH)
    p += ad16_back(t1, t2, t1, t2)
    p.append(f'<circle cx="{AC}" cy="{AY + 2}" r="58" fill="#000" opacity=".3"/>')
    p.append(f'<circle cx="{AC}" cy="{AY}" r="58" fill="#1d1f22" stroke="{INK}" stroke-width="1.4"/>')
    p.append(f'<circle cx="{AC}" cy="{AY}" r="58" fill="url(#PFX-dome)"/>')
    p.append(f'<rect x="{AC - 40}" y="{AY - 20}" width="80" height="40" rx="4" fill="#0a0b0c" stroke="#000"/>')
    p.append(f'<text x="{AC - 4}" y="{AY + 12}" text-anchor="middle" font-family="monospace" font-size="28" font-weight="800" fill="{col}" data-text="out.lcd">---</text>')
    p.append(f'<text x="{AC + 32}" y="{AY + 12}" text-anchor="middle" {F} font-size="11" font-weight="800" fill="{col}">{unit}</text>')
    p.append(f'<text x="{AC}" y="{AY + 38}" text-anchor="middle" {F} font-size="8" font-weight="700" fill="#9aa0a6">{name.split("-")[0].upper()}</text>')
    return p


p = meter("voltmeter", "Voltimetro digital AD16-22FS / AD16-22DSV", "1", "2", "#ff4a3a", "V")
p.append(f'<text x="{AC}" y="{AY - 28}" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#9aa0a6" data-text="param.range">60-500VAC</text>')
save("voltmeter.svg", finish(p, "vm"))
p = meter("ammeter", "Amperimetro digital AD16-22FSA (TC incorporado, 0-100 A)", "1", "2", "#3ddc84", "A")
p.append(f'<text x="{AC}" y="{AY - 28}" text-anchor="middle" {F} font-size="7" font-weight="700" fill="#9aa0a6">0-100A</text>')
save("ammeter.svg", finish(p, "am"))
print("ok")
