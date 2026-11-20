# Plan de implementación: Símbolo 2D de `jwsim/motor`

> **Para agentes ejecutores:** Seguir `superpowers:executing-plans` paso a paso.

**Goal:** Generar `app/renderer/assets/devices/motor.svg` desde `docs/simbolos/herramientas/v3/fam_campo.py` siguiendo el diseño «réplica JW» compacto gris acero (`220 × 200`) y validar con los checks de grilla y G7.

**Architecture:** `app/renderer/scene-symbols.js` carga automáticamente `app/renderer/assets/devices/motor.svg` cuando existe; no requiere cambios en el código JS ni en `scene/devices/loads.mjs`.

**Tech Stack:** Python 3 (`docs/simbolos/herramientas/v3/fam_campo.py`), SVG, Node/Playwright (`app/tests/audit-grilla.mjs`, `app/tests/e2e-g7.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-20-motor-generico-2d-design.md`

## Global Constraints
- `viewBox="0 0 220 200"` (múltiplos de `20`) y bornes `U1` (`cx=80`), `U2` (`cx=140`) con `.jw-term`.
- Contorno `#1f2328`, colores planos sin degradados, sin marcas de terceros.
- Giro bidireccional con `data-spin="out.speed:144:114:3"`, tensión según `param.rating` y estado `damaged`.

## Review Focus
- Que `motor.svg` cargue sin advertencias en `JwsimSymbols.registerTemplate` (`warnings.length === 0`).
- Que `audit-grilla.mjs` reporte `JWSIM_GRILLA=PASS` con `jwsim/motor` usando la plantilla `jwsim/motor` y bornes `U1`, `U2` en múltiplo de `20`.
- Que las animaciones `out.speed` (positivo y negativo), `param.rating` (`230VAC`/`24VDC`) y `damaged` funcionen sin errores de sintaxis en los atributos `data-*`.

---

### Task 1: Generador en `fam_campo.py`, regeneración de `motor.svg` y verificación

**Files:**
- Modify: `docs/simbolos/herramientas/v3/fam_campo.py`
- Create: `app/renderer/assets/devices/motor.svg`
- Verify: `app/tests/audit-grilla.mjs`, `app/tests/e2e-g7.mjs`

- [ ] **Step 1: Verificar línea base actual**
  Run: `node app/tests/audit-grilla.mjs`
  Expected: `JWSIM_GRILLA=PASS` (con `jwsim/motor` todavía sin plantilla `.svg`).

- [ ] **Step 2: Agregar el generador de `motor` (`220 × 200`) en `docs/simbolos/herramientas/v3/fam_campo.py`**
  Agregar junto a los motores la generación de `'motor'` con bornera `U1` (`80`), `U2` (`140`), carcasa gris acero lisa, tapa trasera ventilada, eje a la izquierda, patas, indicador `data-spin="out.speed:144:114:3"`, rótulo `M`, tensión `230 V~` / `24 V=` (`param.rating`), sentido (`out.speed>0.01` / `out.speed<-0.01`) y `soot` para `damaged`.

- [ ] **Step 3: Ejecutar `fam_campo.py` para generar `motor.svg`**
  Run: `python docs/simbolos/herramientas/v3/fam_campo.py`
  Expected: `campo ok` y creación de `app/renderer/assets/devices/motor.svg` sin modificar otros SVGs inesperadamente (`git diff --stat`).

- [ ] **Step 4: Validar grilla, carga de plantilla y escena E2E**
  Run: `node app/tests/audit-grilla.mjs` y `node app/tests/e2e-g7.mjs`
  Expected: `JWSIM_GRILLA=PASS` con `template: "jwsim/motor"` en `build/gates/JWSIM_GRILLA.json` y `e2e-g7.mjs` en PASS (`SCENE_VARIANTS` sin avisos de plantilla).
