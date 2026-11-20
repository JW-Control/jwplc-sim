# Guía de diseño de escenas y proyectos `.jwsim` para agentes

Esta guía resume las reglas prácticas para construir proyectos eléctricos, de automatización y de Planta 3D con `jwsim-cli scene …`. El catálogo vivo de los 65+ dispositivos está en [`REFERENCIA_ESCENA.md`](REFERENCIA_ESCENA.md).

## 1. Forma corta de JSON

Un borrador mínimo acepta tipos cortos, IDs automáticos, cables como texto y coordenadas omitidas:

```json
{
  "name": "arranque-directo",
  "scene": {
    "devices": [
      { "type": "power-24vdc" },
      { "type": "jwplc-basic" },
      { "type": "pushbutton-no", "params": { "color": "verde" } },
      { "type": "contactor" },
      { "type": "overload-relay", "mount": "KM1" },
      { "type": "motor-3ph", "zone": "campo" }
    ],
    "wiring": [
      "PS1.+V1 -> plc.24VDC [rojo]",
      "PS1.-V1 -> plc.M0 [azul]",
      "PS1.-V1 -> plc.M1 [azul]",
      "PS1.+V1 -> S1.13 [rojo]",
      "S1.14 -> plc.I0_0 [negro]",
      "PS1.+V1 -> plc.Q0_0.1 [rojo]",
      "plc.Q0_0.2 -> KM1.A1 [negro]",
      "KM1.A2 -> PS1.-V1 [azul]"
    ]
  }
}
```

Atajos admitidos en `wiring`:
- `"A.1 -> B.2"` o `"A.1 - B.2"`
- Color opcional: `"PS1.+V1 -> KM1.A1 [rojo]"`
- Multipolares y referencias: `"VF1.U -> M1.U1 [negro, cable:W1, ref]"` o `cables: [{ "id": "W1", "wires": [...] }]`

## 2. Zonas y grilla (`20 px`)

- Todos los símbolos y coordenadas caen en múltiplos de **20 px**.
- Si omites `x` e `y`, `scene normalize` ubica cada equipo según su `zone` (o categoría por defecto) dejando al menos `60 px` libres usando las dimensiones `.svg` reales:
  - `alimentacion`: fuentes `power-*`
  - `controlador`: `jwplc-basic`
  - `tablero`: `breaker`, `motor-protector`, `contactor`, `overload-relay`, `relay`, `timer-relay`, `vfd-el`, `remote-io`
  - `mando`: pulsadores, selectores, pilotos, zumbadores, potenciómetros
  - `campo`: motores, válvulas, sensores, transmisores RS-485
  - `proceso`: `conveyor`, `conveyor-physics`, `tank`, `door`, `lift`, `building-water`, `sand-filter`, `fermentador`
- Si ya posicionaste algunos equipos manualmente, `scene normalize` conserva esas coordenadas y coloca únicamente los que faltan sin superponerlos.

## 3. Acoples mecánicos (`mount`) y variantes SVG

- El relé térmico (`jwsim/overload-relay`) se engrapa bajo un contactor (`"mount": "KM1"`). Sus puentes `1-3-5` quedan unidos internamente a `2-4-6` del contactor y `normalize` lo sitúa en `mountPos` (`dy: 340`).
- Variantes SVG modifican los bornes disponibles:
  - `jwsim/power-24vdc`: `model: "HDR-60"` **no** tiene borne `PE`; `"MDR-60"` y `"NDR-120"` sí lo incluyen.
  - `jwsim/motor-3ph`: por defecto (`bornera: "triangulo"` o `"estrella"`) solo expone `U1, V1, W1, PE`. Para estrella-triángulo exterior con 6 bornes usa `params: { "bornera": "6 cables" }`.
  - `jwsim/contactor`: `aux: "10"` expone `13-14` (NA); `aux: "01"` expone `21-22` (NC).

## 4. Colores de cables (IEC 60445)

Colores válidos: `rojo` (+24 VDC), `azul` (0 V), `marrón` (L / fase 230 VAC), `celeste` (N neutro), `negro` (mando o fase trifásica), `gris`, `blanco`, `naranja`, `violeta`, `verde-amarillo` (PE).

## 5. Planta 3D derivada y enlaces

La Planta 3D no lleva JSON propio: se genera desde `scene.devices` y sus parámetros de enlace:
- Actuadores de proceso (`conveyor`, `conveyor-physics`, `tank`, `door`, `lift`): apuntan con `motor` o `bomba` a `<id>.<salida>` de un motor (`"M1.speed"` o `"M1.running"`). `building-water` usa `bombas: "M1, M2"`.
- `sensor-*`, `limit-switch`, `float-switch`, `pressure-switch`: usan `source` (`"<id>.<salida>"`, p. ej. `"CV1.sensorA"`, `"T1.nivel"`, `"Y1.position"`), con umbrales `min` / `max`.
- `sensor-cylinder`: usa `cylinder: "Y1"` y `end: "retraído" | "extendido"`.

Usa `jwsim-cli scene validate <archivo.jwsim> --strict --json` para detectar referencias inexistentes o salidas equivocadas antes de previsualizar o simular.
