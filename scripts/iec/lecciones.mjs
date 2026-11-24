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
const pos = (dev, at, value) => ({ at_ms: at, device: dev, action: "position", value });
const ev = (description, points, from_ms, to_ms, eventually, for_ms = 100) => ({ description, points, from_ms, to_ms, eventually, for_ms });
const never = (description, points, from_ms, to_ms, n) => ({ description, points, from_ms, to_ms, never: n });
const always = (description, points, from_ms, to_ms, a) => ({ description, points, from_ms, to_ms, always: a });
const expect = (description, points, at_ms, e) => ({ description, points, at_ms, expect: e });

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
];
