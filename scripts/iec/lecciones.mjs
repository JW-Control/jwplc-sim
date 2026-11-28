// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Ruta IEC 61131-3: cada lección con su programa en ST, Ladder y FBD, el
// banco de la lección C++ que enseña la misma idea y la práctica evaluada.
// scripts/iec/armar.mjs escribe con esto las carpetas de la librería. Los
// textos de la lección (README.md) se escriben a mano en la librería.
//
// Programas: st = texto; ld = peldaños (ver proyecto.mjs); fbd = redes.
// Rúbrica: misma forma que rubrica.json (los puntos suman 20).

// ------------------------------------------------------------ ayudas
const press = (dev, at, ms) => [
  { at_ms: at, device: dev, action: "press", value: true },
  { at_ms: at + ms, device: dev, action: "press", value: false },
];
// Un sensor (inductivo, fotoeléctrico) se acciona con «target», no con «press».
const sensor = (dev, at, ms) => [
  { at_ms: at, device: dev, action: "target", value: true },
  { at_ms: at + ms, device: dev, action: "target", value: false },
];
const pos = (dev, at, value) => ({ at_ms: at, device: dev, action: "position", value });
const ev = (description, points, from_ms, to_ms, eventually, for_ms = 100) => ({ description, points, from_ms, to_ms, eventually, for_ms });
const never = (description, points, from_ms, to_ms, n) => ({ description, points, from_ms, to_ms, never: n });
const always = (description, points, from_ms, to_ms, a) => ({ description, points, from_ms, to_ms, always: a });
const expect = (description, points, at_ms, e) => ({ description, points, at_ms, expect: e });


// El semáforo por etapas (lección 09): lo comparten el ejemplo y la solución.
const SEMAFORO_ST = `(* Arranque: la primera vuelta del programa activa la etapa inicial. *)
ARRANQUE := NOT INICIADO;
INICIADO := TRUE;

(* Cada etapa lleva su temporizador. *)
T_VMIN(IN := X1, PT := T#10s);
FIN_VMIN := T_VMIN.Q;
T_VMAX(IN := X1, PT := T#30s);
FIN_VMAX := T_VMAX.Q;
T_AMA(IN := X2, PT := T#3s);
FIN_AMA := T_AMA.Q;
T_ROJO(IN := X3, PT := T#8s);
FIN_ROJO := T_ROJO.Q;

(* Transiciones: etapa activa Y condición cumplida. *)
PIDE := PEATON OR FIN_VMAX;
T1 := X1 AND PIDE AND FIN_VMIN;
T2 := X2 AND FIN_AMA;
T3 := X3 AND FIN_ROJO;

(* Etapas: se activan con la transición que llega y se apagan con la que sale. *)
X1 := (X1 OR T3 OR ARRANQUE) AND NOT T1;
X2 := (X2 OR T1) AND NOT T2;
X3 := (X3 OR T2) AND NOT T3;

(* El pedido del peatón se recuerda hasta que se atiende. *)
PEATON := (PEATON OR S1) AND NOT T2;`;
const SEMAFORO_LD = [
  { comment: "Arranque: solo en la primera vuelta", elements: ["!INICIADO", "=ARRANQUE"] },
  { comment: "", elements: ["ARRANQUE", "S=INICIADO"] },
  { comment: "Verde mínimo: 10 s", elements: ["X1", { fb: "TON", inst: "T_VMIN", pins: { PT: "T#10s" } }, "=FIN_VMIN"] },
  { comment: "Verde máximo: 30 s", elements: ["X1", { fb: "TON", inst: "T_VMAX", pins: { PT: "T#30s" } }, "=FIN_VMAX"] },
  { comment: "Amarillo: 3 s", elements: ["X2", { fb: "TON", inst: "T_AMA", pins: { PT: "T#3s" } }, "=FIN_AMA"] },
  { comment: "Rojo: 8 s", elements: ["X3", { fb: "TON", inst: "T_ROJO", pins: { PT: "T#8s" } }, "=FIN_ROJO"] },
  { comment: "Pide el cambio: peatón o verde máximo", elements: ["PEATON", "=PIDE"], branches: [{ at: 0, elements: ["FIN_VMAX"] }] },
  { comment: "T1: VERDE → AMARILLO", elements: ["X1", "PIDE", "FIN_VMIN", "=T1"] },
  { comment: "T2: AMARILLO → ROJO", elements: ["X2", "FIN_AMA", "=T2"] },
  { comment: "T3: ROJO → VERDE", elements: ["X3", "FIN_ROJO", "=T3"] },
  { comment: "Etapa VERDE", elements: ["X1", "!T1", "=X1"], branches: [{ at: 0, elements: ["T3"] }, { at: 0, elements: ["ARRANQUE"] }] },
  { comment: "Etapa AMARILLO", elements: ["X2", "!T2", "=X2"], branches: [{ at: 0, elements: ["T1"] }] },
  { comment: "Etapa ROJO", elements: ["X3", "!T3", "=X3"], branches: [{ at: 0, elements: ["T2"] }] },
  { comment: "El pedido del peatón se recuerda hasta que se atiende", elements: ["PEATON", "!T2", "=PEATON"], branches: [{ at: 0, elements: ["S1"] }] },
];
const SEMAFORO_FBD = [
  { out: "ARRANQUE", expr: ["NOT", "INICIADO"] },
  { out: "INICIADO", expr: ["OR", "INICIADO", "ARRANQUE"] },
  { fb: "TON", inst: "T_VMIN", in: { IN: "X1", PT: "T#10s" }, out: { Q: "FIN_VMIN" } },
  { fb: "TON", inst: "T_VMAX", in: { IN: "X1", PT: "T#30s" }, out: { Q: "FIN_VMAX" } },
  { fb: "TON", inst: "T_AMA", in: { IN: "X2", PT: "T#3s" }, out: { Q: "FIN_AMA" } },
  { fb: "TON", inst: "T_ROJO", in: { IN: "X3", PT: "T#8s" }, out: { Q: "FIN_ROJO" } },
  { out: "PIDE", expr: ["OR", "PEATON", "FIN_VMAX"] },
  { out: "T1", expr: ["AND", "X1", "PIDE", "FIN_VMIN"] },
  { out: "T2", expr: ["AND", "X2", "FIN_AMA"] },
  { out: "T3", expr: ["AND", "X3", "FIN_ROJO"] },
  { out: "X1", expr: ["AND", ["OR", "X1", "T3", "ARRANQUE"], ["NOT", "T1"]] },
  { out: "X2", expr: ["AND", ["OR", "X2", "T1"], ["NOT", "T2"]] },
  { out: "X3", expr: ["AND", ["OR", "X3", "T2"], ["NOT", "T3"]] },
  { out: "PEATON", expr: ["AND", ["OR", "PEATON", "S1"], ["NOT", "T2"]] },
];

// Lección 11: el bloque MOTOR (marcha y parada con enclavamiento y cuenta de arranques).
const MOTOR_FB = {
  name: "MOTOR",
  doc: "Marcha y parada con enclavamiento; cuenta los arranques.",
  inputs: [
    { name: "MARCHA", type: "BOOL", doc: "pulsador NA" },
    { name: "PARADA", type: "BOOL", doc: "pulsador NC: TRUE sin pulsar" },
  ],
  outputs: [
    { name: "Q", type: "BOOL", doc: "en marcha" },
    { name: "ARRANQUES", type: "INT", doc: "veces que arrancó" },
  ],
  locals: [{ name: "FLANCO", type: "R_TRIG" }],
  body: `(* Enclavamiento (lección 03): la parada manda. *)
Q := (Q OR MARCHA) AND PARADA;

(* Cada arranque suma uno (flanco de subida de Q). *)
FLANCO(CLK := Q);
IF FLANCO.Q THEN
  ARRANQUES := ARRANQUES + 1;
END_IF;`,
};
const BOMBAS = [...press("S1", 1000, 200), ...press("S2", 2000, 200), ...press("S1", 3000, 200), ...press("S3", 4000, 200), ...press("S2", 5000, 200), ...press("S4", 6500, 200)];

// Lección 12: el portón por etapas numeradas. full = con la barrera y la baliza.
const PORTON_ST = (full) => `(* CASE: cada etapa revisa solo sus transiciones. *)
CASE ETAPA OF
  0: (* PARADO *)
    IF S1 AND NOT B1 THEN
      ETAPA := 1;
    ELSIF S2 AND NOT B2 THEN
      ETAPA := 2;
    END_IF;
  1: (* ABRIENDO: hasta el final B1 *)
    IF B1 THEN
      ETAPA := 0;
    END_IF;
  2: (* CERRANDO: hasta el final B2 *)
    IF B2 THEN
      ETAPA := 0;${full ? `
    ELSIF B3 THEN
      (* Obstáculo: vuelve a abrir. *)
      ETAPA := 1;` : ""}
    END_IF;
END_CASE;

(* La parada manda en cualquier etapa (S0 es NC). *)
IF NOT S0 THEN
  ETAPA := 0;
END_IF;

(* Salidas: un solo sentido por etapa, nunca los dos a la vez. *)
KM1 := ETAPA = 1;
KM2 := ETAPA = 2;${full ? `
H1 := ETAPA > 0;` : ""}`;
const eq = (n) => ({ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: String(n), OUT: `E${n}` } });
const mv = (n) => ({ fb: "MOVE", en: true, pins: { IN: String(n), OUT: "ETAPA" } });
const PORTON_LD = (full) => [
  { comment: "¿En qué etapa está?", elements: [eq(0)] },
  { comment: "", elements: [eq(1)] },
  { comment: "", elements: [eq(2)] },
  { comment: "PARADO → ABRIENDO con S1, si no está abierto", elements: ["E0", "S1", "!B1", mv(1)] },
  { comment: "PARADO → CERRANDO con S2, si no está cerrado", elements: ["E0", "S2", "!B2", mv(2)] },
  { comment: "ABRIENDO → PARADO en el final B1", elements: ["E1", "B1", mv(0)] },
  { comment: "CERRANDO → PARADO en el final B2", elements: ["E2", "B2", mv(0)] },
  ...(full ? [{ comment: "CERRANDO → ABRIENDO con un obstáculo", elements: ["E2", "B3", mv(1)] }] : []),
  { comment: "La parada manda en cualquier etapa", elements: ["!S0", mv(0)] },
  { comment: "Motor: abrir", elements: ["E1", "=KM1"] },
  { comment: "Motor: cerrar", elements: ["E2", "=KM2"] },
  ...(full ? [{ comment: "Baliza: en movimiento", elements: ["!E0", "=H1"] }] : []),
];
const PORTON_FBD = (full) => [
  { out: "E0", expr: ["EQ", "ETAPA", "0"] },
  { out: "E1", expr: ["EQ", "ETAPA", "1"] },
  { out: "E2", expr: ["EQ", "ETAPA", "2"] },
  { out: "ETAPA", expr: ["SEL", ["AND", "E0", "S1", ["NOT", "B1"]], "ETAPA", "1"] },
  { out: "ETAPA", expr: ["SEL", ["AND", "E0", "S2", ["NOT", "B2"]], "ETAPA", "2"] },
  { out: "ETAPA", expr: ["SEL", ["AND", "E1", "B1"], "ETAPA", "0"] },
  { out: "ETAPA", expr: ["SEL", ["AND", "E2", "B2"], "ETAPA", "0"] },
  ...(full ? [{ out: "ETAPA", expr: ["SEL", ["AND", "E2", "B3"], "ETAPA", "1"] }] : []),
  { out: "ETAPA", expr: ["SEL", ["NOT", "S0"], "ETAPA", "0"] },
  { out: "KM1", expr: "E1" },
  { out: "KM2", expr: "E2" },
  ...(full ? [{ out: "H1", expr: ["NOT", "E0"] }] : []),
];

// ------------------------------------------------------------ lecciones
export const LECCIONES = [
  // ======================================================== Unidad 1
  {
    id: "iec-01",
    unit: "1.Contactos_y_logica",
    folder: "01.Contactos_y_bobinas",
    project: "contactos_y_bobinas",
    title: "Contactos y bobinas",
    bench: "curso-03",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "pulsador NA" },
      { name: "S2", type: "BOOL", at: "%IX0.1", doc: "pulsador NA" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "piloto verde" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "piloto amarillo" },
    ],
    example: {
      st: `(* H1 sigue a S1: encendido mientras el pulsador esté apretado. *)
H1 := S1;`,
      ld: { rungs: [{ comment: "H1 sigue a S1", elements: ["S1", "=H1"] }] },
      fbd: { networks: [{ out: "H1", expr: "S1" }] },
    },
    solution: {
      st: `(* H1 encendido con S1 suelto: NOT invierte la entrada. *)
H1 := NOT S1;

(* S2 manda H2. *)
H2 := S2;`,
      ld: {
        rungs: [
          { comment: "H1 encendido con S1 suelto (contacto cerrado)", elements: ["!S1", "=H1"] },
          { comment: "S2 manda H2", elements: ["S2", "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { out: "H1", expr: ["NOT", "S1"] },
          { out: "H2", expr: "S2" },
        ],
      },
    },
    brief: {
      goal: "H1 (Q0.0) encendido mientras S1 NO esté apretado, y S2 que manda H2 (Q0.1).",
      steps: ["Ejecuta el ejemplo y aprieta S1: H1 sigue al pulsador.", "Invierte la lógica: H1 encendido con S1 suelto (NOT en ST, contacto cerrado en Ladder, bloque NOT en FBD).", "Agrega lo que manda H2 con S2.", "Prueba los dos pulsadores en el banco."],
      uses: ["%IX0.0 · S1, pulsador NA", "%IX0.1 · S2, pulsador NA", "%QX0.0 · H1, piloto verde", "%QX0.1 · H2, piloto amarillo"],
      teaches: "Una variable ubicada (AT %IX0.0) es una entrada de la placa; un contacto abierto deja pasar con la entrada activa y uno cerrado con la entrada inactiva.",
    },
    rubric: {
      goals: [
        { id: "invertida", description: "H1 (Q0.0) encendido mientras S1 NO está apretado", when: { I0_0: 0, Q0_0: 1 }, hold_ms: 500, hint: "ST: H1 := NOT S1;  Ladder: contacto cerrado de S1." },
        { id: "invertida_pulsado", description: "Al apretar S1, H1 se apaga", when: { I0_0: 1, Q0_0: 0 }, hold_ms: 300, after: "invertida" },
        { id: "segundo", description: "S2 (I0.1) enciende H2 (Q0.1)", when: { I0_1: 1, Q0_1: 1 }, hold_ms: 300, why: "Cada salida tiene su propia línea: una asignación en ST, un peldaño en Ladder, una red en FBD." },
      ],
      cases: [
        {
          name: "S1 invertido",
          until_ms: 3000,
          actions: [...press("S1", 1500, 700)],
          checks: [
            ev("Con S1 suelto, H1 encendido", 4, 900, 1500, { Q0_0: 1 }, 200),
            ev("Con S1 apretado, H1 apagado", 4, 1500, 2000, { Q0_0: 0 }, 150),
            ev("Al soltar S1, H1 vuelve a encenderse", 2, 2200, 2700, { Q0_0: 1 }, 200),
          ],
        },
        {
          name: "S2 manda H2",
          until_ms: 3000,
          actions: [...press("S2", 1500, 700)],
          checks: [
            always("H2 apagado sin S2", 2, 900, 1500, { Q0_1: 0 }),
            ev("Con S2, H2 encendido", 5, 1500, 2000, { Q0_1: 1 }, 200),
            ev("Al soltar S2, H2 se apaga", 3, 2200, 2700, { Q0_1: 0 }, 200),
          ],
        },
      ],
      goal_runs: [{ name: "S1 y S2", until_ms: 6000, actions: [...press("S1", 2500, 1500), ...press("S2", 4500, 1000)] }],
    },
  },
  {
    id: "iec-02",
    unit: "1.Contactos_y_logica",
    folder: "02.Logica_Y_O_NO",
    project: "logica_y_o_no",
    title: "Lógica Y, O, NO",
    bench: "curso-04",
    vars: [
      { name: "SA1", type: "BOOL", at: "%IX0.0", doc: "mano izquierda" },
      { name: "SA2", type: "BOOL", at: "%IX0.1", doc: "mano derecha" },
      { name: "SA3", type: "BOOL", at: "%IX0.2", doc: "tercera mano" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "prensa" },
      { name: "H2", type: "BOOL", at: "%QX0.1" },
      { name: "H3", type: "BOOL", at: "%QX0.2" },
      { name: "H5", type: "BOOL", at: "%QX0.4" },
    ],
    example: {
      st: `(* Y: la prensa baja solo con las dos manos. *)
H1 := SA1 AND SA2;

(* O: H2 con cualquiera de las dos. *)
H2 := SA1 OR SA2;

(* NO: H3 encendido mientras SA1 está suelto. *)
H3 := NOT SA1;`,
      ld: {
        rungs: [
          { comment: "Y: contactos en serie", elements: ["SA1", "SA2", "=H1"] },
          { comment: "O: contactos en paralelo", elements: ["SA1", "=H2"], branches: [{ at: 0, elements: ["SA2"] }] },
          { comment: "NO: contacto cerrado", elements: ["!SA1", "=H3"] },
        ],
      },
      fbd: {
        networks: [
          { out: "H1", expr: ["AND", "SA1", "SA2"] },
          { out: "H2", expr: ["OR", "SA1", "SA2"] },
          { out: "H3", expr: ["NOT", "SA1"] },
        ],
      },
    },
    solution: {
      st: `(* Prensa a tres manos. *)
H1 := SA1 AND SA2 AND SA3;

H2 := SA1 OR SA2;
H3 := NOT SA1;

(* H5: SA1 activa y SA2 inactiva. *)
H5 := SA1 AND NOT SA2;`,
      ld: {
        rungs: [
          { comment: "Prensa a tres manos", elements: ["SA1", "SA2", "SA3", "=H1"] },
          { comment: "O: contactos en paralelo", elements: ["SA1", "=H2"], branches: [{ at: 0, elements: ["SA2"] }] },
          { comment: "NO: contacto cerrado", elements: ["!SA1", "=H3"] },
          { comment: "H5: SA1 y no SA2", elements: ["SA1", "!SA2", "=H5"] },
        ],
      },
      fbd: {
        networks: [
          { out: "H1", expr: ["AND", "SA1", "SA2", "SA3"] },
          { out: "H2", expr: ["OR", "SA1", "SA2"] },
          { out: "H3", expr: ["NOT", "SA1"] },
          { out: "H5", expr: ["AND", "SA1", ["NOT", "SA2"]] },
        ],
      },
    },
    brief: {
      goal: "Prensa a tres manos en H1 (Q0.0) y H5 (Q0.4) encendido con SA1 activa pero SA2 inactiva.",
      steps: ["Ejecuta el ejemplo y prueba los selectores (en el banco son las «manos»).", "Agrega la tercera mano SA3: H1 solo con las tres.", "H5: encendido con SA1 activa y SA2 inactiva.", "Prueba todas las combinaciones."],
      uses: ["%IX0.0 · SA1, mano izquierda", "%IX0.1 · SA2, mano derecha", "%IX0.2 · SA3, tercera mano", "%QX0.0…%QX0.4 · H1…H5, pilotos"],
      teaches: "Y son contactos en serie (AND), O son contactos en paralelo (OR) y NO es un contacto cerrado (NOT).",
    },
    rubric: {
      goals: [
        { id: "tres", description: "Con las tres manos, H1 (Q0.0) enciende", when: { I0_0: 1, I0_1: 1, I0_2: 1, Q0_0: 1 }, hold_ms: 300 },
        { id: "dos_no", description: "Con dos manos, H1 queda apagado", when: { I0_0: 1, I0_1: 1, I0_2: 0, Q0_0: 0 }, hold_ms: 300, after: "tres", hint: "Un tercer contacto en serie, o un tercer IN en el bloque AND." },
        { id: "q4", description: "H5 (Q0.4) enciende con SA1 activa y SA2 inactiva", when: { I0_0: 1, I0_1: 0, Q0_4: 1 }, hold_ms: 300 },
        { id: "q4_no", description: "Con SA2 activa, H5 se apaga", when: { I0_0: 1, I0_1: 1, Q0_4: 0 }, hold_ms: 300, after: "q4", why: "SA1 AND NOT SA2: en Ladder, un contacto abierto y uno cerrado en serie." },
      ],
      cases: [
        {
          name: "Prensa a tres manos",
          until_ms: 2600,
          actions: [pos("SA1", 1200, 1), pos("SA2", 1200, 1), pos("SA3", 1600, 1), pos("SA2", 2200, 0)],
          checks: [
            never("Con dos manos no baja la prensa", 5, 1250, 1600, { Q0_0: 1 }),
            ev("Con las tres, H1 se enciende", 4, 1600, 1900, { Q0_0: 1 }),
            ev("Al quitar una mano, H1 se apaga", 3, 2200, 2500, { Q0_0: 0 }),
          ],
        },
        {
          name: "H5: SA1 y no SA2",
          until_ms: 2400,
          actions: [pos("SA1", 1200, 1), pos("SA2", 1800, 1)],
          checks: [
            expect("H5 apagado en reposo", 2, 1150, { Q0_4: 0 }),
            ev("Con SA1 sola, H5 se enciende", 3, 1200, 1500, { Q0_4: 1 }),
            ev("Con SA2 también, H5 se apaga", 3, 1800, 2100, { Q0_4: 0 }),
          ],
        },
      ],
      goal_runs: [{ name: "Manos", until_ms: 6000, actions: [pos("SA1", 1500, 1), pos("SA2", 2500, 1), pos("SA3", 3200, 1), pos("SA3", 4200, 0), pos("SA2", 5000, 0)] }],
    },
  },
  {
    id: "iec-03",
    unit: "1.Contactos_y_logica",
    folder: "03.Enclavamiento",
    project: "enclavamiento",
    title: "Enclavamiento: marcha y parada",
    bench: "curso-08",
    vars: [
      { name: "MARCHA", type: "BOOL", at: "%IX0.0", doc: "S1, pulsador NA" },
      { name: "PARADA", type: "BOOL", at: "%IX0.1", doc: "S2, pulsador NC: activa en reposo" },
      { name: "TERMICO", type: "BOOL", at: "%IX0.2", doc: "F1, contacto 95-96 NC: activo si no hay falla" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "contactor del motor" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "piloto de falla" },
      { name: "H2", type: "BOOL", at: "%QX0.2", doc: "piloto de marcha" },
    ],
    example: {
      st: `(* El motor queda en marcha por su propio contacto (enclavamiento):
   MARCHA lo arranca, KM1 lo mantiene; PARADA o el térmico lo sueltan. *)
KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;`,
      ld: { rungs: [{ comment: "Marcha y parada con enclavamiento", elements: ["MARCHA", "PARADA", "TERMICO", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] }] },
      fbd: { networks: [{ out: "KM1", expr: ["AND", ["OR", "MARCHA", "KM1"], "PARADA", "TERMICO"] }] },
    },
    solution: {
      st: `KM1 := (MARCHA OR KM1) AND PARADA AND TERMICO;

(* Piloto de marcha. *)
H2 := KM1;

(* Piloto de falla: el contacto 95-96 se abrió. *)
H1 := NOT TERMICO;`,
      ld: {
        rungs: [
          { comment: "Marcha y parada con enclavamiento", elements: ["MARCHA", "PARADA", "TERMICO", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] },
          { comment: "Piloto de marcha", elements: ["KM1", "=H2"] },
          { comment: "Piloto de falla", elements: ["!TERMICO", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { out: "KM1", expr: ["AND", ["OR", "MARCHA", "KM1"], "PARADA", "TERMICO"] },
          { out: "H2", expr: "KM1" },
          { out: "H1", expr: ["NOT", "TERMICO"] },
        ],
      },
    },
    brief: {
      goal: "Piloto de marcha H2 (Q0.2) con el motor y piloto de falla H1 (Q0.1) mientras el térmico esté disparado.",
      steps: ["Ejecuta el ejemplo: MARCHA arranca KM1 y sigue en marcha al soltarla.", "Agrega H2 encendido mientras el motor marcha.", "Agrega H1 encendido mientras el térmico (F1) esté disparado.", "Comprueba que al rearmar el térmico el motor NO arranca solo."],
      uses: ["%IX0.0 · S1, MARCHA (NA)", "%IX0.1 · S2, PARADA (NC)", "%IX0.2 · F1, térmico 95-96 (NC)", "%QX0.0 · KM1, contactor", "%QX0.1 · H1, falla", "%QX0.2 · H2, marcha"],
      teaches: "El enclavamiento es un contacto de KM1 en paralelo con MARCHA: la salida se mantiene sola hasta que algo en serie la corta.",
    },
    rubric: {
      goals: [
        { id: "marcha", description: "H2 (Q0.2) encendido con el motor en marcha", when: { Q0_0: 1, Q0_2: 1 }, hold_ms: 500, hint: "Un peldaño más: contacto KM1 y bobina H2." },
        { id: "marcha_off", description: "H2 se apaga al detener el motor", when: { Q0_0: 0, Q0_2: 0 }, hold_ms: 300, after: "marcha" },
        { id: "falla", description: "Dispara el térmico (aprieta F1): H1 (Q0.1) enciende y el motor para", when: { I0_2: 0, Q0_1: 1, Q0_0: 0 }, hold_ms: 300 },
        { id: "sin_rearranque", description: "Con el térmico rearmado, el motor sigue parado", when: { I0_2: 1, Q0_0: 0, Q0_1: 0 }, hold_ms: 500, after: "falla", why: "Por el enclavamiento: al volver el térmico, nada vuelve a dar MARCHA." },
      ],
      cases: [
        {
          name: "Piloto de marcha",
          until_ms: 3500,
          actions: [...press("S1", 1000, 300), ...press("S2", 2200, 300)],
          checks: [ev("H2 se enciende con el motor", 5, 1000, 1500, { Q0_0: 1, Q0_2: 1 }, 200), ev("H2 se apaga con PARADA", 4, 2200, 2700, { Q0_0: 0, Q0_2: 0 }, 200)],
        },
        {
          name: "Piloto de falla",
          until_ms: 4500,
          actions: [...press("S1", 800, 300), ...press("F1", 1800, 1000)],
          checks: [
            always("H1 apagado sin falla", 2, 900, 1800, { Q0_1: 0 }),
            ev("Con el térmico disparado, H1 encendido y el motor parado", 5, 1800, 2200, { Q0_1: 1, Q0_0: 0 }),
            ev("Al rearmar, H1 se apaga", 2, 2800, 3200, { Q0_1: 0 }),
            never("El motor no vuelve a arrancar solo", 2, 2800, 4500, { Q0_0: 1 }),
          ],
        },
      ],
      goal_runs: [{ name: "Marcha, parada y falla", until_ms: 9000, actions: [...press("S1", 1500, 300), ...press("S2", 3000, 300), ...press("S1", 4500, 300), ...press("F1", 6000, 1200)] }],
    },
  },
  {
    id: "iec-04",
    unit: "1.Contactos_y_logica",
    folder: "04.Set_y_reset",
    project: "set_y_reset",
    title: "Set y reset",
    bench: "curso-08",
    vars: [
      { name: "MARCHA", type: "BOOL", at: "%IX0.0", doc: "S1, pulsador NA" },
      { name: "PARADA", type: "BOOL", at: "%IX0.1", doc: "S2, pulsador NC" },
      { name: "TERMICO", type: "BOOL", at: "%IX0.2", doc: "F1, térmico NC" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "contactor del motor" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "piloto de falla" },
      { name: "H2", type: "BOOL", at: "%QX0.2", doc: "piloto de marcha" },
      { name: "FALLA", type: "BOOL", doc: "falla del térmico memorizada" },
      { name: "RS_KM1", type: "RS" },
      { name: "SR_FALLA", type: "SR" },
    ],
    example: {
      st: `(* Set y reset: MARCHA pone KM1 en TRUE y ahí queda;
   PARADA o el térmico lo vuelven a FALSE. El reset va después: gana. *)
IF MARCHA THEN
  KM1 := TRUE;
END_IF;
IF NOT PARADA OR NOT TERMICO THEN
  KM1 := FALSE;
END_IF;

H2 := KM1;`,
      ld: {
        rungs: [
          { comment: "Set: MARCHA enciende KM1", elements: ["MARCHA", "S=KM1"] },
          { comment: "Reset: PARADA o el térmico lo apagan", elements: ["!PARADA", "R=KM1"], branches: [{ at: 0, elements: ["!TERMICO"] }] },
          { comment: "Piloto de marcha", elements: ["KM1", "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "RS", inst: "RS_KM1", in: { S: "MARCHA", R1: ["OR", ["NOT", "PARADA"], ["NOT", "TERMICO"]] }, out: { Q1: "KM1" } },
          { out: "H2", expr: "KM1" },
        ],
      },
    },
    solution: {
      st: `(* La falla se memoriza al abrirse el térmico y solo PARADA la
   reconoce, con el térmico ya rearmado. *)
IF NOT TERMICO THEN
  FALLA := TRUE;
END_IF;
IF NOT PARADA AND TERMICO THEN
  FALLA := FALSE;
END_IF;

IF MARCHA AND NOT FALLA THEN
  KM1 := TRUE;
END_IF;
IF NOT PARADA OR NOT TERMICO THEN
  KM1 := FALSE;
END_IF;

H1 := FALLA;
H2 := KM1;`,
      ld: {
        rungs: [
          { comment: "La falla se memoriza", elements: ["!TERMICO", "S=FALLA"] },
          { comment: "PARADA la reconoce con el térmico rearmado", elements: ["!PARADA", "TERMICO", "R=FALLA"] },
          { comment: "Set: MARCHA sin falla", elements: ["MARCHA", "!FALLA", "S=KM1"] },
          { comment: "Reset: PARADA o el térmico", elements: ["!PARADA", "R=KM1"], branches: [{ at: 0, elements: ["!TERMICO"] }] },
          { comment: "Piloto de falla", elements: ["FALLA", "=H1"] },
          { comment: "Piloto de marcha", elements: ["KM1", "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "SR", inst: "SR_FALLA", in: { S1: ["NOT", "TERMICO"], R: ["AND", ["NOT", "PARADA"], "TERMICO"] }, out: { Q1: "FALLA" } },
          { fb: "RS", inst: "RS_KM1", in: { S: ["AND", "MARCHA", ["NOT", "FALLA"]], R1: ["OR", ["NOT", "PARADA"], ["NOT", "TERMICO"]] }, out: { Q1: "KM1" } },
          { out: "H1", expr: "FALLA" },
          { out: "H2", expr: "KM1" },
        ],
      },
    },
    brief: {
      goal: "Falla del térmico memorizada en H1 (Q0.1): tras dispararse, MARCHA no arranca hasta reconocerla con PARADA.",
      steps: ["Ejecuta el ejemplo: MARCHA pone KM1 y PARADA lo quita.", "Memoriza la falla: una variable FALLA que se pone con el térmico abierto.", "PARADA la reconoce (la borra) solo con el térmico ya rearmado.", "MARCHA solo arranca sin falla; H1 muestra la falla."],
      uses: ["%IX0.0 · S1, MARCHA (NA)", "%IX0.1 · S2, PARADA (NC)", "%IX0.2 · F1, térmico (NC)", "%QX0.0 · KM1, contactor", "%QX0.1 · H1, falla", "%QX0.2 · H2, marcha"],
      teaches: "Set y reset (bobinas S y R, bloques SR y RS) guardan un estado hasta que otra condición lo borra; el que se escribe al final gana.",
    },
    rubric: {
      goals: [
        { id: "disparo", description: "Dispara el térmico (aprieta F1): el motor para y H1 enciende", when: { I0_2: 0, Q0_0: 0, Q0_1: 1 }, hold_ms: 300 },
        { id: "memoria", description: "Con el térmico rearmado, H1 sigue encendido", when: { I0_2: 1, Q0_1: 1 }, hold_ms: 500, after: "disparo", hint: "Set de FALLA con el térmico abierto; el reset es otro peldaño." },
        { id: "bloqueo", description: "Sin reconocer, MARCHA no arranca", when: { I0_0: 1, Q0_0: 0, Q0_1: 1 }, hold_ms: 300, after: "disparo" },
        { id: "reconoce", description: "Tras apretar PARADA, H1 se apaga y MARCHA arranca de nuevo", when: { Q0_0: 1, Q0_1: 0 }, hold_ms: 500, after: "bloqueo", why: "La falla queda memorizada: alguien tiene que verla y reconocerla antes de volver a arrancar." },
      ],
      cases: [
        {
          name: "Reconocimiento de la falla",
          until_ms: 6000,
          actions: [...press("S1", 800, 300), ...press("F1", 1800, 400), ...press("S1", 2800, 400), ...press("S2", 3800, 200), ...press("S1", 4600, 300)],
          checks: [
            ev("Arranca con MARCHA", 1, 800, 1300, { Q0_0: 1 }, 200),
            ev("El térmico detiene el motor", 2, 1800, 2100, { Q0_0: 0 }),
            ev("H1 avisa la falla", 3, 1800, 2200, { Q0_1: 1 }),
            always("H1 sigue encendido con el térmico rearmado", 3, 2300, 3750, { Q0_1: 1 }),
            never("Sin reconocer, MARCHA no arranca", 5, 2800, 3700, { Q0_0: 1 }),
            ev("PARADA apaga H1", 2, 3800, 4300, { Q0_1: 0 }),
            ev("Tras PARADA, MARCHA arranca", 4, 4600, 5100, { Q0_0: 1 }, 200),
          ],
        },
      ],
      goal_runs: [{ name: "Falla y reconocimiento", until_ms: 9000, actions: [...press("S1", 1000, 300), ...press("F1", 2000, 500), ...press("S1", 3500, 600), ...press("S2", 5000, 300), ...press("S1", 6500, 300)] }],
    },
  },
  // ======================================================== Unidad 2
  {
    id: "iec-05",
    unit: "2.Tiempo_y_conteo",
    folder: "05.Temporizadores_TON_y_TOF",
    project: "temporizadores",
    title: "Temporizadores TON y TOF",
    bench: "curso-09",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "arranque" },
      { name: "B1", type: "BOOL", at: "%IX0.1", doc: "presencia (selector)" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "arranque" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "luz del pasillo" },
      { name: "HA1", type: "BOOL", at: "%QX0.2", doc: "bocina" },
      { name: "ARRANQUE", type: "TON" },
      { name: "PASILLO", type: "TOF" },
      { name: "BOCINA", type: "TON" },
    ],
    example: {
      st: `(* TON: H1 se enciende cuando S1 lleva 3 s apretado. *)
ARRANQUE(IN := S1, PT := T#3s);
H1 := ARRANQUE.Q;

(* TOF: la luz del pasillo sigue 10 s después de la última presencia. *)
PASILLO(IN := B1, PT := T#10s);
H2 := PASILLO.Q;`,
      ld: {
        rungs: [
          { comment: "TON: retardo a la conexión", elements: ["S1", { fb: "TON", inst: "ARRANQUE", pins: { PT: "T#3s" } }, "=H1"] },
          { comment: "TOF: retardo a la desconexión", elements: ["B1", { fb: "TOF", inst: "PASILLO", pins: { PT: "T#10s" } }, "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "TON", inst: "ARRANQUE", in: { IN: "S1", PT: "T#3s" }, out: { Q: "H1" } },
          { fb: "TOF", inst: "PASILLO", in: { IN: "B1", PT: "T#10s" }, out: { Q: "H2" } },
        ],
      },
    },
    solution: {
      st: `ARRANQUE(IN := S1, PT := T#2s);
H1 := ARRANQUE.Q;

PASILLO(IN := B1, PT := T#5s);
H2 := PASILLO.Q;

(* Alarma de tiempo: presencia de más de 30 s. *)
BOCINA(IN := B1, PT := T#30s);
HA1 := BOCINA.Q;`,
      ld: {
        rungs: [
          { comment: "TON: retardo a la conexión", elements: ["S1", { fb: "TON", inst: "ARRANQUE", pins: { PT: "T#2s" } }, "=H1"] },
          { comment: "TOF: retardo a la desconexión", elements: ["B1", { fb: "TOF", inst: "PASILLO", pins: { PT: "T#5s" } }, "=H2"] },
          { comment: "Bocina si la presencia dura más de 30 s", elements: ["B1", { fb: "TON", inst: "BOCINA", pins: { PT: "T#30s" } }, "=HA1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "TON", inst: "ARRANQUE", in: { IN: "S1", PT: "T#2s" }, out: { Q: "H1" } },
          { fb: "TOF", inst: "PASILLO", in: { IN: "B1", PT: "T#5s" }, out: { Q: "H2" } },
          { fb: "TON", inst: "BOCINA", in: { IN: "B1", PT: "T#30s" }, out: { Q: "HA1" } },
        ],
      },
    },
    brief: {
      goal: "Arranque a los 2 s, luz de pasillo de 5 s y una bocina si la presencia dura más de 30 s.",
      steps: ["Ejecuta el ejemplo: mantén S1 3 s y activa la presencia B1.", "Cambia el arranque a 2 s y la luz del pasillo a 5 s (PT).", "Agrega un tercer temporizador: HA1 (Q0.2) suena si la presencia dura más de 30 s.", "Prueba los tres tiempos."],
      uses: ["%IX0.0 · S1, arranque", "%IX0.1 · B1, presencia (selector)", "%QX0.0 · H1, arranque", "%QX0.1 · H2, luz del pasillo", "%QX0.2 · HA1, bocina"],
      teaches: "TON retrasa el encendido, TOF retrasa el apagado; cada uso es una instancia con su nombre y su tiempo PT.",
    },
    rubricFrom: "curso-09",
    hints: { arranque: "PT := T#2s en el TON del arranque.", bocina: "Otro TON con IN := B1 y PT := T#30s; su Q a HA1." },
  },
  {
    id: "iec-06",
    unit: "2.Tiempo_y_conteo",
    folder: "06.Flancos",
    project: "flancos",
    title: "Flancos: un pulsador que enciende y apaga",
    bench: "curso-07",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "pulsador NA" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "luz que cambia al apretar" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "luz que cambia al soltar" },
      { name: "APRIETA", type: "R_TRIG" },
      { name: "SUELTA", type: "F_TRIG" },
      { name: "PULSO", type: "BOOL", doc: "un ciclo al apretar" },
      { name: "PULSO2", type: "BOOL", doc: "un ciclo al soltar" },
    ],
    example: {
      st: `(* R_TRIG da TRUE un solo ciclo cuando S1 pasa de suelto a apretado. *)
APRIETA(CLK := S1);
IF APRIETA.Q THEN
  H1 := NOT H1;  (* telerruptor: cada pulsación cambia la luz *)
END_IF;`,
      ld: {
        rungs: [
          { comment: "Flanco de subida de S1: un ciclo", elements: ["^S1", "=PULSO"] },
          { comment: "Con el pulso, H1 cambia: O exclusivo", elements: ["H1", { fb: "XOR", pins: { IN2: "PULSO" } }, "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "APRIETA", in: { CLK: "S1" }, out: { Q: "PULSO" } },
          { out: "H1", expr: ["XOR", "H1", "PULSO"] },
        ],
      },
    },
    solution: {
      st: `APRIETA(CLK := S1);
IF APRIETA.Q THEN
  H1 := NOT H1;
END_IF;

(* F_TRIG: un ciclo cuando S1 se suelta. *)
SUELTA(CLK := S1);
IF SUELTA.Q THEN
  H2 := NOT H2;
END_IF;`,
      ld: {
        rungs: [
          { comment: "Flanco de subida de S1: un ciclo", elements: ["^S1", "=PULSO"] },
          { comment: "Con el pulso, H1 cambia: O exclusivo", elements: ["H1", { fb: "XOR", pins: { IN2: "PULSO" } }, "=H1"] },
          { comment: "Flanco de bajada de S1: un ciclo", elements: ["vS1", "=PULSO2"] },
          { comment: "Con el pulso de bajada, H2 cambia", elements: ["H2", { fb: "XOR", pins: { IN2: "PULSO2" } }, "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "APRIETA", in: { CLK: "S1" }, out: { Q: "PULSO" } },
          { out: "H1", expr: ["XOR", "H1", "PULSO"] },
          { fb: "F_TRIG", inst: "SUELTA", in: { CLK: "S1" }, out: { Q: "PULSO2" } },
          { out: "H2", expr: ["XOR", "H2", "PULSO2"] },
        ],
      },
    },
    brief: {
      goal: "Una segunda luz H2 (Q0.1) que cambia al SOLTAR S1 (flanco de bajada).",
      steps: ["Ejecuta el ejemplo: cada pulsación cambia H1.", "Mantén S1 apretado: H1 no parpadea, cambia una sola vez.", "Agrega un flanco de bajada (F_TRIG) que cambie H2 al soltar.", "Prueba varias pulsaciones."],
      uses: ["%IX0.0 · S1, pulsador NA", "%QX0.0 · H1, piloto verde", "%QX0.1 · H2, piloto amarillo"],
      teaches: "Un flanco dura un solo ciclo: R_TRIG al apretar, F_TRIG al soltar. Con él una acción pasa una vez por pulsación.",
    },
    rubric: {
      goals: [
        { id: "baja", description: "Al soltar S1, H2 (Q0.1) cambia", when: { I0_0: 0, Q0_1: 1 }, hold_ms: 300, hint: "F_TRIG con CLK := S1, o un contacto de flanco de bajada." },
        { id: "baja_otra", description: "Otra pulsación completa vuelve a cambiar H2", when: { I0_0: 0, Q0_1: 0 }, hold_ms: 300, after: "baja", why: "Cada flanco es un solo ciclo: la luz cambia una vez por cada vez que se suelta." },
      ],
      cases: [
        {
          name: "Flanco de bajada",
          until_ms: 4000,
          actions: [...press("S1", 1000, 500), ...press("S1", 2500, 500)],
          checks: [
            never("H2 no cambia al apretar", 4, 1000, 1480, { Q0_1: 1 }),
            ev("H2 se enciende al soltar", 5, 1500, 1800, { Q0_1: 1 }),
            always("H2 sigue encendido mientras se aprieta otra vez", 3, 2550, 2980, { Q0_1: 1 }),
            ev("H2 se apaga al soltar otra vez", 5, 3000, 3300, { Q0_1: 0 }),
            ev("H1 sigue cambiando al apretar", 3, 1000, 1300, { Q0_0: 1 }),
          ],
        },
      ],
      goal_runs: [{ name: "Pulsaciones", until_ms: 7000, actions: [...press("S1", 1500, 600), ...press("S1", 3500, 600), ...press("S1", 5500, 600)] }],
    },
  },
  {
    id: "iec-07",
    unit: "2.Tiempo_y_conteo",
    folder: "07.Contadores",
    project: "contadores",
    title: "Contadores",
    bench: "curso-10",
    vars: [
      { name: "B1", type: "BOOL", at: "%IX0.0", doc: "sensor de piezas" },
      { name: "S1", type: "BOOL", at: "%IX0.1", doc: "RESET" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "motor de la cinta" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "caja llena" },
      { name: "PIEZAS", type: "CTU" },
      { name: "LLENA", type: "BOOL" },
      { name: "CUENTA", type: "INT", doc: "piezas en la caja" },
    ],
    example: {
      st: `(* CTU cuenta cada flanco de subida de CU; Q se activa al llegar a PV. *)
PIEZAS(CU := B1, R := FALSE, PV := 10);
CUENTA := PIEZAS.CV;
LLENA := PIEZAS.Q;

KM1 := NOT LLENA;  (* la cinta para con la caja llena *)
H1 := LLENA;`,
      ld: {
        rungs: [
          { comment: "Cuenta piezas hasta 10", elements: ["B1", { fb: "CTU", inst: "PIEZAS", pins: { R: "FALSE", PV: "10", CV: "CUENTA" } }, "=LLENA"] },
          { comment: "La cinta para con la caja llena", elements: ["!LLENA", "=KM1"] },
          { comment: "Aviso de caja llena", elements: ["LLENA", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "CTU", inst: "PIEZAS", in: { CU: "B1", R: "FALSE", PV: "10" }, out: { Q: "LLENA", CV: "CUENTA" } },
          { out: "KM1", expr: ["NOT", "LLENA"] },
          { out: "H1", expr: "LLENA" },
        ],
      },
    },
    solution: {
      st: `(* Cajas de 24; RESET (S1) empieza una caja nueva. *)
PIEZAS(CU := B1, R := S1, PV := 24);
CUENTA := PIEZAS.CV;
LLENA := PIEZAS.Q;

KM1 := NOT LLENA;
H1 := LLENA;`,
      ld: {
        rungs: [
          { comment: "Cuenta piezas hasta 24; S1 vuelve a cero", elements: ["B1", { fb: "CTU", inst: "PIEZAS", pins: { R: "S1", PV: "24", CV: "CUENTA" } }, "=LLENA"] },
          { comment: "La cinta para con la caja llena", elements: ["!LLENA", "=KM1"] },
          { comment: "Aviso de caja llena", elements: ["LLENA", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "CTU", inst: "PIEZAS", in: { CU: "B1", R: "S1", PV: "24" }, out: { Q: "LLENA", CV: "CUENTA" } },
          { out: "KM1", expr: ["NOT", "LLENA"] },
          { out: "H1", expr: "LLENA" },
        ],
      },
    },
    brief: {
      goal: "Cajas de 24 piezas y RESET (S1) que empieza una caja nueva.",
      steps: ["Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 para la cinta.", "Cambia la meta a 24 piezas (PV).", "Conecta RESET: S1 a la entrada R del contador.", "Llena una caja y empieza otra."],
      uses: ["%IX0.0 · B1, sensor de piezas", "%IX0.1 · S1, RESET", "%QX0.0 · KM1, motor de la cinta", "%QX0.1 · H1, caja llena"],
      teaches: "CTU suma uno en cada flanco de CU, avisa con Q al llegar a PV y vuelve a cero con R; CV es la cuenta.",
    },
    rubric: {
      goals: [
        { id: "llena", description: "Con 24 piezas la cinta para y H1 avisa", when: { Q0_0: 0, Q0_1: 1 }, hold_ms: 300, hint: "PV := 24 en el contador." },
        { id: "reset", description: "RESET (S1) arranca otra caja", when: { I0_1: 1, Q0_0: 1, Q0_1: 0 }, hold_ms: 100, after: "llena", hint: "S1 a la entrada R del CTU.", why: "R pone la cuenta en cero: la caja nueva empieza vacía." },
      ],
      cases: [
        {
          name: "Caja de 24",
          until_ms: 7200,
          actions: [...Array.from({ length: 24 }, (_, i) => press("B1", 1000 + i * 200, 100)).flat(), ...press("S1", 6200, 200)],
          checks: [
            expect("Con 23 piezas la cinta sigue", 5, 5550, { Q0_0: 1, Q0_1: 0 }),
            ev("Con 24 piezas: cinta parada y caja llena", 8, 5700, 6100, { Q0_0: 0, Q0_1: 1 }),
            ev("RESET arranca otra caja", 7, 6200, 6700, { Q0_0: 1, Q0_1: 0 }),
          ],
        },
      ],
      goal_runs: [{ name: "Una caja", until_ms: 9000, actions: [...Array.from({ length: 24 }, (_, i) => press("B1", 1000 + i * 250, 120)).flat(), ...press("S1", 8000, 300)] }],
    },
  },
  {
    id: "iec-08",
    unit: "2.Tiempo_y_conteo",
    folder: "08.Intermitencia",
    project: "intermitencia",
    title: "Intermitencia con dos temporizadores",
    bench: "curso-06",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "pulsador NA" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "piloto verde" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "piloto amarillo" },
      { name: "H3", type: "BOOL", at: "%QX0.2", doc: "piloto rojo" },
      { name: "T_ON", type: "TON" },
      { name: "T_OFF", type: "TON" },
      { name: "L_ON", type: "TON" },
      { name: "L_OFF", type: "TON" },
      { name: "ENCENDIDO", type: "BOOL" },
      { name: "APAGADO", type: "BOOL" },
      { name: "LENTO_ON", type: "BOOL" },
      { name: "LENTO_OFF", type: "BOOL" },
    ],
    example: {
      st: `(* Dos TON en anillo: uno cuenta el tiempo apagado y el otro el
   encendido; al terminar el segundo, los dos vuelven a cero. *)
T_ON(IN := NOT APAGADO, PT := T#500ms);
ENCENDIDO := T_ON.Q;
T_OFF(IN := ENCENDIDO, PT := T#500ms);
APAGADO := T_OFF.Q;

H1 := ENCENDIDO;`,
      ld: {
        rungs: [
          { comment: "Tiempo apagado: 500 ms", elements: ["!APAGADO", { fb: "TON", inst: "T_ON", pins: { PT: "T#500ms" } }, "=ENCENDIDO"] },
          { comment: "Tiempo encendido: 500 ms", elements: ["ENCENDIDO", { fb: "TON", inst: "T_OFF", pins: { PT: "T#500ms" } }, "=APAGADO"] },
          { comment: "H1 parpadea", elements: ["ENCENDIDO", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "TON", inst: "T_ON", in: { IN: ["NOT", "APAGADO"], PT: "T#500ms" }, out: { Q: "ENCENDIDO" } },
          { fb: "TON", inst: "T_OFF", in: { IN: "ENCENDIDO", PT: "T#500ms" }, out: { Q: "APAGADO" } },
          { out: "H1", expr: "ENCENDIDO" },
        ],
      },
    },
    solution: {
      st: `T_ON(IN := NOT APAGADO, PT := T#500ms);
ENCENDIDO := T_ON.Q;
T_OFF(IN := ENCENDIDO, PT := T#500ms);
APAGADO := T_OFF.Q;
H1 := ENCENDIDO;

(* Otra intermitencia, lenta: 2 s y 2 s. *)
L_ON(IN := NOT LENTO_OFF, PT := T#2s);
LENTO_ON := L_ON.Q;
L_OFF(IN := LENTO_ON, PT := T#2s);
LENTO_OFF := L_OFF.Q;
H3 := LENTO_ON;

(* H2 sigue a S1 al instante: nada espera. *)
H2 := S1;`,
      ld: {
        rungs: [
          { comment: "Tiempo apagado: 500 ms", elements: ["!APAGADO", { fb: "TON", inst: "T_ON", pins: { PT: "T#500ms" } }, "=ENCENDIDO"] },
          { comment: "Tiempo encendido: 500 ms", elements: ["ENCENDIDO", { fb: "TON", inst: "T_OFF", pins: { PT: "T#500ms" } }, "=APAGADO"] },
          { comment: "H1 parpadea", elements: ["ENCENDIDO", "=H1"] },
          { comment: "Lenta: 2 s apagado", elements: ["!LENTO_OFF", { fb: "TON", inst: "L_ON", pins: { PT: "T#2s" } }, "=LENTO_ON"] },
          { comment: "Lenta: 2 s encendido", elements: ["LENTO_ON", { fb: "TON", inst: "L_OFF", pins: { PT: "T#2s" } }, "=LENTO_OFF"] },
          { comment: "H3 parpadea lento", elements: ["LENTO_ON", "=H3"] },
          { comment: "H2 sigue a S1", elements: ["S1", "=H2"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "TON", inst: "T_ON", in: { IN: ["NOT", "APAGADO"], PT: "T#500ms" }, out: { Q: "ENCENDIDO" } },
          { fb: "TON", inst: "T_OFF", in: { IN: "ENCENDIDO", PT: "T#500ms" }, out: { Q: "APAGADO" } },
          { out: "H1", expr: "ENCENDIDO" },
          { fb: "TON", inst: "L_ON", in: { IN: ["NOT", "LENTO_OFF"], PT: "T#2s" }, out: { Q: "LENTO_ON" } },
          { fb: "TON", inst: "L_OFF", in: { IN: "LENTO_ON", PT: "T#2s" }, out: { Q: "LENTO_OFF" } },
          { out: "H3", expr: "LENTO_ON" },
          { out: "H2", expr: "S1" },
        ],
      },
    },
    brief: {
      goal: "H3 (Q0.2) parpadea 2 s encendido y 2 s apagado, y H2 (Q0.1) sigue a S1 al instante.",
      steps: ["Ejecuta el ejemplo: H1 parpadea cada 500 ms.", "Arma otra intermitencia, lenta, de 2 s y 2 s para H3.", "H2 sigue a S1 sin esperar.", "Mira las tres luces a la vez: ninguna frena a las otras."],
      uses: ["%IX0.0 · S1, pulsador NA", "%QX0.0 · H1, piloto verde", "%QX0.1 · H2, piloto amarillo", "%QX0.2 · H3, piloto rojo"],
      teaches: "Dos TON en anillo arman un generador de pulsos; el PLC nunca se detiene a esperar, por eso todo lo demás sigue respondiendo.",
    },
    rubric: {
      goals: [
        { id: "lenta", description: "H3 (Q0.2) parpadea 2 s encendido y 2 s apagado", period: "Q0_2", on_ms: [1900, 2100], off_ms: [1900, 2100], cycles: 2, hint: "Copia el anillo de dos TON con PT := T#2s." },
        { id: "s1", description: "H2 (Q0.1) sigue a S1 al instante", when: { I0_0: 1, Q0_1: 1 }, hold_ms: 200 },
      ],
      cases: [
        {
          name: "Dos intermitencias y el pulsador",
          until_ms: 12000,
          actions: [...press("S1", 3000, 500), ...press("S1", 6200, 400)],
          checks: [
            { description: "H3: 2 s encendido y 2 s apagado", points: 10, from_ms: 0, to_ms: 12000, period: "Q0_2", on_ms: [1900, 2100], off_ms: [1900, 2100], cycles: 2 },
            { description: "H1 sigue cada 500 ms", points: 4, from_ms: 0, to_ms: 12000, period: "Q0_0", on_ms: [450, 560], off_ms: [450, 560], cycles: 4 },
            { description: "H2 sigue a S1 al instante", points: 6, from_ms: 2500, to_ms: 7000, responds: { when: { I0_0: 1 }, expect: { Q0_1: 1 } }, within_ms: 60 },
          ],
        },
      ],
      goal_runs: [{ name: "Intermitencias", until_ms: 12000, actions: [...press("S1", 3000, 800)] }],
    },
  },
  // ======================================================== Unidad 3
  {
    id: "iec-09",
    unit: "3.Secuencias",
    folder: "09.Etapas_un_semaforo",
    project: "etapas_semaforo",
    title: "Etapas: un semáforo",
    bench: "curso-11",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "botón del peatón" },
      { name: "SA1", type: "BOOL", at: "%IX0.1", doc: "modo noche" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "rojo" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "amarillo" },
      { name: "H3", type: "BOOL", at: "%QX0.2", doc: "verde" },
      { name: "H4", type: "BOOL", at: "%QX0.3", doc: "verde peatonal" },
      { name: "X1", type: "BOOL", doc: "etapa VERDE" },
      { name: "X2", type: "BOOL", doc: "etapa AMARILLO" },
      { name: "X3", type: "BOOL", doc: "etapa ROJO" },
      { name: "T1", type: "BOOL", doc: "transición VERDE → AMARILLO" },
      { name: "T2", type: "BOOL", doc: "transición AMARILLO → ROJO" },
      { name: "T3", type: "BOOL", doc: "transición ROJO → VERDE" },
      { name: "ARRANQUE", type: "BOOL", doc: "solo en la primera vuelta" },
      { name: "INICIADO", type: "BOOL" },
      { name: "PEATON", type: "BOOL", doc: "pedido del peatón" },
      { name: "PIDE", type: "BOOL", doc: "peatón o verde máximo" },
      { name: "T_VMIN", type: "TON" },
      { name: "T_VMAX", type: "TON" },
      { name: "T_AMA", type: "TON" },
      { name: "T_ROJO", type: "TON" },
      { name: "FIN_VMIN", type: "BOOL" },
      { name: "FIN_VMAX", type: "BOOL" },
      { name: "FIN_AMA", type: "BOOL" },
      { name: "FIN_ROJO", type: "BOOL" },
      { name: "T_ULT", type: "TON" },
      { name: "ULTIMOS", type: "BOOL", doc: "últimos 3 s del rojo" },
      { name: "T_ON", type: "TON" },
      { name: "T_OFF", type: "TON" },
      { name: "ENCENDIDO", type: "BOOL" },
      { name: "APAGADO", type: "BOOL" },
      { name: "AMA_NORMAL", type: "BOOL" },
    ],
    example: {
      st: SEMAFORO_ST + `

(* Salidas: cada luz depende solo de su etapa. *)
H1 := X3;
H2 := X2;
H3 := X1;
H4 := X3;`,
      ld: { rungs: [...SEMAFORO_LD, { comment: "Rojo", elements: ["X3", "=H1"] }, { comment: "Amarillo", elements: ["X2", "=H2"] }, { comment: "Verde", elements: ["X1", "=H3"] }, { comment: "Verde peatonal", elements: ["X3", "=H4"] }] },
      fbd: { networks: [...SEMAFORO_FBD, { out: "H1", expr: "X3" }, { out: "H2", expr: "X2" }, { out: "H3", expr: "X1" }, { out: "H4", expr: "X3" }] },
    },
    solution: {
      st: SEMAFORO_ST + `

(* Los últimos 3 s del rojo: 5 s después de entrar en la etapa. *)
T_ULT(IN := X3, PT := T#5s);
ULTIMOS := T_ULT.Q;

(* Intermitencia de medio segundo (lección 08). *)
T_ON(IN := NOT APAGADO, PT := T#500ms);
ENCENDIDO := T_ON.Q;
T_OFF(IN := ENCENDIDO, PT := T#500ms);
APAGADO := T_OFF.Q;

(* Salidas. El modo noche (SA1) manda sobre la secuencia. *)
H1 := X3 AND NOT SA1;
AMA_NORMAL := X2 AND NOT SA1;
H2 := AMA_NORMAL OR (SA1 AND ENCENDIDO);
H3 := X1 AND NOT SA1;
H4 := X3 AND NOT SA1 AND (NOT ULTIMOS OR ENCENDIDO);`,
      ld: {
        rungs: [
          ...SEMAFORO_LD,
          { comment: "Últimos 3 s del rojo", elements: ["X3", { fb: "TON", inst: "T_ULT", pins: { PT: "T#5s" } }, "=ULTIMOS"] },
          { comment: "Intermitencia: tiempo apagado", elements: ["!APAGADO", { fb: "TON", inst: "T_ON", pins: { PT: "T#500ms" } }, "=ENCENDIDO"] },
          { comment: "Intermitencia: tiempo encendido", elements: ["ENCENDIDO", { fb: "TON", inst: "T_OFF", pins: { PT: "T#500ms" } }, "=APAGADO"] },
          { comment: "Rojo, salvo de noche", elements: ["X3", "!SA1", "=H1"] },
          { comment: "Amarillo normal", elements: ["X2", "!SA1", "=AMA_NORMAL"] },
          { comment: "Amarillo: normal, o intermitente de noche", elements: ["AMA_NORMAL", "=H2"], branches: [{ at: 0, elements: ["SA1", "ENCENDIDO"] }] },
          { comment: "Verde, salvo de noche", elements: ["X1", "!SA1", "=H3"] },
          { comment: "Verde peatonal: fijo y, en los últimos 3 s, intermitente", elements: ["X3", "!SA1", "!ULTIMOS", "=H4"], branches: [{ at: 2, elements: ["ENCENDIDO"] }] },
        ],
      },
      fbd: {
        networks: [
          ...SEMAFORO_FBD,
          { fb: "TON", inst: "T_ULT", in: { IN: "X3", PT: "T#5s" }, out: { Q: "ULTIMOS" } },
          { fb: "TON", inst: "T_ON", in: { IN: ["NOT", "APAGADO"], PT: "T#500ms" }, out: { Q: "ENCENDIDO" } },
          { fb: "TON", inst: "T_OFF", in: { IN: "ENCENDIDO", PT: "T#500ms" }, out: { Q: "APAGADO" } },
          { out: "H1", expr: ["AND", "X3", ["NOT", "SA1"]] },
          { out: "AMA_NORMAL", expr: ["AND", "X2", ["NOT", "SA1"]] },
          { out: "H2", expr: ["OR", "AMA_NORMAL", ["AND", "SA1", "ENCENDIDO"]] },
          { out: "H3", expr: ["AND", "X1", ["NOT", "SA1"]] },
          { out: "H4", expr: ["AND", "X3", ["NOT", "SA1"], ["OR", ["NOT", "ULTIMOS"], "ENCENDIDO"]] },
        ],
      },
    },
    brief: {
      goal: "Verde peatonal (Q0.3) que parpadea en sus últimos 3 s y modo noche (SA1) con el amarillo intermitente.",
      steps: ["Ejecuta el ejemplo y aprieta el botón del peatón (S1): el verde dura al menos 10 s, luego amarillo 3 s y rojo 8 s.", "Con otro TON de 5 s en la etapa ROJO, haz parpadear el verde peatonal en los últimos 3 s.", "Con SA1 (I0.1) activo: modo noche, solo el amarillo parpadea cada medio segundo."],
      uses: ["%IX0.0 · S1, botón del peatón", "%IX0.1 · SA1, modo noche", "%QX0.0 · H1, rojo", "%QX0.1 · H2, amarillo", "%QX0.2 · H3, verde", "%QX0.3 · H4, verde peatonal"],
      teaches: "Una secuencia se arma con un bit por etapa y una transición entre etapas; cada etapa enciende sus salidas y lleva su propio temporizador.",
    },
    rubricFrom: "curso-11",
    hints: {
      peaton: "Un TON de 5 s con IN := X3 marca los últimos 3 s; ahí H4 := ENCENDIDO (la intermitencia de la lección 08).",
      noche: "Con SA1: H2 := SA1 AND ENCENDIDO, y las demás luces con AND NOT SA1.",
    },
  },
  {
    id: "iec-10",
    unit: "3.Secuencias",
    folder: "10.Etapa_numerada_CASE",
    project: "etapa_numerada",
    title: "Etapa numerada: CASE, comparar y MOVE",
    bench: "retos/06-estrella-triangulo",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "marcha, NA" },
      { name: "S0", type: "BOOL", at: "%IX0.1", doc: "parada, NC: TRUE sin pulsar" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "línea" },
      { name: "KM2", type: "BOOL", at: "%QX0.1", doc: "estrella" },
      { name: "KM3", type: "BOOL", at: "%QX0.2", doc: "triángulo" },
      { name: "H1", type: "BOOL", at: "%QX0.3", doc: "piloto en marcha" },
      { name: "ETAPA", type: "INT", doc: "0 parado, 1 estrella, 2 pausa, 3 triángulo" },
      { name: "T_EST", type: "TON" },
      { name: "T_PAU", type: "TON" },
      { name: "FIN_EST", type: "BOOL" },
      { name: "FIN_PAU", type: "BOOL" },
      { name: "E0", type: "BOOL", doc: "ETAPA = 0", langs: ["ld", "fbd"] },
      { name: "E1", type: "BOOL", doc: "ETAPA = 1", langs: ["ld", "fbd"] },
      { name: "E2", type: "BOOL", doc: "ETAPA = 2", langs: ["ld", "fbd"] },
      { name: "E3", type: "BOOL", doc: "ETAPA = 3", langs: ["ld", "fbd"] },
    ],
    example: {
      st: `(* Temporizador de la etapa 1 (estrella). *)
T_EST(IN := ETAPA = 1, PT := T#3s);
FIN_EST := T_EST.Q;

(* CASE elige el bloque de la etapa actual: solo se revisan sus condiciones. *)
CASE ETAPA OF
  0: (* PARADO: espera la marcha *)
    IF S1 AND S0 THEN
      ETAPA := 1;
    END_IF;
  1: (* ESTRELLA: 3 s *)
    IF FIN_EST THEN
      ETAPA := 2;
    END_IF;
END_CASE;

(* La parada manda en cualquier etapa (S0 es NC). *)
IF NOT S0 THEN
  ETAPA := 0;
END_IF;

(* Salidas según la etapa. *)
KM1 := ETAPA > 0;
KM2 := ETAPA = 1;
KM3 := ETAPA = 2;`,
      ld: {
        rungs: [
          { comment: "¿En qué etapa está?", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "0", OUT: "E0" } }] },
          { comment: "", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "1", OUT: "E1" } }] },
          { comment: "", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "2", OUT: "E2" } }] },
          { comment: "Estrella: 3 s", elements: ["E1", { fb: "TON", inst: "T_EST", pins: { PT: "T#3s" } }, "=FIN_EST"] },
          { comment: "PARADO → ESTRELLA con la marcha", elements: ["E0", "S1", "S0", { fb: "MOVE", en: true, pins: { IN: "1", OUT: "ETAPA" } }] },
          { comment: "ESTRELLA → TRIÁNGULO a los 3 s", elements: ["E1", "FIN_EST", { fb: "MOVE", en: true, pins: { IN: "2", OUT: "ETAPA" } }] },
          { comment: "La parada manda en cualquier etapa", elements: ["!S0", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "ETAPA" } }] },
          { comment: "Línea: en cualquier etapa menos la 0", elements: ["!E0", "=KM1"] },
          { comment: "Estrella", elements: ["E1", "=KM2"] },
          { comment: "Triángulo", elements: ["E2", "=KM3"] },
        ],
      },
      fbd: {
        networks: [
          { out: "E0", expr: ["EQ", "ETAPA", "0"] },
          { out: "E1", expr: ["EQ", "ETAPA", "1"] },
          { out: "E2", expr: ["EQ", "ETAPA", "2"] },
          { fb: "TON", inst: "T_EST", in: { IN: "E1", PT: "T#3s" }, out: { Q: "FIN_EST" } },
          { out: "ETAPA", expr: ["SEL", ["AND", "E0", "S1", "S0"], "ETAPA", "1"] },
          { out: "ETAPA", expr: ["SEL", ["AND", "E1", "FIN_EST"], "ETAPA", "2"] },
          { out: "ETAPA", expr: ["SEL", ["NOT", "S0"], "ETAPA", "0"] },
          { out: "KM1", expr: ["NOT", "E0"] },
          { out: "KM2", expr: "E1" },
          { out: "KM3", expr: "E2" },
        ],
      },
    },
    solution: {
      st: `T_EST(IN := ETAPA = 1, PT := T#3s);
FIN_EST := T_EST.Q;
(* Pausa de 100 ms con los dos contactores abiertos. *)
T_PAU(IN := ETAPA = 2, PT := T#100ms);
FIN_PAU := T_PAU.Q;

CASE ETAPA OF
  0: (* PARADO *)
    IF S1 AND S0 THEN
      ETAPA := 1;
    END_IF;
  1: (* ESTRELLA *)
    IF FIN_EST THEN
      ETAPA := 2;
    END_IF;
  2: (* PAUSA *)
    IF FIN_PAU THEN
      ETAPA := 3;
    END_IF;
END_CASE;

IF NOT S0 THEN
  ETAPA := 0;
END_IF;

KM1 := ETAPA > 0;
KM2 := ETAPA = 1;
KM3 := ETAPA = 3;
H1 := ETAPA > 0;`,
      ld: {
        rungs: [
          { comment: "¿En qué etapa está?", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "0", OUT: "E0" } }] },
          { comment: "", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "1", OUT: "E1" } }] },
          { comment: "", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "2", OUT: "E2" } }] },
          { comment: "", elements: [{ fb: "EQ", en: true, pins: { IN1: "ETAPA", IN2: "3", OUT: "E3" } }] },
          { comment: "Estrella: 3 s", elements: ["E1", { fb: "TON", inst: "T_EST", pins: { PT: "T#3s" } }, "=FIN_EST"] },
          { comment: "Pausa: 100 ms", elements: ["E2", { fb: "TON", inst: "T_PAU", pins: { PT: "T#100ms" } }, "=FIN_PAU"] },
          { comment: "PARADO → ESTRELLA con la marcha", elements: ["E0", "S1", "S0", { fb: "MOVE", en: true, pins: { IN: "1", OUT: "ETAPA" } }] },
          { comment: "ESTRELLA → PAUSA a los 3 s", elements: ["E1", "FIN_EST", { fb: "MOVE", en: true, pins: { IN: "2", OUT: "ETAPA" } }] },
          { comment: "PAUSA → TRIÁNGULO a los 100 ms", elements: ["E2", "FIN_PAU", { fb: "MOVE", en: true, pins: { IN: "3", OUT: "ETAPA" } }] },
          { comment: "La parada manda en cualquier etapa", elements: ["!S0", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "ETAPA" } }] },
          { comment: "Línea", elements: ["!E0", "=KM1"] },
          { comment: "Estrella", elements: ["E1", "=KM2"] },
          { comment: "Triángulo", elements: ["E3", "=KM3"] },
          { comment: "Piloto en marcha", elements: ["!E0", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { out: "E0", expr: ["EQ", "ETAPA", "0"] },
          { out: "E1", expr: ["EQ", "ETAPA", "1"] },
          { out: "E2", expr: ["EQ", "ETAPA", "2"] },
          { out: "E3", expr: ["EQ", "ETAPA", "3"] },
          { fb: "TON", inst: "T_EST", in: { IN: "E1", PT: "T#3s" }, out: { Q: "FIN_EST" } },
          { fb: "TON", inst: "T_PAU", in: { IN: "E2", PT: "T#100ms" }, out: { Q: "FIN_PAU" } },
          { out: "ETAPA", expr: ["SEL", ["AND", "E0", "S1", "S0"], "ETAPA", "1"] },
          { out: "ETAPA", expr: ["SEL", ["AND", "E1", "FIN_EST"], "ETAPA", "2"] },
          { out: "ETAPA", expr: ["SEL", ["AND", "E2", "FIN_PAU"], "ETAPA", "3"] },
          { out: "ETAPA", expr: ["SEL", ["NOT", "S0"], "ETAPA", "0"] },
          { out: "KM1", expr: ["NOT", "E0"] },
          { out: "KM2", expr: "E1" },
          { out: "KM3", expr: "E3" },
          { out: "H1", expr: ["NOT", "E0"] },
        ],
      },
    },
    brief: {
      goal: "Pausa de 100 ms con KM2 y KM3 abiertos entre estrella y triángulo, y piloto H1 (Q0.3) encendido en marcha.",
      steps: ["Ejecuta el ejemplo: con S1 cierran KM1 y KM2 (estrella) y a los 3 s pasa a KM3 (triángulo).", "Agrega una etapa 2, PAUSA, de 100 ms con KM2 y KM3 abiertos; el triángulo pasa a ser la etapa 3.", "Enciende H1 en cualquier etapa menos la 0.", "Comprueba que S0 detiene todo en cualquier etapa."],
      uses: ["%IX0.0 · S1, marcha", "%IX0.1 · S0, parada NC", "%QX0.0 · KM1, línea", "%QX0.1 · KM2, estrella", "%QX0.2 · KM3, triángulo", "%QX0.3 · H1, en marcha"],
      teaches: "Con un número de etapa, CASE (ST) o una comparación por etapa (Ladder y FBD) elige qué condiciones revisar, y MOVE o SEL escriben la etapa siguiente.",
    },
    rubricFrom: "retos/06-estrella-triangulo",
    hints: {
      triangulo: "Una etapa más: 2 = PAUSA con un TON de 100 ms; al vencer, ETAPA := 3 y KM3 := ETAPA = 3.",
    },
  },
  {
    id: "iec-11",
    unit: "3.Secuencias",
    folder: "11.Bloque_de_funcion_propio",
    project: "bloque_propio",
    title: "Bloque de función propio: un motor",
    bench: "curso-12",
    blocks: [MOTOR_FB],
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "marcha bomba 1, NA" },
      { name: "S2", type: "BOOL", at: "%IX0.1", doc: "parada bomba 1, NC" },
      { name: "S3", type: "BOOL", at: "%IX0.2", doc: "marcha bomba 2, NA" },
      { name: "S4", type: "BOOL", at: "%IX0.3", doc: "parada bomba 2, NC" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "bomba 1" },
      { name: "KM2", type: "BOOL", at: "%QX0.1", doc: "bomba 2" },
      { name: "H1", type: "BOOL", at: "%QX0.2", doc: "lámpara «Bombeando»" },
      { name: "BOMBA1", type: "MOTOR" },
      { name: "BOMBA2", type: "MOTOR" },
    ],
    example: {
      st: `(* Una instancia del bloque MOTOR por bomba: cada una guarda sus datos. *)
BOMBA1(MARCHA := S1, PARADA := S2);
KM1 := BOMBA1.Q;`,
      ld: { rungs: [{ comment: "Bomba 1: el bloque MOTOR hace la marcha y parada", elements: ["S1", { fb: "MOTOR", inst: "BOMBA1", pins: { PARADA: "S2" } }, "=KM1"] }] },
      fbd: { networks: [{ fb: "MOTOR", inst: "BOMBA1", in: { MARCHA: "S1", PARADA: "S2" }, out: { Q: "KM1" } }] },
    },
    solution: {
      st: `BOMBA1(MARCHA := S1, PARADA := S2);
KM1 := BOMBA1.Q;

(* Otra instancia del mismo bloque: la bomba 2 con sus pulsadores. *)
BOMBA2(MARCHA := S3, PARADA := S4);
KM2 := BOMBA2.Q;

(* Se pregunta a cada instancia por su salida. *)
H1 := BOMBA1.Q OR BOMBA2.Q;`,
      ld: {
        rungs: [
          { comment: "Bomba 1", elements: ["S1", { fb: "MOTOR", inst: "BOMBA1", pins: { PARADA: "S2" } }, "=KM1"] },
          { comment: "Bomba 2: otra instancia del mismo bloque", elements: ["S3", { fb: "MOTOR", inst: "BOMBA2", pins: { PARADA: "S4" } }, "=KM2"] },
          { comment: "Bombeando: cualquiera de las dos", elements: ["KM1", "=H1"], branches: [{ at: 0, elements: ["KM2"] }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "MOTOR", inst: "BOMBA1", in: { MARCHA: "S1", PARADA: "S2" }, out: { Q: "KM1" } },
          { fb: "MOTOR", inst: "BOMBA2", in: { MARCHA: "S3", PARADA: "S4" }, out: { Q: "KM2" } },
          { out: "H1", expr: ["OR", "KM1", "KM2"] },
        ],
      },
    },
    brief: {
      goal: "La bomba 2 (Q0.1) con otra instancia del bloque MOTOR (S3 marcha, S4 parada) y la lámpara H1 (Q0.2) encendida con cualquier bomba en marcha.",
      steps: ["Ejecuta el ejemplo: S1 arranca la bomba 1 y S2 la detiene; mira el bloque MOTOR en pous/function-blocks.", "Declara BOMBA2 : MOTOR y llámala con S3 y S4; su salida Q a KM2.", "Enciende H1 con BOMBA1.Q OR BOMBA2.Q.", "Arranca las dos y detenlas por separado: cada instancia es independiente."],
      uses: ["%IX0.0 · S1, marcha bomba 1", "%IX0.1 · S2, parada bomba 1 (NC)", "%IX0.2 · S3, marcha bomba 2", "%IX0.3 · S4, parada bomba 2 (NC)", "%QX0.0 · KM1, bomba 1", "%QX0.1 · KM2, bomba 2", "%QX0.2 · H1, bombeando"],
      teaches: "Un FUNCTION_BLOCK propio se escribe una vez y se usa en cada equipo con su propia instancia, que guarda sus datos aparte, igual que una clase en C++.",
    },
    rubric: {
      goals: [
        { id: "b2", description: "La bomba 2 (Q0.1) arranca con S3, con su propia instancia de MOTOR", when: { Q0_1: 1 }, hold_ms: 500, hint: "BOMBA2(MARCHA := S3, PARADA := S4); KM2 := BOMBA2.Q;" },
        { id: "h1_b1", description: "H1 (Q0.2) encendida con la bomba 1 en marcha", when: { Q0_0: 1, Q0_2: 1 }, hold_ms: 500, hint: "H1 := BOMBA1.Q OR BOMBA2.Q;" },
        { id: "h1_b2", description: "H1 sigue encendida con solo la bomba 2 en marcha", when: { Q0_0: 0, Q0_1: 1, Q0_2: 1 }, hold_ms: 500, after: "h1_b1" },
        { id: "h1_off", description: "H1 se apaga con las dos bombas detenidas", when: { Q0_0: 0, Q0_1: 0, Q0_2: 0 }, hold_ms: 300, after: "h1_b2", why: "Cada instancia guarda su propio estado: detener una no toca a la otra." },
      ],
      cases: [
        {
          name: "Dos bombas con el mismo bloque",
          until_ms: 7500,
          actions: BOMBAS,
          checks: [
            ev("La bomba 1 arranca con S1", 2, 1000, 1600, { Q0_0: 1 }, 200),
            ev("La bomba 1 se detiene con S2", 2, 2000, 2600, { Q0_0: 0 }, 200),
            ev("La bomba 2 arranca con S3", 4, 4000, 4600, { Q0_1: 1 }, 200),
            ev("La bomba 2 sigue al detener la 1", 3, 5000, 5600, { Q0_0: 0, Q0_1: 1 }, 200),
            ev("La bomba 2 se detiene con S4", 3, 6500, 7100, { Q0_1: 0 }, 200),
            ev("H1 enciende con la bomba 1", 2, 1000, 1600, { Q0_0: 1, Q0_2: 1 }, 200),
            ev("H1 sigue con solo la bomba 2", 2, 5000, 5600, { Q0_0: 0, Q0_1: 1, Q0_2: 1 }, 200),
            ev("H1 se apaga con las dos detenidas", 2, 6500, 7100, { Q0_2: 0 }, 200),
          ],
        },
      ],
      goal_runs: [{ name: "Dos bombas", until_ms: 7500, actions: BOMBAS }],
    },
  },
  {
    id: "iec-12",
    unit: "3.Secuencias",
    folder: "12.Proyecto_porton_automatico",
    project: "porton",
    title: "Proyecto: un portón automático",
    bench: "retos/05-puerta",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "abrir, NA" },
      { name: "S2", type: "BOOL", at: "%IX0.1", doc: "cerrar, NA" },
      { name: "S0", type: "BOOL", at: "%IX0.2", doc: "parada, NC: TRUE sin pulsar" },
      { name: "B1", type: "BOOL", at: "%IX0.3", doc: "final: portón abierto" },
      { name: "B2", type: "BOOL", at: "%IX0.4", doc: "final: portón cerrado" },
      { name: "B3", type: "BOOL", at: "%IX0.5", doc: "barrera: obstáculo en el paso" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "motor: abrir" },
      { name: "KM2", type: "BOOL", at: "%QX0.1", doc: "motor: cerrar" },
      { name: "H1", type: "BOOL", at: "%QX0.2", doc: "baliza de movimiento" },
      { name: "ETAPA", type: "INT", doc: "0 parado, 1 abriendo, 2 cerrando" },
      { name: "E0", type: "BOOL", doc: "ETAPA = 0", langs: ["ld", "fbd"] },
      { name: "E1", type: "BOOL", doc: "ETAPA = 1", langs: ["ld", "fbd"] },
      { name: "E2", type: "BOOL", doc: "ETAPA = 2", langs: ["ld", "fbd"] },
    ],
    example: {
      st: PORTON_ST(false),
      ld: { rungs: PORTON_LD(false) },
      fbd: { networks: PORTON_FBD(false) },
    },
    solution: {
      st: PORTON_ST(true),
      ld: { rungs: PORTON_LD(true) },
      fbd: { networks: PORTON_FBD(true) },
    },
    brief: {
      goal: "Si la barrera B3 ve un obstáculo mientras el portón cierra, vuelve a abrir; y la baliza H1 (Q0.2) encendida mientras el portón se mueve.",
      steps: ["Ejecuta el ejemplo: S1 abre hasta B1, S2 cierra hasta B2 y S0 lo detiene donde esté.", "En la etapa CERRANDO agrega la transición a ABRIENDO con B3.", "Enciende H1 en cualquier etapa menos la 0.", "Prueba un obstáculo a mitad del cierre: KM2 abre y KM1 cierra, nunca los dos a la vez."],
      uses: ["%IX0.0 · S1, abrir", "%IX0.1 · S2, cerrar", "%IX0.2 · S0, parada NC", "%IX0.3 · B1, abierto", "%IX0.4 · B2, cerrado", "%IX0.5 · B3, barrera", "%QX0.0 · KM1, abrir", "%QX0.1 · KM2, cerrar", "%QX0.2 · H1, baliza"],
      teaches: "Una máquina real se ordena en etapas: cada una revisa solo sus salidas posibles, y la seguridad (parada, obstáculo) es una transición más.",
    },
    rubricFrom: "retos/05-puerta",
  },
  // ======================================================== Unidad 4
  {
    id: "iec-13",
    unit: "4.Comparar_y_calcular",
    folder: "13.Comparar_numeros",
    project: "comparar",
    title: "Comparar números: GE, LT y EQ",
    bench: "curso-10",
    vars: [
      { name: "B1", type: "BOOL", at: "%IX0.0", doc: "sensor de piezas" },
      { name: "S1", type: "BOOL", at: "%IX0.1", doc: "RESET" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "motor de la cinta" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "aviso" },
      { name: "PIEZAS", type: "CTU" },
      { name: "CUENTA", type: "INT", doc: "piezas en la caja" },
    ],
    example: {
      st: `(* El contador solo cuenta: PV no importa, las decisiones las toman las comparaciones. *)
PIEZAS(CU := B1, R := S1, PV := 100);
CUENTA := PIEZAS.CV;

(* Comparar: el resultado es un BOOL. *)
KM1 := CUENTA < 10;   (* la cinta sigue mientras falten piezas *)
H1 := CUENTA >= 10;   (* caja llena *)`,
      ld: {
        rungs: [
          { comment: "Cuenta piezas; S1 vuelve a cero", elements: ["B1", { fb: "CTU", inst: "PIEZAS", pins: { R: "S1", PV: "100", CV: "CUENTA" } }] },
          { comment: "La cinta sigue mientras CUENTA < 10", elements: [{ fb: "LT", en: true, pins: { IN1: "CUENTA", IN2: "10", OUT: "KM1" } }] },
          { comment: "Caja llena: CUENTA >= 10", elements: [{ fb: "GE", en: true, pins: { IN1: "CUENTA", IN2: "10", OUT: "H1" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "CTU", inst: "PIEZAS", in: { CU: "B1", R: "S1", PV: "100" }, out: { CV: "CUENTA" } },
          { out: "KM1", expr: ["LT", "CUENTA", "10"] },
          { out: "H1", expr: ["GE", "CUENTA", "10"] },
        ],
      },
    },
    solution: {
      st: `PIEZAS(CU := B1, R := S1, PV := 100);
CUENTA := PIEZAS.CV;

(* Cajas de 12; el aviso empieza 4 piezas antes. *)
KM1 := CUENTA < 12;
H1 := CUENTA >= 8;`,
      ld: {
        rungs: [
          { comment: "Cuenta piezas; S1 vuelve a cero", elements: ["B1", { fb: "CTU", inst: "PIEZAS", pins: { R: "S1", PV: "100", CV: "CUENTA" } }] },
          { comment: "La cinta sigue mientras CUENTA < 12", elements: [{ fb: "LT", en: true, pins: { IN1: "CUENTA", IN2: "12", OUT: "KM1" } }] },
          { comment: "Aviso desde la pieza 8", elements: [{ fb: "GE", en: true, pins: { IN1: "CUENTA", IN2: "8", OUT: "H1" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "CTU", inst: "PIEZAS", in: { CU: "B1", R: "S1", PV: "100" }, out: { CV: "CUENTA" } },
          { out: "KM1", expr: ["LT", "CUENTA", "12"] },
          { out: "H1", expr: ["GE", "CUENTA", "8"] },
        ],
      },
    },
    brief: {
      goal: "Cajas de 12 piezas y el aviso H1 desde la pieza 8, para que el operador prepare la caja siguiente.",
      steps: ["Ejecuta el ejemplo: cada toque a B1 es una pieza; con 10 la cinta para y H1 avisa.", "Cambia la meta a 12 piezas en la comparación de KM1.", "Haz que H1 encienda desde la pieza 8 (GE con 8).", "Llena una caja y vuelve a cero con S1."],
      uses: ["%IX0.0 · B1, sensor de piezas", "%IX0.1 · S1, RESET", "%QX0.0 · KM1, motor de la cinta", "%QX0.1 · H1, aviso"],
      teaches: "Un contador da un número; las comparaciones (LT, GE, EQ…) lo convierten en decisiones, y con varias comparaciones sobre la misma cuenta se arman avisos por etapas.",
    },
    rubric: {
      goals: [
        { id: "aviso", description: "Con 8 piezas H1 avisa y la cinta sigue", when: { Q0_0: 1, Q0_1: 1 }, hold_ms: 300, hint: "H1 := CUENTA >= 8; (en Ladder y FBD, un bloque GE con IN2 = 8)." },
        { id: "llena", description: "Con 12 piezas la cinta para", when: { Q0_0: 0, Q0_1: 1 }, hold_ms: 300, after: "aviso", hint: "KM1 := CUENTA < 12;", why: "La misma cuenta sirve para varias decisiones: cada una es una comparación." },
      ],
      cases: [
        {
          name: "Caja de 12 con aviso",
          until_ms: 5200,
          actions: [...Array.from({ length: 12 }, (_, i) => press("B1", 1000 + i * 250, 100)).flat(), ...press("S1", 4600, 200)],
          checks: [
            expect("Con 7 piezas: sin aviso", 3, 2700, { Q0_0: 1, Q0_1: 0 }),
            expect("Con 8 piezas: aviso y la cinta sigue", 5, 2950, { Q0_0: 1, Q0_1: 1 }),
            expect("Con 11 piezas la cinta sigue", 4, 3700, { Q0_0: 1 }),
            ev("Con 12 piezas la cinta para", 5, 3800, 4500, { Q0_0: 0, Q0_1: 1 }),
            ev("RESET: cinta en marcha y sin aviso", 3, 4600, 5100, { Q0_0: 1, Q0_1: 0 }),
          ],
        },
      ],
      goal_runs: [{ name: "Una caja", until_ms: 6000, actions: [...Array.from({ length: 12 }, (_, i) => press("B1", 1000 + i * 300, 120)).flat(), ...press("S1", 5200, 300)] }],
    },
  },
  {
    id: "iec-14",
    unit: "4.Comparar_y_calcular",
    folder: "14.Sumar_y_restar",
    project: "estacionamiento",
    title: "Sumar y restar: un estacionamiento",
    bench: "curso-03",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "barrera de entrada: entra un auto" },
      { name: "S2", type: "BOOL", at: "%IX0.1", doc: "barrera de salida: sale un auto" },
      { name: "H1", type: "BOOL", at: "%QX0.0", doc: "verde: hay lugar" },
      { name: "H2", type: "BOOL", at: "%QX0.1", doc: "amarillo: lleno" },
      { name: "F_ENTRA", type: "R_TRIG" },
      { name: "F_SALE", type: "R_TRIG" },
      { name: "AUTOS", type: "INT", doc: "autos adentro" },
      { name: "LIBRES", type: "INT", doc: "lugares libres" },
      { name: "ENTRA", type: "BOOL", doc: "flanco de S1", langs: ["fbd"] },
      { name: "SALE", type: "BOOL", doc: "flanco de S2", langs: ["fbd"] },
      { name: "HAY_LUGAR", type: "BOOL", doc: "AUTOS < capacidad", langs: ["ld", "fbd"] },
      { name: "HAY_AUTOS", type: "BOOL", doc: "AUTOS > 0", langs: ["ld", "fbd"] },
    ],
    example: {
      st: `(* Un auto por flanco: si no, sumaría en cada vuelta mientras la barrera esté abierta. *)
F_ENTRA(CLK := S1);
F_SALE(CLK := S2);

IF F_ENTRA.Q THEN
  AUTOS := AUTOS + 1;
END_IF;
IF F_SALE.Q THEN
  AUTOS := AUTOS - 1;
END_IF;

(* Capacidad: 5 lugares. *)
LIBRES := 5 - AUTOS;
H1 := LIBRES > 0;
H2 := LIBRES <= 0;`,
      ld: {
        rungs: [
          { comment: "Entra un auto: AUTOS + 1 en el flanco de S1", elements: ["^S1", { fb: "ADD", en: true, pins: { IN1: "AUTOS", IN2: "1", OUT: "AUTOS" } }] },
          { comment: "Sale un auto: AUTOS - 1 en el flanco de S2", elements: ["^S2", { fb: "SUB", en: true, pins: { IN1: "AUTOS", IN2: "1", OUT: "AUTOS" } }] },
          { comment: "Lugares libres: 5 - AUTOS", elements: [{ fb: "SUB", en: true, pins: { IN1: "5", IN2: "AUTOS", OUT: "LIBRES" } }] },
          { comment: "Verde: hay lugar", elements: [{ fb: "GT", en: true, pins: { IN1: "LIBRES", IN2: "0", OUT: "H1" } }] },
          { comment: "Amarillo: lleno", elements: [{ fb: "LE", en: true, pins: { IN1: "LIBRES", IN2: "0", OUT: "H2" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_ENTRA", in: { CLK: "S1" }, out: { Q: "ENTRA" } },
          { fb: "R_TRIG", inst: "F_SALE", in: { CLK: "S2" }, out: { Q: "SALE" } },
          { out: "AUTOS", expr: ["SEL", "ENTRA", "AUTOS", ["ADD", "AUTOS", "1"]] },
          { out: "AUTOS", expr: ["SEL", "SALE", "AUTOS", ["SUB", "AUTOS", "1"]] },
          { out: "LIBRES", expr: ["SUB", "5", "AUTOS"] },
          { out: "H1", expr: ["GT", "LIBRES", "0"] },
          { out: "H2", expr: ["LE", "LIBRES", "0"] },
        ],
      },
    },
    solution: {
      st: `F_ENTRA(CLK := S1);
F_SALE(CLK := S2);

(* Capacidad 3, y la cuenta nunca sale de 0…3. *)
IF F_ENTRA.Q AND AUTOS < 3 THEN
  AUTOS := AUTOS + 1;
END_IF;
IF F_SALE.Q AND AUTOS > 0 THEN
  AUTOS := AUTOS - 1;
END_IF;

LIBRES := 3 - AUTOS;
H1 := LIBRES > 0;
H2 := LIBRES = 0;`,
      ld: {
        rungs: [
          { comment: "¿Queda lugar? AUTOS < 3", elements: [{ fb: "LT", en: true, pins: { IN1: "AUTOS", IN2: "3", OUT: "HAY_LUGAR" } }] },
          { comment: "¿Hay autos? AUTOS > 0", elements: [{ fb: "GT", en: true, pins: { IN1: "AUTOS", IN2: "0", OUT: "HAY_AUTOS" } }] },
          { comment: "Entra un auto, si hay lugar", elements: ["^S1", "HAY_LUGAR", { fb: "ADD", en: true, pins: { IN1: "AUTOS", IN2: "1", OUT: "AUTOS" } }] },
          { comment: "Sale un auto, si había alguno", elements: ["^S2", "HAY_AUTOS", { fb: "SUB", en: true, pins: { IN1: "AUTOS", IN2: "1", OUT: "AUTOS" } }] },
          { comment: "Lugares libres: 3 - AUTOS", elements: [{ fb: "SUB", en: true, pins: { IN1: "3", IN2: "AUTOS", OUT: "LIBRES" } }] },
          { comment: "Verde: hay lugar", elements: [{ fb: "GT", en: true, pins: { IN1: "LIBRES", IN2: "0", OUT: "H1" } }] },
          { comment: "Amarillo: lleno", elements: [{ fb: "EQ", en: true, pins: { IN1: "LIBRES", IN2: "0", OUT: "H2" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_ENTRA", in: { CLK: "S1" }, out: { Q: "ENTRA" } },
          { fb: "R_TRIG", inst: "F_SALE", in: { CLK: "S2" }, out: { Q: "SALE" } },
          { out: "HAY_LUGAR", expr: ["LT", "AUTOS", "3"] },
          { out: "HAY_AUTOS", expr: ["GT", "AUTOS", "0"] },
          { out: "AUTOS", expr: ["SEL", ["AND", "ENTRA", "HAY_LUGAR"], "AUTOS", ["ADD", "AUTOS", "1"]] },
          { out: "AUTOS", expr: ["SEL", ["AND", "SALE", "HAY_AUTOS"], "AUTOS", ["SUB", "AUTOS", "1"]] },
          { out: "LIBRES", expr: ["SUB", "3", "AUTOS"] },
          { out: "H1", expr: ["GT", "LIBRES", "0"] },
          { out: "H2", expr: ["EQ", "LIBRES", "0"] },
        ],
      },
    },
    brief: {
      goal: "Un estacionamiento de 3 lugares cuya cuenta nunca pasa de 3 ni baja de 0, aunque las barreras se accionen de más.",
      steps: ["Ejecuta el ejemplo: S1 es un auto que entra y S2 uno que sale; con 5 adentro, H2 avisa lleno.", "Cambia la capacidad a 3.", "Suma solo si AUTOS < 3 y resta solo si AUTOS > 0.", "Prueba de más: entra un cuarto auto y salen más autos de los que hay; la cuenta no se sale de 0…3."],
      uses: ["%IX0.0 · S1, entra un auto", "%IX0.1 · S2, sale un auto", "%QX0.0 · H1, hay lugar", "%QX0.1 · H2, lleno"],
      teaches: "ADD y SUB cambian una cuenta en el flanco de un evento; una comparación antes de sumar o restar mantiene el número dentro de sus límites.",
    },
    rubric: {
      goals: [
        { id: "lleno", description: "Con 3 autos adentro, H2 avisa lleno", when: { Q0_0: 0, Q0_1: 1 }, hold_ms: 300, hint: "LIBRES := 3 - AUTOS; H2 := LIBRES = 0;" },
        { id: "tope", description: "Un cuarto auto no cuenta: al salir uno vuelve a haber lugar", when: { Q0_0: 1, Q0_1: 0 }, hold_ms: 300, after: "lleno", hint: "Suma solo si AUTOS < 3.", why: "Una cuenta que se pasa de su límite deja de representar la realidad." },
      ],
      cases: [
        {
          name: "Tres lugares y límites",
          until_ms: 7000,
          actions: [
            ...press("S1", 1000, 150), ...press("S1", 1400, 150), ...press("S1", 1800, 150),
            ...press("S1", 2600, 150), ...press("S2", 3200, 150),
            ...press("S2", 3600, 150), ...press("S2", 4000, 150), ...press("S2", 4400, 150), ...press("S2", 4800, 150),
            ...press("S1", 5400, 150), ...press("S1", 5800, 150), ...press("S1", 6200, 150),
          ],
          checks: [
            expect("Vacío: verde", 2, 800, { Q0_0: 1, Q0_1: 0 }),
            expect("Con 2 autos todavía hay lugar", 2, 1650, { Q0_0: 1, Q0_1: 0 }),
            ev("Con 3 autos: lleno", 5, 2000, 2500, { Q0_0: 0, Q0_1: 1 }),
            ev("Un cuarto auto no cuenta: al salir uno hay lugar", 5, 3300, 3500, { Q0_0: 1, Q0_1: 0 }),
            ev("Salidas de más no bajan de 0: con 3 entradas, lleno otra vez", 6, 6300, 6900, { Q0_0: 0, Q0_1: 1 }),
          ],
        },
      ],
      goal_runs: [{ name: "Entradas y salidas", until_ms: 5000, actions: [...press("S1", 1000, 200), ...press("S1", 1500, 200), ...press("S1", 2000, 200), ...press("S1", 2600, 200), ...press("S2", 3400, 200)] }],
    },
  },
  {
    id: "iec-15",
    unit: "4.Comparar_y_calcular",
    folder: "15.Horometro",
    project: "horometro",
    title: "Contar el tiempo: un horómetro con mantenimiento",
    bench: "curso-17",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "marcha, NA" },
      { name: "S2", type: "BOOL", at: "%IX0.1", doc: "paro, NC: TRUE sin pulsar" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "motor" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "mantenimiento" },
      { name: "T_SEG", type: "TON" },
      { name: "PULSO", type: "BOOL", doc: "TRUE una vuelta por segundo de marcha" },
      { name: "SEGUNDOS", type: "INT", doc: "horómetro: segundos de marcha" },
      { name: "HAY_TIEMPO", type: "BOOL", doc: "SEGUNDOS < 20", langs: ["ld", "fbd"] },
    ],
    example: {
      st: `(* Marcha y parada con enclavamiento. *)
KM1 := (KM1 OR S1) AND S2;

(* Un pulso por segundo de marcha: el TON se reinicia solo con su propia salida. *)
T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
PULSO := T_SEG.Q;

(* El horómetro suma un segundo por pulso. *)
IF PULSO THEN
  SEGUNDOS := SEGUNDOS + 1;
END_IF;

(* Mantenimiento a los 20 s de marcha (en una planta serían horas). *)
H1 := SEGUNDOS >= 20;`,
      ld: {
        rungs: [
          { comment: "Marcha y parada con enclavamiento", elements: ["S1", "S2", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] },
          { comment: "Un pulso por segundo de marcha", elements: ["KM1", "!PULSO", { fb: "TON", inst: "T_SEG", pins: { PT: "T#1s" } }, "=PULSO"] },
          { comment: "Horómetro: un segundo más por pulso", elements: ["PULSO", { fb: "ADD", en: true, pins: { IN1: "SEGUNDOS", IN2: "1", OUT: "SEGUNDOS" } }] },
          { comment: "Mantenimiento a los 20 s", elements: [{ fb: "GE", en: true, pins: { IN1: "SEGUNDOS", IN2: "20", OUT: "H1" } }] },
        ],
      },
      fbd: {
        networks: [
          { out: "KM1", expr: ["AND", ["OR", "KM1", "S1"], "S2"] },
          { fb: "TON", inst: "T_SEG", in: { IN: ["AND", "KM1", ["NOT", "PULSO"]], PT: "T#1s" }, out: { Q: "PULSO" } },
          { out: "SEGUNDOS", expr: ["SEL", "PULSO", "SEGUNDOS", ["ADD", "SEGUNDOS", "1"]] },
          { out: "H1", expr: ["GE", "SEGUNDOS", "20"] },
        ],
      },
    },
    solution: {
      st: `(* A los 20 s el motor queda bloqueado hasta el mantenimiento. *)
KM1 := (KM1 OR S1) AND S2 AND SEGUNDOS < 20;

T_SEG(IN := KM1 AND NOT PULSO, PT := T#1s);
PULSO := T_SEG.Q;
IF PULSO THEN
  SEGUNDOS := SEGUNDOS + 1;
END_IF;

(* Aviso a los 10 s: se puede programar el mantenimiento. *)
H1 := SEGUNDOS >= 10;`,
      ld: {
        rungs: [
          { comment: "¿Queda tiempo de marcha? SEGUNDOS < 20", elements: [{ fb: "LT", en: true, pins: { IN1: "SEGUNDOS", IN2: "20", OUT: "HAY_TIEMPO" } }] },
          { comment: "Marcha y parada; bloqueo a los 20 s", elements: ["S1", "S2", "HAY_TIEMPO", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] },
          { comment: "Un pulso por segundo de marcha", elements: ["KM1", "!PULSO", { fb: "TON", inst: "T_SEG", pins: { PT: "T#1s" } }, "=PULSO"] },
          { comment: "Horómetro: un segundo más por pulso", elements: ["PULSO", { fb: "ADD", en: true, pins: { IN1: "SEGUNDOS", IN2: "1", OUT: "SEGUNDOS" } }] },
          { comment: "Aviso a los 10 s", elements: [{ fb: "GE", en: true, pins: { IN1: "SEGUNDOS", IN2: "10", OUT: "H1" } }] },
        ],
      },
      fbd: {
        networks: [
          { out: "HAY_TIEMPO", expr: ["LT", "SEGUNDOS", "20"] },
          { out: "KM1", expr: ["AND", ["OR", "KM1", "S1"], "S2", "HAY_TIEMPO"] },
          { fb: "TON", inst: "T_SEG", in: { IN: ["AND", "KM1", ["NOT", "PULSO"]], PT: "T#1s" }, out: { Q: "PULSO" } },
          { out: "SEGUNDOS", expr: ["SEL", "PULSO", "SEGUNDOS", ["ADD", "SEGUNDOS", "1"]] },
          { out: "H1", expr: ["GE", "SEGUNDOS", "10"] },
        ],
      },
    },
    brief: {
      goal: "Aviso de mantenimiento H1 a los 10 s de marcha y, a los 20 s, el motor se detiene y no vuelve a arrancar.",
      steps: ["Ejecuta el ejemplo: con S1 el motor marcha y SEGUNDOS sube uno por segundo (míralo en las variables en vivo).", "Adelanta el aviso H1 a los 10 s.", "Agrega el bloqueo: el motor marcha solo mientras SEGUNDOS < 20.", "Pasados los 20 s, S1 ya no lo arranca."],
      uses: ["%IX0.0 · S1, marcha", "%IX0.1 · S2, paro NC", "%QX0.0 · KM1, motor", "%QX0.1 · H1, mantenimiento"],
      teaches: "Un TON que se reinicia con su propia salida da un pulso por segundo; sumar esos pulsos convierte el tiempo en un número que se puede comparar, como un horómetro.",
    },
    rubric: {
      goals: [
        { id: "aviso", description: "A los 10 s de marcha H1 avisa y el motor sigue", when: { Q0_0: 1, Q0_1: 1 }, hold_ms: 500, hint: "H1 := SEGUNDOS >= 10;" },
        { id: "bloqueo", description: "A los 20 s el motor se detiene", when: { Q0_0: 0, Q0_1: 1 }, hold_ms: 500, after: "aviso", hint: "Agrega AND SEGUNDOS < 20 a la marcha (en Ladder, un contacto del LT).", why: "El número del horómetro decide igual que un sensor: se compara y se usa en la lógica." },
      ],
      cases: [
        {
          name: "Horómetro y mantenimiento",
          until_ms: 26000,
          actions: [...press("S1", 1000, 200), ...press("S1", 24000, 300)],
          checks: [
            expect("A los 8 s de marcha: sin aviso", 2, 9000, { Q0_0: 1, Q0_1: 0 }),
            ev("A los 10 s de marcha: aviso H1", 6, 11000, 12800, { Q0_0: 1, Q0_1: 1 }, 300),
            expect("A los 15 s el motor sigue", 2, 16000, { Q0_0: 1 }),
            ev("A los 20 s el motor se detiene", 6, 21000, 23500, { Q0_0: 0 }, 300),
            never("Bloqueado: S1 no lo vuelve a arrancar", 4, 24000, 25800, { Q0_0: 1 }),
          ],
        },
      ],
      goal_runs: [{ name: "Marcha larga", until_ms: 25000, actions: press("S1", 1000, 300) }],
    },
  },
  {
    id: "iec-16",
    unit: "4.Comparar_y_calcular",
    folder: "16.Proyecto_cinta_de_lotes",
    project: "cinta_lotes",
    title: "Proyecto: lotes y turno en una cinta",
    bench: "retos/07-cinta-contador",
    vars: [
      { name: "S1", type: "BOOL", at: "%IX0.0", doc: "marcha / lote nuevo, NA" },
      { name: "S0", type: "BOOL", at: "%IX0.1", doc: "parada, NC: TRUE sin pulsar" },
      { name: "B1", type: "BOOL", at: "%IX0.2", doc: "sensor de piezas" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "motor de la cinta" },
      { name: "H1", type: "BOOL", at: "%QX0.1", doc: "lote completo" },
      { name: "F_PIEZA", type: "R_TRIG" },
      { name: "PIEZA", type: "BOOL", doc: "flanco de B1", langs: ["fbd"] },
      { name: "PIEZAS", type: "INT", doc: "piezas del lote" },
      { name: "COMPLETO", type: "BOOL", doc: "lote completo" },
      { name: "F_LOTE", type: "R_TRIG" },
      { name: "LOTE_NUEVO", type: "BOOL", doc: "flanco de COMPLETO", langs: ["fbd"] },
      { name: "LOTES", type: "INT", doc: "lotes completos en el turno" },
      { name: "TURNO", type: "BOOL", doc: "turno completo" },
    ],
    example: {
      st: `(* Cada pieza cuenta una vez y solo con la cinta en marcha. *)
F_PIEZA(CLK := B1);
IF F_PIEZA.Q AND KM1 THEN
  PIEZAS := PIEZAS + 1;
END_IF;

(* S1 con el lote completo empieza uno nuevo. *)
IF S1 AND COMPLETO THEN
  PIEZAS := 0;
END_IF;

COMPLETO := PIEZAS >= 3;

(* La cinta: marcha, parada NC y para sola con el lote completo. *)
KM1 := (KM1 OR S1) AND S0 AND NOT COMPLETO;
H1 := COMPLETO;`,
      ld: {
        rungs: [
          { comment: "Una pieza más, con la cinta en marcha", elements: ["^B1", "KM1", { fb: "ADD", en: true, pins: { IN1: "PIEZAS", IN2: "1", OUT: "PIEZAS" } }] },
          { comment: "S1 con el lote completo: lote nuevo", elements: ["S1", "COMPLETO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "PIEZAS" } }] },
          { comment: "Lote completo: 3 piezas", elements: [{ fb: "GE", en: true, pins: { IN1: "PIEZAS", IN2: "3", OUT: "COMPLETO" } }] },
          { comment: "La cinta", elements: ["S1", "S0", "!COMPLETO", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] },
          { comment: "Piloto de lote completo", elements: ["COMPLETO", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_PIEZA", in: { CLK: "B1" }, out: { Q: "PIEZA" } },
          { out: "PIEZAS", expr: ["SEL", ["AND", "PIEZA", "KM1"], "PIEZAS", ["ADD", "PIEZAS", "1"]] },
          { out: "PIEZAS", expr: ["SEL", ["AND", "S1", "COMPLETO"], "PIEZAS", "0"] },
          { out: "COMPLETO", expr: ["GE", "PIEZAS", "3"] },
          { out: "KM1", expr: ["AND", ["OR", "KM1", "S1"], "S0", ["NOT", "COMPLETO"]] },
          { out: "H1", expr: "COMPLETO" },
        ],
      },
    },
    solution: {
      st: `F_PIEZA(CLK := B1);
IF F_PIEZA.Q AND KM1 THEN
  PIEZAS := PIEZAS + 1;
END_IF;

(* El turno: 3 lotes. Con el turno completo, S1 ya no empieza otro. *)
TURNO := LOTES >= 3;
IF S1 AND COMPLETO AND NOT TURNO THEN
  PIEZAS := 0;
END_IF;

(* Lotes de 4; cada lote que se completa suma uno (flanco de COMPLETO). *)
COMPLETO := PIEZAS >= 4;
F_LOTE(CLK := COMPLETO);
IF F_LOTE.Q THEN
  LOTES := LOTES + 1;
END_IF;

KM1 := (KM1 OR S1) AND S0 AND NOT COMPLETO;
H1 := COMPLETO;`,
      ld: {
        rungs: [
          { comment: "Una pieza más, con la cinta en marcha", elements: ["^B1", "KM1", { fb: "ADD", en: true, pins: { IN1: "PIEZAS", IN2: "1", OUT: "PIEZAS" } }] },
          { comment: "Turno completo: 3 lotes", elements: [{ fb: "GE", en: true, pins: { IN1: "LOTES", IN2: "3", OUT: "TURNO" } }] },
          { comment: "S1 con el lote completo: lote nuevo, si el turno sigue", elements: ["S1", "COMPLETO", "!TURNO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "PIEZAS" } }] },
          { comment: "Lote completo: 4 piezas", elements: [{ fb: "GE", en: true, pins: { IN1: "PIEZAS", IN2: "4", OUT: "COMPLETO" } }] },
          { comment: "Cada lote completo suma uno", elements: ["^COMPLETO", { fb: "ADD", en: true, pins: { IN1: "LOTES", IN2: "1", OUT: "LOTES" } }] },
          { comment: "La cinta", elements: ["S1", "S0", "!COMPLETO", "=KM1"], branches: [{ at: 0, elements: ["KM1"] }] },
          { comment: "Piloto de lote completo", elements: ["COMPLETO", "=H1"] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_PIEZA", in: { CLK: "B1" }, out: { Q: "PIEZA" } },
          { out: "PIEZAS", expr: ["SEL", ["AND", "PIEZA", "KM1"], "PIEZAS", ["ADD", "PIEZAS", "1"]] },
          { out: "TURNO", expr: ["GE", "LOTES", "3"] },
          { out: "PIEZAS", expr: ["SEL", ["AND", "S1", "COMPLETO", ["NOT", "TURNO"]], "PIEZAS", "0"] },
          { out: "COMPLETO", expr: ["GE", "PIEZAS", "4"] },
          { fb: "R_TRIG", inst: "F_LOTE", in: { CLK: "COMPLETO" }, out: { Q: "LOTE_NUEVO" } },
          { out: "LOTES", expr: ["SEL", "LOTE_NUEVO", "LOTES", ["ADD", "LOTES", "1"]] },
          { out: "KM1", expr: ["AND", ["OR", "KM1", "S1"], "S0", ["NOT", "COMPLETO"]] },
          { out: "H1", expr: "COMPLETO" },
        ],
      },
    },
    brief: {
      goal: "Lotes de 4 piezas y un turno de 3 lotes: con el turno completo, S1 ya no empieza otro lote.",
      steps: ["Ejecuta el ejemplo: S1 arranca, cada toque a B1 es una pieza y con 3 la cinta para; S1 empieza otro lote.", "Cambia el lote a 4 piezas.", "Cuenta los lotes completos (LOTES, en el flanco de COMPLETO) y calcula TURNO := LOTES >= 3.", "Con el turno completo, S1 no vuelve a cero las piezas: la cinta queda parada y H1 encendido."],
      uses: ["%IX0.0 · S1, marcha / lote nuevo", "%IX0.1 · S0, parada NC", "%IX0.2 · B1, sensor de piezas", "%QX0.0 · KM1, motor de la cinta", "%QX0.1 · H1, lote completo"],
      teaches: "Dos cuentas encadenadas (piezas por lote y lotes por turno) se arman con sumas en el flanco del evento y comparaciones; cada comparación es una condición más de la lógica.",
    },
    rubric: {
      goals: [
        { id: "lote4", description: "Con 3 piezas la cinta sigue; con 4, para", when: { Q0_0: 0, Q0_1: 1 }, hold_ms: 300, hint: "COMPLETO := PIEZAS >= 4;" },
        { id: "turno", description: "Tras 3 lotes, S1 ya no arranca la cinta", when: { I0_0: 1, Q0_0: 0, Q0_1: 1 }, hold_ms: 100, after: "lote4", hint: "LOTES suma en el flanco de COMPLETO; TURNO := LOTES >= 3; y el lote nuevo necesita NOT TURNO.", why: "La segunda cuenta usa a la primera como evento: así se encadenan contadores." },
      ],
      cases: [
        {
          name: "Lote de 4",
          until_ms: 4200,
          actions: [...press("S1", 1000, 150), ...sensor("B1", 1500, 120), ...sensor("B1", 1900, 120), ...sensor("B1", 2300, 120), ...sensor("B1", 2700, 120), ...press("S1", 3600, 150)],
          checks: [
            expect("Con 3 piezas la cinta sigue", 3, 2600, { Q0_0: 1, Q0_1: 0 }),
            ev("Con 4 piezas para y H1 avisa", 3, 2800, 3400, { Q0_0: 0, Q0_1: 1 }),
            ev("S1 empieza un lote nuevo", 2, 3600, 4100, { Q0_0: 1, Q0_1: 0 }),
          ],
        },
        {
          name: "Turno de 3 lotes",
          until_ms: 8200,
          actions: [
            ...press("S1", 1000, 150), ...[1500, 1800, 2100, 2400].flatMap((t) => sensor("B1", t, 120)),
            ...press("S1", 3000, 150), ...[3500, 3800, 4100, 4400].flatMap((t) => sensor("B1", t, 120)),
            ...press("S1", 5000, 150), ...[5500, 5800, 6100, 6400].flatMap((t) => sensor("B1", t, 120)),
            ...press("S1", 7000, 300),
          ],
          checks: [
            expect("Segundo lote en marcha", 2, 3300, { Q0_0: 1 }),
            expect("Tercer lote en marcha", 2, 5300, { Q0_0: 1 }),
            never("Turno completo: S1 no arranca la cinta", 6, 7000, 8100, { Q0_0: 1 }),
            expect("Turno completo: H1 sigue encendido", 2, 7600, { Q0_1: 1 }),
          ],
        },
      ],
      goal_runs: [{
        name: "Un turno",
        until_ms: 9000,
        actions: [
          ...press("S1", 1000, 200), ...[1500, 1900, 2300, 2700].flatMap((t) => sensor("B1", t, 150)),
          ...press("S1", 3300, 200), ...[3800, 4200, 4600, 5000].flatMap((t) => sensor("B1", t, 150)),
          ...press("S1", 5600, 200), ...[6100, 6500, 6900, 7300].flatMap((t) => sensor("B1", t, 150)),
          ...press("S1", 8000, 400),
        ],
      }],
    },
  },
  {
    id: "iec-17",
    unit: "5.Comunicaciones",
    folder: "17.Servidor_Modbus_TCP",
    project: "servidor_modbus_tcp",
    title: "Servidor Modbus TCP: la PC mira y manda",
    bench: "curso-47",
    // El servidor Modbus TCP del proyecto (Servers en el OpenPLC Editor) con 8 %MW.
    server: { mwCount: 8 },
    vars: [
      { name: "B1", type: "BOOL", at: "%IX0.0", doc: "sensor de cajas" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "banda (bobina 00001 para la PC)" },
      { name: "CAJAS", type: "INT", at: "%MW0", doc: "holding 40001: cajas contadas" },
      { name: "MARCHA", type: "INT", at: "%MW1", doc: "holding 40002: marcha, la escribe la PC" },
      { name: "META", type: "INT", at: "%MW2", doc: "holding 40003: meta de cajas, la escribe la PC" },
      { name: "F_CAJA", type: "R_TRIG" },
      { name: "CAJA", type: "BOOL", doc: "flanco de B1", langs: ["fbd"] },
      { name: "HAY_META", type: "BOOL", doc: "la PC fijó una meta", langs: ["ld"] },
      { name: "LLENO", type: "BOOL", doc: "se llegó a la meta", langs: ["ld"] },
    ],
    example: {
      st: `(* Cada caja que pasa frente a B1 suma una (flanco de subida). *)
F_CAJA(CLK := B1);
IF F_CAJA.Q THEN
  CAJAS := CAJAS + 1;
END_IF;

(* La banda marcha mientras la PC tenga un valor distinto de 0 en el 40002. *)
KM1 := MARCHA <> 0;`,
      ld: {
        rungs: [
          { comment: "Una caja más (40001)", elements: ["^B1", { fb: "ADD", en: true, pins: { IN1: "CAJAS", IN2: "1", OUT: "CAJAS" } }] },
          { comment: "La banda: marcha desde la PC (40002 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "MARCHA", IN2: "0", OUT: "KM1" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_CAJA", in: { CLK: "B1" }, out: { Q: "CAJA" } },
          { out: "CAJAS", expr: ["SEL", "CAJA", "CAJAS", ["ADD", "CAJAS", "1"]] },
          { out: "KM1", expr: ["NE", "MARCHA", "0"] },
        ],
      },
    },
    solution: {
      st: `F_CAJA(CLK := B1);
IF F_CAJA.Q THEN
  CAJAS := CAJAS + 1;
END_IF;

(* Meta desde la PC (40003): al llegar, el programa borra la marcha que escribió la PC. *)
IF META > 0 AND CAJAS >= META THEN
  MARCHA := 0;
END_IF;

KM1 := MARCHA <> 0;`,
      ld: {
        rungs: [
          { comment: "Una caja más (40001)", elements: ["^B1", { fb: "ADD", en: true, pins: { IN1: "CAJAS", IN2: "1", OUT: "CAJAS" } }] },
          { comment: "¿La PC fijó una meta? (40003 mayor que 0)", elements: [{ fb: "GT", en: true, pins: { IN1: "META", IN2: "0", OUT: "HAY_META" } }] },
          { comment: "¿Se llegó a la meta?", elements: [{ fb: "GE", en: true, pins: { IN1: "CAJAS", IN2: "META", OUT: "LLENO" } }] },
          { comment: "Meta cumplida: la marcha vuelve a 0", elements: ["HAY_META", "LLENO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "MARCHA" } }] },
          { comment: "La banda: marcha desde la PC (40002 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "MARCHA", IN2: "0", OUT: "KM1" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_CAJA", in: { CLK: "B1" }, out: { Q: "CAJA" } },
          { out: "CAJAS", expr: ["SEL", "CAJA", "CAJAS", ["ADD", "CAJAS", "1"]] },
          { out: "MARCHA", expr: ["SEL", ["AND", ["GT", "META", "0"], ["GE", "CAJAS", "META"]], "MARCHA", "0"] },
          { out: "KM1", expr: ["NE", "MARCHA", "0"] },
        ],
      },
    },
    brief: {
      goal: "Meta desde la PC: la PC escribe la meta de cajas en el 40003; al llegarla, el programa pone la marcha (40002) en 0 y la banda para sola.",
      steps: [
        "Ejecuta el ejemplo y espera «en línea» en la PC PC1: el 40001 cuenta las cajas y la bobina 00001 muestra la banda.",
        "Arrastra el 40002 de la PC a un valor distinto de 0: la banda KM1 arranca. Acciona B1 y mira sumar el 40001.",
        "Declara META AT %MW2 (40003). Si META > 0 y CAJAS >= META, escribe 0 en MARCHA: la banda para y la PC lo ve.",
      ],
      uses: ["Ethernet · servidor Modbus TCP del proyecto, puerto 502", "%IX0.0 · B1, sensor de cajas", "%QX0.0 · KM1, banda (bobina 00001)", "%MW0 · 40001 cajas", "%MW1 · 40002 marcha", "%MW2 · 40003 meta", "PC1 · JW Modbus Tool"],
      teaches: "Con el servidor Modbus TCP del proyecto, las variables %MW son los holding que la PC lee y escribe; el programa también puede escribir en ellos, como borrar la marcha al cumplir la meta.",
    },
    rubric: {
      goals: [
        { id: "marcha", description: "La PC arranca la banda con el 40002", when: { "KM1.closed": true }, hold_ms: 500, hint: "En la PC PC1, arrastra el valor del 40002 a la derecha." },
        { id: "meta", description: "Al llegar a la meta, la marcha vuelve a 0 sola", when: { "KM1.closed": false, "PC1.h1": 0 }, hold_ms: 500, after: "marcha", hint: "IF META > 0 AND CAJAS >= META THEN MARCHA := 0; END_IF;", why: "Lo que escribe la PC es una variable más: el programa decide cuándo vale y cuándo se borra." },
      ],
      cases: [
        {
          name: "Lote de 3 cajas",
          until_ms: 17000,
          actions: [{ at_ms: 9000, device: "PC1", action: "h2", value: 3 }, { at_ms: 9500, device: "PC1", action: "h1", value: 1 }, ...sensor("B1", 10500, 300), ...sensor("B1", 11500, 300), ...sensor("B1", 12500, 300)],
          checks: [
            ev("El 40002 de la PC arranca la banda", 4, 9500, 10400, { "KM1.closed": true }, 300),
            expect("La PC ve las 3 cajas en el 40001", 4, 13500, { "PC1.h0": 3 }),
            ev("Al llegar a la meta la banda para sola", 6, 12500, 13500, { "KM1.closed": false }, 300),
            expect("La PC ve la marcha en 0 (40002)", 6, 14500, { "PC1.h1": 0 }),
          ],
        },
      ],
      goal_runs: [{ name: "Banda", until_ms: 15000, actions: [{ at_ms: 9000, device: "PC1", action: "h2", value: 2 }, { at_ms: 9500, device: "PC1", action: "h1", value: 1 }, ...sensor("B1", 10500, 300), ...sensor("B1", 11500, 300)] }],
    },
  },
  {
    id: "iec-18",
    unit: "5.Comunicaciones",
    folder: "18.Pulsadores_remotos",
    project: "pulsadores_remotos",
    title: "Pulsadores remotos: la PC pide y el programa acusa",
    bench: "curso-47",
    server: { mwCount: 8 },
    vars: [
      { name: "B1", type: "BOOL", at: "%IX0.0", doc: "sensor de cajas" },
      { name: "KM1", type: "BOOL", at: "%QX0.0", doc: "banda (bobina 00001 para la PC)" },
      { name: "CAJAS", type: "INT", at: "%MW0", doc: "holding 40001: cajas contadas" },
      { name: "P_MARCHA", type: "INT", at: "%MW1", doc: "holding 40002: pulsador remoto MARCHA" },
      { name: "P_PARO", type: "INT", at: "%MW2", doc: "holding 40003: pulsador remoto PARO" },
      { name: "P_CERO", type: "INT", at: "%MW3", doc: "holding 40004: pulsador remoto contador a cero" },
      { name: "F_CAJA", type: "R_TRIG" },
      { name: "CAJA", type: "BOOL", doc: "flanco de B1", langs: ["fbd"] },
      { name: "O_MARCHA", type: "BOOL", doc: "la PC pidió marcha", langs: ["ld"] },
      { name: "O_PARO", type: "BOOL", doc: "la PC pidió paro", langs: ["ld"] },
      { name: "O_CERO", type: "BOOL", doc: "la PC pidió el contador a cero", langs: ["ld"] },
    ],
    example: {
      st: `F_CAJA(CLK := B1);
IF F_CAJA.Q THEN
  CAJAS := CAJAS + 1;
END_IF;

(* Pulsador remoto MARCHA (40002): la PC escribe un valor distinto de 0;
   el programa hace la orden y lo devuelve a 0: ese 0 es el acuse. *)
IF P_MARCHA <> 0 THEN
  KM1 := TRUE;
  P_MARCHA := 0;
END_IF;

(* Pulsador remoto PARO (40003), con el mismo acuse. *)
IF P_PARO <> 0 THEN
  KM1 := FALSE;
  P_PARO := 0;
END_IF;`,
      ld: {
        rungs: [
          { comment: "Una caja más (40001)", elements: ["^B1", { fb: "ADD", en: true, pins: { IN1: "CAJAS", IN2: "1", OUT: "CAJAS" } }] },
          { comment: "¿La PC pulsó MARCHA? (40002 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "P_MARCHA", IN2: "0", OUT: "O_MARCHA" } }] },
          { comment: "Marcha: la banda queda encendida", elements: ["O_MARCHA", "S=KM1"] },
          { comment: "Acuse: el 40002 vuelve a 0", elements: ["O_MARCHA", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "P_MARCHA" } }] },
          { comment: "¿La PC pulsó PARO? (40003 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "P_PARO", IN2: "0", OUT: "O_PARO" } }] },
          { comment: "Paro: la banda se apaga", elements: ["O_PARO", "R=KM1"] },
          { comment: "Acuse: el 40003 vuelve a 0", elements: ["O_PARO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "P_PARO" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_CAJA", in: { CLK: "B1" }, out: { Q: "CAJA" } },
          { out: "CAJAS", expr: ["SEL", "CAJA", "CAJAS", ["ADD", "CAJAS", "1"]] },
          { out: "KM1", expr: ["AND", ["OR", "KM1", ["NE", "P_MARCHA", "0"]], ["EQ", "P_PARO", "0"]] },
          { out: "P_MARCHA", expr: ["SEL", ["NE", "P_MARCHA", "0"], "P_MARCHA", "0"] },
          { out: "P_PARO", expr: ["SEL", ["NE", "P_PARO", "0"], "P_PARO", "0"] },
        ],
      },
    },
    solution: {
      st: `F_CAJA(CLK := B1);
IF F_CAJA.Q THEN
  CAJAS := CAJAS + 1;
END_IF;

IF P_MARCHA <> 0 THEN
  KM1 := TRUE;
  P_MARCHA := 0;
END_IF;

IF P_PARO <> 0 THEN
  KM1 := FALSE;
  P_PARO := 0;
END_IF;

(* Pulsador remoto CERO (40004): el contador vuelve a 0 y se acusa la orden. *)
IF P_CERO <> 0 THEN
  CAJAS := 0;
  P_CERO := 0;
END_IF;`,
      ld: {
        rungs: [
          { comment: "Una caja más (40001)", elements: ["^B1", { fb: "ADD", en: true, pins: { IN1: "CAJAS", IN2: "1", OUT: "CAJAS" } }] },
          { comment: "¿La PC pulsó MARCHA? (40002 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "P_MARCHA", IN2: "0", OUT: "O_MARCHA" } }] },
          { comment: "Marcha: la banda queda encendida", elements: ["O_MARCHA", "S=KM1"] },
          { comment: "Acuse: el 40002 vuelve a 0", elements: ["O_MARCHA", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "P_MARCHA" } }] },
          { comment: "¿La PC pulsó PARO? (40003 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "P_PARO", IN2: "0", OUT: "O_PARO" } }] },
          { comment: "Paro: la banda se apaga", elements: ["O_PARO", "R=KM1"] },
          { comment: "Acuse: el 40003 vuelve a 0", elements: ["O_PARO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "P_PARO" } }] },
          { comment: "¿La PC pulsó CERO? (40004 distinto de 0)", elements: [{ fb: "NE", en: true, pins: { IN1: "P_CERO", IN2: "0", OUT: "O_CERO" } }] },
          { comment: "Contador a cero", elements: ["O_CERO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "CAJAS" } }] },
          { comment: "Acuse: el 40004 vuelve a 0", elements: ["O_CERO", { fb: "MOVE", en: true, pins: { IN: "0", OUT: "P_CERO" } }] },
        ],
      },
      fbd: {
        networks: [
          { fb: "R_TRIG", inst: "F_CAJA", in: { CLK: "B1" }, out: { Q: "CAJA" } },
          { out: "CAJAS", expr: ["SEL", ["NE", "P_CERO", "0"], ["SEL", "CAJA", "CAJAS", ["ADD", "CAJAS", "1"]], "0"] },
          { out: "KM1", expr: ["AND", ["OR", "KM1", ["NE", "P_MARCHA", "0"]], ["EQ", "P_PARO", "0"]] },
          { out: "P_MARCHA", expr: ["SEL", ["NE", "P_MARCHA", "0"], "P_MARCHA", "0"] },
          { out: "P_PARO", expr: ["SEL", ["NE", "P_PARO", "0"], "P_PARO", "0"] },
          { out: "P_CERO", expr: ["SEL", ["NE", "P_CERO", "0"], "P_CERO", "0"] },
        ],
      },
    },
    brief: {
      goal: "Contador a cero desde la PC: un tercer pulsador remoto en el 40004 pone el 40001 en 0 y el programa lo acusa devolviéndolo a 0.",
      steps: [
        "Ejecuta el ejemplo y espera «en línea» en la PC PC1. Arrastra el 40002 (MARCHA): la banda arranca y el 40002 vuelve solo a 0.",
        "Acciona B1 un par de veces y mira el 40001. Arrastra el 40003 (PARO): la banda para y el 40003 vuelve a 0.",
        "Declara P_CERO AT %MW3 (40004). Si es distinto de 0, pon CAJAS en 0 y devuelve P_CERO a 0.",
      ],
      uses: ["Ethernet · servidor Modbus TCP del proyecto, puerto 502", "%IX0.0 · B1, sensor de cajas", "%QX0.0 · KM1, banda (bobina 00001)", "%MW0 · 40001 cajas", "%MW1 · 40002 MARCHA", "%MW2 · 40003 PARO", "%MW3 · 40004 CERO", "PC1 · JW Modbus Tool"],
      teaches: "Una orden por red se da como un pulso: la PC escribe un valor y el programa, al cumplirla, lo devuelve a 0. Ese acuse le dice a la PC que la orden se hizo y evita que se repita.",
    },
    rubric: {
      goals: [
        { id: "marcha", description: "MARCHA desde la PC arranca la banda y se acusa", when: { "KM1.closed": true, "PC1.h1": 0 }, hold_ms: 500, hint: "En la PC PC1, arrastra el valor del 40002 a la derecha." },
        { id: "cuenta", description: "La PC ve cajas contadas", when: { "PC1.h0": [1, 9999] }, hold_ms: 300, after: "marcha", hint: "Acciona el sensor B1 con la banda en marcha." },
        { id: "cero", description: "CERO desde la PC pone el contador en 0 y se acusa", when: { "PC1.h0": 0, "PC1.h3": 0 }, hold_ms: 500, after: "cuenta", hint: "IF P_CERO <> 0 THEN CAJAS := 0; P_CERO := 0; END_IF;", why: "Sin el acuse, la PC no sabe si la orden se hizo y el contador quedaría en 0 para siempre." },
      ],
      cases: [
        {
          name: "Marcha, cajas, cero y paro",
          until_ms: 17000,
          actions: [{ at_ms: 9000, device: "PC1", action: "h1", value: 1 }, ...sensor("B1", 10000, 300), ...sensor("B1", 11000, 300), { at_ms: 12500, device: "PC1", action: "h3", value: 1 }, { at_ms: 14500, device: "PC1", action: "h2", value: 1 }],
          checks: [
            ev("MARCHA desde la PC arranca la banda", 3, 9000, 9900, { "KM1.closed": true }, 300),
            expect("El 40002 vuelve a 0 (acuse de MARCHA)", 3, 9900, { "PC1.h1": 0 }),
            expect("La PC ve 2 cajas en el 40001", 2, 12400, { "PC1.h0": 2 }),
            expect("CERO pone el 40001 en 0", 5, 13500, { "PC1.h0": 0 }),
            expect("El 40004 vuelve a 0 (acuse de CERO)", 3, 13500, { "PC1.h3": 0 }),
            expect("La banda sigue en marcha tras el cero", 1, 13500, { "KM1.closed": true }),
            ev("PARO desde la PC para la banda y se acusa", 3, 14500, 16500, { "KM1.closed": false, "PC1.h2": 0 }, 300),
          ],
        },
      ],
      goal_runs: [{ name: "Banda", until_ms: 15000, actions: [{ at_ms: 9000, device: "PC1", action: "h1", value: 1 }, ...sensor("B1", 10000, 300), ...sensor("B1", 11000, 300), { at_ms: 12500, device: "PC1", action: "h3", value: 1 }] }],
    },
  },
];
