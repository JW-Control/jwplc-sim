# Arquitecturas de la vitrina

Casos de planta completos, con programa, escena y fallas para mostrar, que se
abren desde el menú **Arquitecturas…** de la barra (se copian a
`Arquitecturas/<id>` en la carpeta de trabajo, como los ejercicios). A
diferencia de un ejercicio, el sketch es la solución: se abre y se ejecuta.

Cada arquitectura vive en `arquitecturas/<id>/`:

| Archivo | Para qué |
|---|---|
| `<id>.jwsim` | Proyecto: placa, programa y escena |
| `sketch/<nombre>/` | Programa del JWPLC Basic |
| `VITRINA.md` | Ficha que se escribe en la consola al abrirla: recorrido y fallas |
| `*.jwtest.json` | Pruebas sin interfaz (`node cli/jwsim-cli.mjs test arquitecturas/<id>/`) |

## 01 · Bombeo de edificio a presión constante

Dos bombas con variador Delta VFD-EL (Modbus RTU, direcciones 1 y 2), un
transmisor de presión RS-485 (dirección 3), la cisterna con su flotador y la
red del edificio con tanque hidroneumático (`jwsim/building-water`). El PLC
regula 4,0 bar con un PI sobre la bomba líder, hace entrar la de apoyo cuando
la líder va a 60 Hz y falta presión, duerme con poco consumo y alterna la
líder al despertar.

Pruebas: `01-bombeo-edificio.jwtest.json` (regulación, apoyo, alternancia y
transmisor abierto) y `falla-bomba.jwtest.json` (STOP en el teclado de VF1:
E1M y entra B2). En la app: `app/tests/e2e-arquitecturas.mjs`.
