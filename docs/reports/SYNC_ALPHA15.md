# Sincronización con platform-jwplc 2.1.0-alpha.15

```text
Package: v2.1.0-alpha.14 (f3f47aeeaaef) → v2.1.0-alpha.15/OpenPLC-HMI/main (11ef5160, republicación de alpha.15)
         + rama v2.1.0-alpha.15/OpenPLC-HMI/feature/rs485-ejemplos-alpha14
Fecha: 2026-10-27
Procedimiento: ARCHITECTURE §9

JWSIM_PACKAGE_SYNC_ALPHA15=PASS
```

**Actualización 2026-10-28:** 2.1.0-alpha.15 quedó publicada. `package.lock` fija el tag
`v2.1.0-alpha.15` (`cbeced0dc983`). Con el tag: paridad PASS (0 diferencias) y matriz de 125 ejemplos: 125
compilan, 125 corren y 125 pasan su prueba (`JW_RS485/Status` incluido: la corrección de los ejemplos entró en
la republicación). La publicación final del package ya corrió `SIM_REGRESSION` con jwplc-sim `19a1a40d`: PASS
([run 40599208706](https://github.com/JW-Control/platform-jwplc/actions/runs/40599208706)).

Antes de publicarse, `package.lock` seguía en el tag `v2.1.0-alpha.14` porque el tag `v2.1.0-alpha.15` se iba
a volver a crear con `JW_DWIN`.
El CI de platform-jwplc no depende de `package.lock`: `sim-regression.yml` recibe el árbol del llamador.

## 1. Qué trae alpha.15 que afecte al simulador

| Cambio del package | Efecto en el simulador |
|---|---|
| `JW_DWIN` 0.2.0 nueva (snapshot de JW Libraries, platform-jwplc#178) | Compila desde la fuente sin cambios en `sim/`. Paridad registrada (`sim/package-parity.json`). |
| Plantilla estándar de proyecto `00.Plantilla_Proyecto_JWPLC` (#184) | Prueba nueva: marcha, paro, emergencia con alarma enclavada y reconocimiento con ESC; sin alarmas falsas al arrancar. |
| Curso JWPLC Basic, lecciones 01–11 | Una prueba por lección (salidas, consola y tiempos). |
| Ejemplos `Basic_RS485` y `Simular_USB` de `JW_DWIN` | `Basic_RS485` simula la pantalla por Modbus RTU en UART2 (en línea, tecla leída, contador 1 y caída del enlace); `Simular_USB` prueba los sobres ESC `JW` y los comandos de consola. |
| El snapshot #178 devolvió los ejemplos de `JW_RS485`/`JW_ModbusRTU` a su versión anterior a alpha.14 | La prueba de `JW_RS485/Status` lo detectó (segundo bus en GPIO25/26/27). Se corrige en el package restaurando los ejemplos de alpha.14; las pruebas no cambian. |

## 2. Resultados

Con 11ef5160 sin la corrección de los ejemplos RS-485: paridad FAIL (`JW_DWIN`) y matriz con 14 ejemplos sin
prueba y `JW_RS485/Status` en falla.

Con el registro y las pruebas nuevas:

- Paridad: PASS (0 diferencias).
- Matriz: 125 ejemplos; 125 compilan y corren; 124 pasan con 11ef5160 (falla `JW_RS485/Status`, defecto del
  package) y los 7 ejemplos de `JW_RS485`/`JW_ModbusRTU` pasan con la rama de corrección.
- `tests/cli/pass`: 4/4.
