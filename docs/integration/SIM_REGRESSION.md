# Gate SIM_REGRESSION en platform-jwplc (propuesta)

Gate `JWSIM_G5_RELEASE_WORKFLOW`: el flujo de release del package corre la
regresión simulada **antes** de publicar y de los gates físicos, sin
reemplazarlos, y no publica si falla.

> Estado: **en espera** (decisión de JW Control, 23/10/2026): se agrega a los
> workflows de platform-jwplc al cerrar las alphas 14 (HMI Designer) y 15
> (OpenPLC). Mientras tanto se corre a pedido desde este repositorio contra
> las ramas del package (`package_ref`).

## Qué corre

`.github/workflows/sim-regression.yml` de este repositorio (reutilizable con
`workflow_call`), sobre el árbol del commit que lo llama:

1. `jwsim-cli parity --package platform`: fuentes del core sin clasificar,
   headers que no se encuentran, cambios en el autoload y en la lista de
   librerías (contra `sim/package-parity.json`).
2. `jwsim-cli matrix --package platform`: cada ejemplo de las librerías
   `JW*`/`JWPLC_*` compila, corre y pasa su prueba
   (`tests/examples/<librería>/<ejemplo>.jwtest.json`).
3. `jwsim-cli test tests/cli/pass --package platform`: E/S, vigilante y
   persistencia entre arranques.

Publica los informes como artefacto (`sim-regression`) y la matriz en el
resumen de la corrida. Si algún paso falla, el job falla (`SIM_REGRESSION=FAIL`).

Duración esperada en `ubuntu-latest`: ~15–25 min sin caché de objetos (el
build de cada ejemplo comparte la caché de la corrida).

## Cambio propuesto en platform-jwplc

Rama base: `release/v2.1.x`. `<sha>` es un commit fijo de jwplc-sim (el mismo
en `uses:` y en `sim_ref`), para que la regresión sea reproducible y se suba a
propósito.

### `.github/workflows/release-jwplc-package.yml`

```yaml
jobs:
  # Gate SIM_REGRESSION (JWPLC Sim): compila y simula el árbol de esta rama
  # (paridad del core y del autoload, ejemplos con sus pruebas). Corre antes
  # de publicar; no reemplaza los gates físicos en placa. Si falla, la
  # release no se publica.
  sim-regression:
    name: SIM_REGRESSION (JWPLC Sim)
    uses: JW-Control/jwplc-sim/.github/workflows/sim-regression.yml@<sha>
    with:
      sim_ref: <sha>

  release:
    name: Preparar y publicar package JWPLC
    needs: sim-regression          # ← única línea nueva en el job existente
    runs-on: ubuntu-latest
    # … sin cambios …
```

### `.github/workflows/ci-jwplc-package-smoke.yml` (PR hacia `release/v2.1.x`)

```yaml
jobs:
  # Regresión simulada (JWPLC Sim) del árbol del PR, en paralelo a la
  # compilación con Arduino CLI. Previa a los gates físicos; no los reemplaza.
  sim-regression:
    name: SIM_REGRESSION (JWPLC Sim)
    uses: JW-Control/jwplc-sim/.github/workflows/sim-regression.yml@<sha>
    with:
      sim_ref: <sha>

  compile-smoke:
    # … sin cambios …
```

Permisos: el workflow llamado solo necesita `contents: read`; no recibe
secretos.

## Cuando una alpha cambia algo legítimamente

Si la regresión falla por un cambio intencional del package (un ejemplo
nuevo, otro texto en la consola, una fuente nueva del core):

1. En jwplc-sim: clasificar la fuente (`sim/core-manifest.json`), registrar el
   autoload (`jwsim-cli parity --update`), agregar o ajustar la prueba del
   ejemplo (`scripts/gen-example-tests.mjs` genera el borrador).
2. Subir `<sha>` en los dos workflows de platform-jwplc.

## Verificación

- A pedido desde jwplc-sim: `SIM_REGRESSION` con `package_ref` =
  `v2.1.0-alpha.13` debe pasar; con `v2.1.0-alpha.10` debe fallar (otro
  autoload, sin `JWPLC_TFT` ni `JWPLC_ModbusTCP`).
- En platform-jwplc, tras el PR: un PR de prueba hacia `release/v2.1.x` muestra
  el job `SIM_REGRESSION (JWPLC Sim)`; el release queda bloqueado si falla.
