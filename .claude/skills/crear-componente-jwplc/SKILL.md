---
name: crear-componente-jwplc
description: Crear o adaptar un componente propio de JWPLC Sim (planta, sensor, actuador o equipo Modbus RS-485) en formato declarativo jwcomp/1, a partir de la descripción del proceso, sin escribir código. Usar cuando pidan simular una planta o un equipo nuevo en el Sim, armar su modelo matemático, sus E/S o su mapa Modbus, o ajustar un component.json.
---

# Crear un componente de JWPLC Sim

Un componente es **solo datos**: `component.json` (E/S, modelo por bloques,
Modbus) más el dibujo `art.svg`. No se escribe JavaScript. El formato
completo está en `docs/COMPONENTES.md`. Esta guía da el método.

Ejemplo de referencia: `sdk/examples/hidroponia-nft/` (léelo antes de
empezar; es el patrón a copiar).

Responde y documenta en español.

## Método

### 1. Entender la planta (antes de escribir nada)

Pide o deduce, en una lista corta:

- **Qué entra desde el PLC**: salidas del PLC que mueven la planta (bomba,
  válvula, resistencia, motor). Son `digital-in` del componente.
- **Qué mide el PLC**: sensores. Un estado sí/no (flotador, final de
  carrera, termostato) es `digital-out`. Un valor continuo es `analog-out`
  (0-10 V, 4-20 mA o PT100) o un registro Modbus por RS-485.
- **Qué ajusta el alumno**: los parámetros físicos (caudal, τ, ganancia,
  capacidad). Van en `parameters` para que se ajusten en Propiedades sin
  tocar el modelo.
- **Qué escribe el PLC por Modbus**: consignas. Van en `vars`.

El JWPLC Basic no tiene entradas analógicas en bornera: si la planta da
valores continuos y el alumno usa el JWPLC Basic, ofrécelos por Modbus RTU
(RS-485). Deja el 4-20 mA solo si otro equipo de la escena lo va a leer.

### 2. Elegir los bloques según el fenómeno

| Fenómeno físico | Bloque | Ejemplo |
| --- | --- | --- |
| Algo que se **acumula** (nivel, volumen, energía, posición, contador) | `integrator` con `min`/`max` | `nivel` integra el caudal neto (%/s) |
| Algo que **tarda en responder** (temperatura, pH, velocidad, presión) | `tf` de 1.er orden (`tau1` en s), 2.º si tiene dos inercias, `2.º orden oscilatorio` si rebota (`wn`, `zeta`) | `ph` sigue a `phObjetivo` con τ = 90 s |
| Retardo de transporte (cinta, tubería larga) | `theta` (s) en el `tf` | Sensor a 5 m de la mezcla |
| Relación directa o balance (caudales, mezcla, potencia) | `expr` | `caudalNeto = llenado*q - bomba*consumo` |
| Curva no lineal medida (tanque cónico, válvula, NTC) | `table` con puntos `[x, y]` | volumen → nivel |
| Umbral con histéresis (flotador, termostato, presostato) | `compare` con `high`, `low`, `invert` | `nivelBajo` con 25/20 % e `invert` |
| Saturación física | `limit` | Velocidad máxima de un motor |
| Retardo de un evento (arranque estrella-triángulo, térmico) | `timer` `on`/`off` con `ms` | Alarma tras 5 s de sobrecarga |

Reglas para que el modelo sea estable y creíble:

- Usa **unidades por segundo** en integradores y fórmulas (`%/s`,
  `°C/s`). El paso `stepMs` (100-500 ms) no cambia el resultado del `tf`
  (discretización exacta), pero sí el detalle del integrador.
- Un **lazo** (la salida vuelve a la entrada) debe pasar por un `tf` o un
  `integrator`; si no, el validador lo rechaza.
- Pon `y0` realistas (estado inicial) y límites físicos en los
  integradores.
- Divide con cuidado: `x / max(y, 5)` en vez de `x / y` cuando `y` puede
  llegar a 0.
- Las salidas digitales del PLC llegan como 0/1: multiplica por ellas
  (`bomba * caudal`) en lugar de usar `if`.
- Cada número de un bloque puede ser el **id de un parámetro**: úsalo para
  todo lo que el alumno debería poder ajustar.

### 3. Escribir las E/S

- Bornes: hasta 12 caracteres (`A-Z a-z 0-9 + - _ .`), únicos, con nombres
  de bornera reales (`B1/B2`, `AO+/AO-`, `LS1/LS2`). RS-485 usa `A` y `B`.
- `rating` de entradas: `24VDC` (por defecto) o `230VAC`.
- Una sola `power` si el equipo necesita alimentación (sin ella no responde
  ni por Modbus: sirve para enseñar fallas).
- Entradas arriba, salidas abajo: el editor los ubica solo.

### 4. Mapa Modbus RTU

- `input` (FC04, solo lectura) para medidas; `holding` (FC03/06/16) para
  consignas con `"write": true`, `min`, `max` y la variable en `vars`.
- Enteros con escala: `ph × 100`, `temp × 10`. Usa `float32` solo si lo pide
  el ejercicio (ocupa dos registros).
- Documenta el mapa en `description`: dirección, baudios y cada registro
  con su escala. Es lo que el alumno lee para programar el maestro.
- Direcciones distintas por equipo si habrá varios en el mismo bus.

### 5. Dibujo y símbolo

- `art.svg`: un SVG simple con `viewBox`, sin `<script>`, sin imágenes
  externas (las `data:` sí). Se dibuja dentro de la caja, entre las
  borneras.
- `symbol.width`/`height` en múltiplos de 20 (p. ej. 340 × 240). No
  escribas `symbol.pins` a mano: se calcula al guardar.
- `symbol.widgets` para ver valores en vivo: `{ "kind": "value", "var",
  "x", "y", "decimals", "unit", "label" }` o `{ "kind": "lamp", "var", "x",
  "y", "color" }`.

### 6. Validar y probar (siempre, antes de entregar)

```
node cli/jwsim-cli.mjs device component <carpeta> --try escenario.json
node cli/jwsim-cli.mjs device test <carpeta>
```

`device component` valida, genera `symbol.svg`, `jwsim-device.json` y el
README, y corre el escenario. Escribe un escenario que recorra el
funcionamiento normal y un caso límite (tanque lleno, vacío, sin
alimentación, consigna escrita por Modbus):

```json
[
  { "ms": 0 },
  { "ms": 60000, "digital": { "bomba": 1 } },
  { "ms": 120000, "digital": { "llenado": 1 } },
  { "ms": 1000, "write": [{ "table": "holding", "reg": 0, "value": 2.2 }] },
  { "ms": 1000, "power": false }
]
```

Revisa que los números tengan sentido físico (signo, velocidad, límites) y
que los registros (`i0=640` = 6,40 con escala 100) coincidan con lo que
dice la descripción. Corrige y repite hasta que cuadre.

### 7. Entregar

- Carpeta `<nombre>/` con `component.json` y `art.svg` (lo demás se genera).
- Para usarlo: en la app, **Herramientas → Editor de componentes → Abrir…**
  y **Guardar y usar en el Sim**; o
  `node cli/jwsim-cli.mjs device component <carpeta> --link`.
- Explica al alumno, en pocas líneas, qué hace cada borne, qué parámetros
  puede ajustar y el mapa Modbus.

## Plantilla mínima (tanque con bomba y flotador)

```json
{
  "format": "jwcomp/1",
  "type": "utec/tanque",
  "version": "1.0.0",
  "name": "Tanque con bomba",
  "category": "Planta",
  "description": "Bomba (B1-B2, 24 VDC) llena el tanque; el flotador (LS1-LS2) cierra con nivel alto. Modbus RTU dirección 1, 9600 8N1: input 0 = nivel×10 %.",
  "stepMs": 200,
  "parameters": [
    { "id": "caudal", "label": "Caudal de la bomba", "type": "number", "default": 2, "unit": "%/s", "group": "Modelo" },
    { "id": "consumo", "label": "Consumo", "type": "number", "default": 0.5, "unit": "%/s", "group": "Modelo" }
  ],
  "io": [
    { "kind": "power", "a": "V+", "b": "V-", "rating": "24VDC" },
    { "kind": "digital-in", "var": "bomba", "a": "B1", "b": "B2", "label": "Bomba" },
    { "kind": "digital-out", "var": "nivelAlto", "a": "LS1", "b": "LS2", "label": "Flotador alto" }
  ],
  "blocks": [
    { "block": "expr", "out": "neto", "expr": "bomba * caudal - consumo" },
    { "block": "integrator", "in": "neto", "out": "nivel", "min": 0, "max": 100, "y0": 20 },
    { "block": "compare", "in": "nivel", "out": "nivelAlto", "high": 90, "low": 85 }
  ],
  "modbus": { "address": 1, "baud": 9600, "input": [{ "reg": 0, "var": "nivel", "scale": 10 }] },
  "symbol": { "width": 200, "height": 160, "widgets": [{ "kind": "value", "var": "nivel", "x": 100, "y": 80, "decimals": 0, "unit": "%", "label": "Nivel" }] }
}
```

## Errores frecuentes

- `type` debe ser `autor/nombre` en minúsculas; el autor `jwsim` está
  reservado.
- «la variable X no existe»: la usa un bloque o registro pero nadie la
  produce (falta la E/S, el bloque o el parámetro, o está mal escrita).
- «solo se escriben variables de estado»: falta declararla en `vars`.
- Lazo algebraico: mete un `tf` o un `integrator` en el lazo.
- 4-20 mA por debajo de 3,6 mA se lee como lazo abierto (NaN): es a
  propósito.
