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

## 02 · Montacargas de 3 paradas

Motor trifásico con inversión por contactores (KM1 sube, KM2 baja, enclavados
por sus auxiliares NC), relé térmico F1, cabina en su pozo (`jwsim/lift`),
finales de piso SQ0-SQ2, puertas de piso con contacto en cadena (SP0-SP2),
celda de carga BW, llamadas SB0-SB2 y pilotos. La parada de emergencia y los
finales de sobrerrecorrido (SQS arriba, SQI abajo) van cableados en serie con
las bobinas, como en un tablero real. El PLC atiende las llamadas, para en el
final del piso pedido, no arranca con puerta abierta, sobrecarga o térmico, y
marca E01 (puerta abierta en marcha), E02 (sobrecarga o térmico) y E03 (el
piso no llega a tiempo). BTN_OK repone.

Prueba: `02-montacargas.jwtest.json` (sube a P2, baja y la puerta abierta en
marcha da E01).

## 03 · Planta de tratamiento de agua

Bomba de captación con contactor, filtro de arena a presión (`jwsim/sand-filter`)
con válvula de servicio Y1 y de retrolavado Y2, presostato diferencial PDS,
bomba dosificadora de cloro CL1 (`jwsim/chlorinator`) y analizador de cloro
residual AT1 por RS-485 (`jwsim/chlorine-rs485`, dir. 4), reservorio T2 con
flotadores bajo y alto. El PLC llena el reservorio entre sus flotadores, hace
el retrolavado (25 s) cuando PDS marca el filtro colmatado y regula el cloro a
1,0 mg/L con un PI de tiempo proporcional (ventana de 10 s). Alarmas: E10
cloro bajo, E11 cloro alto, E12 dosificadora sin efecto, E13 analizador sin
respuesta o sin muestra (deja de dosificar).

Prueba: `03-tratamiento-agua.jwtest.json` (filtra, colmata, retrolava, vuelve
y la celda seca da E13).
