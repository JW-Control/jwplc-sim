# Guía Completa de Escenas 2D/3D, Neumática, Código `.ino` y Pruebas

## 1. Reglas estrictas de diseño y auto-layout en 2D

Cuando `scene normalize` o `scene build` procesa un borrador sin coordenadas `x, y`, aplica la distribución oficial de tableros de **JWPLC Sim** sobre grilla de **20 px**:

1. **Fila 1 — Riel DIN superior (`y = 0`):**
   - Fuentes (`power-24vdc` `PS1`, `power-230vac` `L1`, `power-3ph` `Q1`) a la izquierda en `y = 0`.
   - Controlador `jwplc-basic` (`plc`) inmediatamente a la derecha en la misma línea `y = 0`.
   - Equipos de maniobra y protección (`breaker`, `contactor`, `overload-relay` con `"mount": "KM1"`, `relay`, `timer-relay`, `vfd-el`) alineados hacia la derecha en `y = 0`.
2. **Fila 2 — Mando y señalización (`y = 600`, columna izquierda):**
   - Pulsadores (`pushbutton-no`, `pushbutton-nc`, `emergency-stop`), selectores y lámparas piloto quedan agrupados debajo de las fuentes y del PLC (`x = 0..700`).
3. **Fila 3 — Cilindros neumáticos en una sola fila horizontal (`x = 760, 1520, 2280...`):**
   - Todas las electroválvulas con cilindro (`solenoid-valve` monoestable y `solenoid-valve-2` biestable) se alinean en **una sola fila horizontal** (mismo `y`), con sus **finales de carrera colocados exactamente encima del émbolo** (`y = valve.y - 160` con `orientacion: "abajo"`).
4. **Fila 4 — Compresor y unidad de mantenimiento (una fila debajo de los cilindros):**
   - El compresor (`compressor` `CP1`) y la unidad de mantenimiento (`service-unit` `FR1`) se colocan una fila debajo de los cilindros.

---

## 2. Neumática: cómo agregar cilindros y sus finales de carrera

En **JWPLC Sim**, el cilindro neumático viene integrado dentro de `solenoid-valve` (5/2 monoestable, bobina `A1/A2`) y `solenoid-valve-2` (5/2 biestable, bobinas `A+1/A+2` y `A-1/A-2`).

### Atajo recomendado: `"sensors": "compacto"` en la electroválvula
En la app, los finales de carrera se agregan desde el propio cilindro y quedan **encima del émbolo**. En JSON corto puedes hacer exactamente lo mismo poniendo `"sensors": "compacto"` (o `"magnetic"` / `"XCKJ"`) en cada electroválvula, **sin tener que declarar los sensores por separado**:

```json
{
  "name": "Sec_Neumatica",
  "scene": {
    "devices": [
      { "type": "power-24vdc" },
      { "type": "jwplc-basic" },
      { "type": "pushbutton-no", "params": { "color": "verde" } },
      { "type": "pushbutton-nc", "params": { "color": "rojo" } },
      { "type": "compressor", "params": { "supply": "propia" } },
      { "type": "solenoid-valve-2", "sensors": "compacto", "params": { "air": "CP1" } },
      { "type": "solenoid-valve-2", "sensors": "compacto", "params": { "air": "CP1" } },
      { "type": "solenoid-valve-2", "sensors": "compacto", "params": { "air": "CP1" } }
    ],
    "wiring": [
      "PS1.+V1 -> plc.24VDC [rojo]",
      "PS1.-V1 -> plc.M0 [azul]",
      "PS1.-V1 -> plc.M1 [azul]",
      "PS1.+V1 -> S1.13 [rojo]",
      "S1.14 -> plc.I0_0 [negro]",
      "PS1.+V1 -> S2.11 [rojo]",
      "S2.12 -> plc.I0_1 [negro]",
      "PS1.+V1 -> A0.13 [rojo]",
      "A0.14 -> plc.I0_2 [negro]",
      "PS1.+V1 -> A1.13 [rojo]",
      "A1.14 -> plc.I0_3 [negro]",
      "PS1.+V1 -> B0.13 [rojo]",
      "B0.14 -> plc.I0_4 [negro]",
      "PS1.+V1 -> B1.13 [rojo]",
      "B1.14 -> plc.I0_5 [negro]",
      "PS1.+V1 -> C0.13 [rojo]",
      "C0.14 -> plc.I0_6 [negro]",
      "PS1.+V1 -> C1.13 [rojo]",
      "C1.14 -> plc.I0_7 [negro]",
      "PS1.+V2 -> plc.Q0_0.1 [rojo]",
      "plc.Q0_0.2 -> Y1.A+1 [negro]",
      "Y1.A+2 -> PS1.-V2 [azul]",
      "PS1.+V2 -> plc.Q0_1.1 [rojo]",
      "plc.Q0_1.2 -> Y1.A-1 [negro]",
      "Y1.A-2 -> PS1.-V2 [azul]",
      "PS1.+V2 -> plc.Q0_2.1 [rojo]",
      "plc.Q0_2.2 -> Y2.A+1 [negro]",
      "Y2.A+2 -> PS1.-V2 [azul]",
      "PS1.+V2 -> plc.Q0_3.1 [rojo]",
      "plc.Q0_3.2 -> Y2.A-1 [negro]",
      "Y2.A-2 -> PS1.-V2 [azul]",
      "PS1.+V2 -> plc.Q0_4.1 [rojo]",
      "plc.Q0_4.2 -> Y3.A+1 [negro]",
      "Y3.A+2 -> PS1.-V2 [azul]",
      "PS1.+V2 -> plc.Q0_5.1 [rojo]",
      "plc.Q0_5.2 -> Y3.A-1 [negro]",
      "Y3.A-2 -> PS1.-V2 [azul]"
    ]
  }
}
```

Qué hace automáticamente `scene normalize` / `scene build` con ese borrador:
1. Nombra las tres electroválvulas `Y1`, `Y2`, `Y3` y las alinea en una sola fila horizontal (`y = 440`, `x = 760, 1520, 2280`).
2. Crea encima de cada émbolo los finales de carrera de rodillo (`limit-switch`, `model: "compacto"`, `orientacion: "abajo"`, bornes `13` y `14`):
   - `A0` (`0`) y `A1` (`1`) encima de `Y1` → la app rotula a `Y1` como **Cilindro A**.
   - `B0` (`0`) y `B1` (`1`) encima de `Y2` → la app rotula a `Y2` como **Cilindro B**.
   - `C0` (`0`) y `C1` (`1`) encima de `Y3` → la app rotula a `Y3` como **Cilindro C**.
3. Ubica el compresor `CP1` una fila debajo (`y = 900`) y completa `params.consumers = "Y1, Y2, Y3"`.

> **Regla sobre fuentes de alimentación:** si el compresor usa `"supply": "propia"`, **no** agregues una fuente `power-230vac` sin cablear (`scene validate --strict` avisará si dejas una fuente sin cables).

---

## 3. Cableado del `JWPLC Basic` y colores IEC 60445

- **Alimentación del PLC:** `PS1.+V1 -> plc.24VDC [rojo]` y `PS1.-V1 -> plc.M0 [azul]`.
- **Entradas digitales (`I0_0..I0_7`, tipo sink 24 VDC):**
  - Conecta siempre el común de entradas a `0 V`: `PS1.-V1 -> plc.M1 [azul]`.
  - Cada contacto o sensor PNP entrega `+24 V` al borne `plc.I0_x`.
- **Salidas a relé (`Q0_0..Q0_7`, contactos secos NA independientes):**
  - Cada salida tiene 2 bornes propios (`Q0_x.1` y `Q0_x.2`).
  - Alimenta `PS1.+V1 -> plc.Q0_x.1 [rojo]`, sal de `plc.Q0_x.2 -> Carga.A1 [negro]` y cierra retorno `Carga.A2 -> PS1.-V1 [azul]`.
- **Colores válidos:** `rojo` (+24 V), `azul` (0 V), `marrón` (fase L 230 VAC), `celeste` (neutro N), `negro` (señal/mando), `gris`, `blanco`, `naranja`, `violeta`, `verde-amarillo` (PE).

---

## 4. Programación Arduino (`.ino`) del `JWPLC Basic` sin parpadeos

El `JWPLC Basic` expone las constantes `I0_0..I0_7`, `Q0_0..Q0_7` y los botones del frente (`BTN_OK`, `BTN_ESC`, `BTN_UP`, `BTN_DOWN`, `BTN_LEFT`, `BTN_RIGHT`) con `digitalRead()` y `digitalWrite()`.

### Reglas críticas para secuencias limpias en el Diagrama de Estados
1. **Escribir las salidas UNA sola vez al final de `loop()`:**
   - **NUNCA** llames a `apagarTodo()` al principio del `loop()` y luego `digitalWrite(salida, HIGH)` más abajo: eso apaga y enciende los relés en cada ciclo de scan y hace oscilar las bobinas.
2. **En secuencias neumáticas (ej. `A+ B+ A- C+` y retorno a casa):**
   - Haz que cada paso tenga su estado propio (o retención breve de `150–250 ms` tras llegar al final de carrera) para que en el **Diagrama de Estados** se vea una meseta clara y no un pico triangular de 1 ms.
   - **No actives bobinas innecesarias:** si el cilindro `A` ya regresó en el paso `A-`, durante el retorno final de `B-` y `C-` **no** vuelvas a activar la bobina `A-` (o solo actívala si `!digitalRead(A0)`), para no producir un segundo pulso fantasma en `Bob. A-`.

### Plantilla canónica `.ino` (Secuencia `A+ B+ A- C+` con retorno limpio)

```cpp
#define START_PIN I0_0
#define STOP_NC   I0_1
#define FC_A0     I0_2
#define FC_A1     I0_3
#define FC_B0     I0_4
#define FC_B1     I0_5
#define FC_C0     I0_6
#define FC_C1     I0_7

#define BOB_A_MAS   Q0_0
#define BOB_A_MENOS Q0_1
#define BOB_B_MAS   Q0_2
#define BOB_B_MENOS Q0_3
#define BOB_C_MAS   Q0_4
#define BOB_C_MENOS Q0_5

enum Paso { REPOSO, PASO_A_MAS, PASO_B_MAS, PASO_A_MENOS, PASO_C_MAS, PAUSA_C_EXT, PASO_RETORNO };
Paso paso = REPOSO;
bool startAnt = false;
unsigned long tPaso = 0;

void cambiarPaso(Paso nuevo) {
  paso = nuevo;
  tPaso = millis();
}

void setup() {
  for (int q : {BOB_A_MAS, BOB_A_MENOS, BOB_B_MAS, BOB_B_MENOS, BOB_C_MAS, BOB_C_MENOS}) {
    digitalWrite(q, LOW);
  }
}

void loop() {
  bool start = digitalRead(START_PIN);
  bool paro  = !digitalRead(STOP_NC); // NC: 1 en reposo, 0 al pulsar
  bool flancoStart = start && !startAnt;
  startAnt = start;

  bool a0 = digitalRead(FC_A0), a1 = digitalRead(FC_A1);
  bool b0 = digitalRead(FC_B0), b1 = digitalRead(FC_B1);
  bool c0 = digitalRead(FC_C0), c1 = digitalRead(FC_C1);

  if (paro) {
    cambiarPaso(REPOSO);
  } else {
    switch (paso) {
      case REPOSO:
        if (flancoStart) cambiarPaso((a0 && b0 && c0) ? PASO_A_MAS : PASO_RETORNO);
        break;
      case PASO_A_MAS:
        if (a1) cambiarPaso(PASO_B_MAS);
        break;
      case PASO_B_MAS:
        if (b1) cambiarPaso(PASO_A_MENOS);
        break;
      case PASO_A_MENOS:
        if (a0) cambiarPaso(PASO_C_MAS);
        break;
      case PASO_C_MAS:
        if (c1) cambiarPaso(PAUSA_C_EXT);
        break;
      case PAUSA_C_EXT:
        // Sostiene C extendido 250 ms para que se aprecie la meseta en el Diagrama de Estados
        if (millis() - tPaso >= 250) cambiarPaso(PASO_RETORNO);
        break;
      case PASO_RETORNO:
        if (a0 && b0 && c0) cambiarPaso(REPOSO);
        break;
    }
  }

  // Escritura única por ciclo de scan; en PASO_RETORNO solo retrae los que aún no están en 0
  digitalWrite(BOB_A_MAS,   paso == PASO_A_MAS);
  digitalWrite(BOB_A_MENOS, paso == PASO_A_MENOS || (paso == PASO_RETORNO && !a0));
  digitalWrite(BOB_B_MAS,   paso == PASO_B_MAS);
  digitalWrite(BOB_B_MENOS, paso == PASO_RETORNO && !b0);
  digitalWrite(BOB_C_MAS,   paso == PASO_C_MAS);
  digitalWrite(BOB_C_MENOS, paso == PASO_RETORNO && !c0);
}
```

---

## 5. Cómo probar la secuencia completa con `jwsim-cli test` (`.jwtest.json`)

Para verificar que el `.ino` compila y que los cilindros realmente hacen la secuencia en la escena, crea un archivo `prueba.jwtest.json` junto al `.jwsim` y ejecuta:

```powershell
node cli/jwsim-cli.mjs test <ruta/prueba.jwtest.json> --json
```

Ejemplo de `prueba.jwtest.json` que pulsa `S1` (`press`) entre `t = 200 ms` y `350 ms` y comprueba cada etapa de `A+ B+ A- C+`:

```json
{
  "sketch": "./sec_neumatica",
  "scene": "./sec_neumatica.jwsim",
  "until_ms": 5000,
  "actions": [
    { "at_ms": 200, "device": "S1", "action": "press", "value": true },
    { "at_ms": 350, "device": "S1", "action": "press", "value": false }
  ],
  "expect": {
    "scene": {
      "faults": [],
      "state": [
        { "at_ms": 100,  "A0.actuated": true, "B0.actuated": true, "C0.actuated": true },
        { "at_ms": 800,  "A1.actuated": true },
        { "at_ms": 1400, "A1.actuated": true, "B1.actuated": true },
        { "at_ms": 1950, "A0.actuated": true, "B1.actuated": true },
        { "at_ms": 2550, "A0.actuated": true, "B1.actuated": true, "C1.actuated": true },
        { "at_ms": 4000, "A0.actuated": true, "B0.actuated": true, "C0.actuated": true }
      ]
    }
  }
}
```
