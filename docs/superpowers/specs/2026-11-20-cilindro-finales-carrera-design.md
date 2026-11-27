# Diseño: Configurador de finales de carrera y sensores desde el cilindro (estilo FluidSIM)

**Fecha:** 2026-11-20  
**Rama:** `feature/alpha18-revisiones`

## Intención y motivo
Evitar que el usuario tenga que arrastrar manualmente desde la paleta los finales de carrera (`jwsim/limit-switch`) o sensores magnéticos (`jwsim/sensor-cylinder`), renombrarlos y escribir `Y1.position` a mano cada vez que coloca un cilindro (`jwsim/solenoid-valve`, `jwsim/solenoid-valve-2`).

Desde la sección **Propiedades** de cualquier electroválvula/cilindro se ofrece una tabla estilo **FluidSIM** que crea, nombra, configura, ubica automáticamente sobre el émbolo en el lienzo 2D y enlaza los sensores reales de la escena, dejando sus bornes listos para cablear al PLC.

## Enfoque elegido (Opción A)
- **Módulo puro UMD (`app/lib/cylinder-sensors.cjs`):**
  - Detecta los sensores vinculados a una válvula (`limit-switch` con `source === "<id>.position"` y `sensor-cylinder` con `cylinder === "<id>"`), ordenados por posición `0 → 1`.
  - Sugiere la letra libre siguiente (`A`, `B`, `C`…) y nombres `A0`/`A1` (o `A2`… para marcas intermedias).
  - Crea dispositivos reales encima del émbolo del cilindro (`y = valve.y - alto - 20`, alineado en `x` según la posición `0..1` sobre el recorrido del vástago).
  - Para `limit-switch`: extremos `0` y `1` fijan `min = max = 0` / `min = max = 1`; posiciones intermedias (`0 < pos < 1`) fijan banda `[pos - 0.03, pos + 0.03]` para que `rangeWindow` en `scene/scene.mjs` conmute al pasar el vástago.
  - Renombrar una marca actualiza `dev.id` y las puntas de `wiring` asociadas (y `StateDiag` / `JwsimPneu` se actualizan automáticamente).
  - Cambiar tipo entre `Rodillo compacto`, `Rodillo XCKJ` y `Magnético SMT-8M` actualiza modelo o tipo de dispositivo, limpia cables cuyos bornes ya no existan al cambiar de rodillo a magnético y reajusta la altura sobre el cilindro.
- **Inspector en `app/renderer/scene.js`:**
  - Sección **`Finales de carrera / Sensores`** en `renderSide()` para `solenoid-valve` y `solenoid-valve-2`, con selector de tipo, botón **`+ Par A0/A1`** (adaptado a la letra libre), botón **`+ Marca`**, tabla editable (`Marca`, `Posición 0..1`, `Tipo`, `×`), todo deshabilitado durante `S.running` y reversible con Deshacer (`Ctrl+Z`).
- **Posición intermedia en `pneumatic.js` y `scene3d.js`:**
  - Calcular la posición normalizada `(min + max) / 2` en `limit-switch` para que marcas intermedias (p. ej. `0.5`) aparezcan también en su punto real en el esquema ISO y en 3D.
