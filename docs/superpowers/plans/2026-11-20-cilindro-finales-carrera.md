# Configurador de Finales de Carrera en Cilindros — Plan de Implementación

**Spec:** `docs/superpowers/specs/2026-11-20-cilindro-finales-carrera-design.md`

- **Task 1 (`app/lib/cylinder-sensors.cjs` + `app/tests/cylinder-sensors.test.mjs`):**
  - TDD: probar `sensorsForValve`, `nextCylinderLetter`, `sensorPlacement`, `buildSensorDevice`, `updateSensorConfig` (renombrado con actualización de cables, banda intermedia `±0.03`, cambio de tipo) y `removeSensor`.
- **Task 2 (`app/renderer/index.html`, `app/renderer/style.css`, `app/renderer/scene.js`):**
  - Cargar `cylinder-sensors.cjs`, renderizar sección «Finales de carrera / Sensores» en Propiedades de `solenoid-valve` / `solenoid-valve-2`, manejar acciones `+ Par`, `+ Marca`, renombrar, cambiar posición/tipo y quitar con `pushHistory()`.
- **Task 3 (`app/renderer/pneumatic.js`, `app/renderer/scene3d.js`, `app/tests/e2e-cylinder-sensors.mjs`):**
  - Soportar posición intermedia `(min + max) / 2` en `pneumatic.js` y `scene3d.js`.
  - Prueba E2E en Electron: agregar `solenoid-valve`, pulsar `+ Par` en Propiedades, verificar que crea `A0` y `A1` sobre el émbolo enlazados a `Y1.position`, añadir marca intermedia `0.5`, renombrar y simular tras cablear.
- **Regla de commits:** commit detallado por cada archivo modificado o agregado.
