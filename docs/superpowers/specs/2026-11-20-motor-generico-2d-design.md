# Diseño: Rediseño del símbolo 2D del motor genérico (`jwsim/motor`)

**Fecha:** 2026-11-20
**Rama:** `feature/alpha18-revisiones`

## Intención y motivo
Diferenciar visualmente el motor genérico (`jwsim/motor`, 230 VAC / 24 VDC, bornes `U1` y `U2`) de los motores industriales WEG azules (`jwsim/motor-1ph` y `jwsim/motor-3ph`), y reemplazar el dibujo provisorio en código de `120 × 120` en `app/renderer/scene-symbols.js` por un archivo `.svg` bajo los lineamientos vigentes («réplica JW»).

## Restricciones
- Cumplir `docs/SIMBOLOS.md` y `docs/simbolos/LINEAMIENTOS.md`: `viewBox` múltiplo de `20`, bornes `.jw-term` con `cx` múltiplo de `20`, contorno oscuro `#1f2328`, colores planos sin degradados, sin marcas de terceros.
- Conservar ancho `≤ 220 px` para no solaparse con `T1` en `exercises/09-tolva-nivel/09-tolva-nivel.jwsim` (separación de `240 px`).
- Soportar los estados y parámetros reales de `jwsim/motor` en `scene/devices/loads.mjs`: `param.rating` (`230VAC` | `24VDC`), `out.speed` bidireccional (`-1..1` en `24VDC`) y `damaged`.

## Enfoque elegido
- **Opción A (aprobada):** motor compacto gris acero en vista lateral (`220 × 200`), generado desde `docs/simbolos/herramientas/v3/fam_campo.py` hacia `app/renderer/assets/devices/motor.svg`.
  - Bornera superior centrada con `U1` (`cx = 80`) y `U2` (`cx = 140`).
  - Carcasa cilíndrica lisa gris acero (`#c3c9d0` / `#9aa3ad`, sin aletas largas ni color azul WEG), tapa trasera con rejilla corta, patas abajo y eje metálico a la izquierda.
  - Disco giratorio de 3 aspas (`data-spin="out.speed:144:114:3"`), rótulo `M`, tensión dinámica (`230 V~` / `24 V=` según `param.rating`), indicador de sentido (`out.speed>0.01` / `out.speed<-0.01`) y capa `damaged` (`soot`).
- **Descartadas:** vista frontal circular (Opción B, rompe la orientación lateral de campo) y módulo de banco (Opción C, menos realista).
