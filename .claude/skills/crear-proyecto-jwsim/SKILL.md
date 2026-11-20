---
name: crear-proyecto-jwsim
description: Crear o modificar un proyecto completo de JWPLC Sim (.jwsim, código Arduino .ino u OpenPLC, esquema eléctrico 2D y Planta 3D) a partir de JSON corto usando jwsim-cli scene. Usar cuando pidan armar un circuito, tablero eléctrico, automatización de planta o ejercicio en JWPLC Sim.
---

# Crear o editar un proyecto `.jwsim` por JSON

No calcules píxeles a mano ni cargues `scene/devices/*.mjs` en contexto: usa los subcomandos `jwsim-cli scene …` y la referencia viva.

Responde y documenta en español.

## Flujo de 5 pasos

1. **Consultar dispositivos y bornes reales**
   - Lista compacta: `node cli/jwsim-cli.mjs scene describe --json`
   - Ficha de un equipo (parámetros, variantes SVG, bornes activos y salidas 3D):
     `node cli/jwsim-cli.mjs scene describe <tipo> --json`
   - Tabla completa generada: `docs/REFERENCIA_ESCENA.md`

2. **Redactar el borrador en forma corta JSON + `.ino`**
   - Puedes omitir `$schema`, `format`, `version`, `board`, `id` y coordenadas `x, y`.
   - Usa tipos cortos (`"contactor"`, `"motor-3ph"`) y cables en texto (`"PS1.+V1 -> KM1.A1 [rojo]"`).
   - Ver detalles de zonas, colores IEC 60445, acoples `mount` y enlaces 3D en `docs/AGENTES_ESCENAS.md`.
   - Recuerda las entradas/salidas del `jwplc-basic`:
     - Entradas `I0_0..I0_7`: sink 24 VDC (`+24 V` al borne `I0_x` y `M1` al `0 V` `-V1`).
     - Salidas `Q0_0..Q0_7`: contactos secos independientes (`Q0_x.1` y `Q0_x.2`).

3. **Normalizar y validar hasta `0` errores y `0` avisos**
   - Normalizar con auto-layout en grilla de `20 px`:
     `node cli/jwsim-cli.mjs scene normalize <borrador.json> -o <proyecto.jwsim> --json`
   - Validar variantes, grilla, colisiones 2D, enlaces 3D y netlist `t = 0`:
     `node cli/jwsim-cli.mjs scene validate <proyecto.jwsim> --strict --json`
   - O en un paso (sin sobrescribir `.ino` existentes):
     `node cli/jwsim-cli.mjs scene build <borrador.json> --out <carpeta> --create-ino --strict --json`

4. **Previsualizar 2D y Planta 3D**
   - `node cli/jwsim-cli.mjs scene preview <proyecto.jwsim> --out <dir> --view both --json`
   - Verifica `ok: true`, `warnings: []`, cables enrutados e inspecciona visualmente `schematic-2d.png` y `plant-3d.png`.

5. **Probar comportamiento y lógica del PLC**
   - `node cli/jwsim-cli.mjs test <prueba.jwtest.json> --json`
   - Si el usuario tiene el `.jwsim` abierto en la app, la ventana recargará automáticamente los cambios limpios (o mostrará el botón «Recargar .jwsim» si hay ediciones sin guardar).
