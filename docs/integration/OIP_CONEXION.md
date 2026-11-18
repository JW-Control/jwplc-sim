# Conectar JWPLC Sim con Open Industry Project (OIP)

Guía para comunicar el PLC simulado de JWPLC Sim con una planta 3D de
Open Industry Project. La planta (cinta, caja, fotocelda) vive en OIP y el
programa corre en el JWPLC Basic simulado. El esquema eléctrico del Sim
queda vacío: OIP maneja la bornera directamente.

Probado el 18/11/2026 con OIP de escritorio **2026.11.10** (Windows) y la
rama `feature/alpha18-IntegracionOIP`.

## 1. Cómo se comunican

```text
  Open Industry Project                         JWPLC Sim
  (cliente Modbus TCP)                    (puente de E/S, servidor)
 ┌──────────────────────┐   cada 20 ms   ┌──────────────────────────┐
 │ fotocelda  %IX0.0 ───┼── FC16 HR0 ───►│ I0.0 ─┐                  │
 │ pulsador   %IX0.1 ───┼────────────────│ I0.1 ─┤ sketch           │
 │ cinta      %QX2.0 ◄──┼── FC4  IR1 ────│ Q0.0 ◄┘ (JWPLC Basic)    │
 └──────────────────────┘ 127.0.0.1:5020 └──────────────────────────┘
```

- JWPLC Sim abre el **puente de E/S** (`app/lib/io-bridge.mjs`) al
  presionar **Ejecutar**: un servidor Modbus TCP en `127.0.0.1:5020` con la
  bornera del JWPLC Basic (mapa completo en `OIP_FUXA.md`).
- OIP se conecta como **cliente** en el modo *The simulator polls the PLC*:
  escribe los sensores en el registro holding 0 y lee los actuadores de los
  input registers.

### Tabla de direcciones

| Señal del Sim | Tag en OIP | Registro Modbus | Sentido |
|---|---|---|---|
| I0.0 … I0.7 | `%IX0.0` … `%IX0.7` | holding 0, bits 0-7 | OIP → Sim (sensores, pulsadores) |
| Q0.0 … Q0.7 | `%QX2.0` … `%QX2.7` | input register 1, bits 0-7 | Sim → OIP (motores, pilotos) |

> **Las salidas van en `%QX2.n`, no en `%QX0.n`.** OIP ubica `%QXb.n` en el
> input register `b div 2`, y el puente publica las salidas en el input
> register 1, así que el byte es 2. Las entradas sí calzan: `%IX0.n` = I0.n.

## 2. Preparar JWPLC Sim

1. Abrir JWPLC Sim (`JWPLC Sim.bat`).
2. **Abrir…** → `tests/projects/oip-cinta/oip-cinta.jwsim`.
3. Presionar **Ejecutar**. La consola debe mostrar:

   ```text
   [jwsim] puente de E/S (Modbus TCP): bornera en 127.0.0.1:5020
   oip_cinta: listo, esperando a OIP en el puente de E/S
   fotocelda: libre -> cinta en marcha
   ```

En un proyecto propio, el puente se configura en el `.jwsim`:

```json
"simulation": {
  "ioBridge": { "present": true, "port": 5020, "listenHost": "127.0.0.1" }
}
```

Las entradas que tienen un cable en la escena las maneja la escena, no
OIP. Para que OIP las maneje, el proyecto va sin escena (como este) o con
esas entradas sin cablear.

## 3. Armar la planta en OIP

1. Abrir Open Industry Project y crear una escena nueva.
2. Colocar desde la biblioteca:
   - **Belt Conveyor** (cinta transportadora);
   - **Box** (caja), sobre la cinta, cerca del extremo donde empieza;
   - **Photo Eye** (fotocelda), al costado de la cinta, a unos dos tercios
     del recorrido, mirando a través de ella;
   - **Push Button** (pulsador de marcha), en cualquier lugar visible.
3. Seleccionar cada pieza y, en el grupo **Comms** del Inspector, escribir
   el tag:

   | Pieza | Campo | Valor |
   |---|---|---|
   | Photo Eye | Presence Tag | `%IX0.0` |
   | Push Button | su tag (BOOL) | `%IX0.1` |
   | Belt Conveyor | Run Tag | `%QX2.0` |

   Los demás campos de la cinta (*Speed Tag*, *Running Tag*) quedan vacíos.

## 4. Conectar OIP al Sim

1. Abrir **Simulation > PLC Controllers…**. Si no se ve el menú: **Ctrl+Shift+P**
   y escribir `PLC Controllers`, o doble clic en el nodo **Controller** del
   panel PLC. Tiene que estar abierta la escena, no la pantalla de proyectos.
2. Configurar:

   | Campo | Valor |
   |---|---|
   | Runs on | **An external PLC** |
   | Modo | **The simulator polls the PLC (the PLC is a Modbus server)** |
   | PLC | `127.0.0.1` |
   | Port | `5020` (OIP trae 502: hay que cambiarlo) |
   | Holding register 0 is %IW | `0` |
   | Input register 0 is %QW | `0` |

3. La lista de abajo debe mostrar un punto por tag:

   ```text
   %IX0.0  holding register 0 bit 0
   %IX0.1  holding register 0 bit 1
   %QX2.0  input register 1 bit 0
   ```

   Si falta uno, esa pieza no tiene el tag escrito.

Estos ajustes se guardan en la PC, no en la escena.

## 5. Probar

1. Con el Sim en **Ejecutar**, presionar **Play** en OIP. La línea de estado
   dice *Polling the PLC at 127.0.0.1:5020*.
2. La cinta lleva la caja; al llegar a la fotocelda, la cinta se detiene y
   queda detenida. En el Sim: `fotocelda: caja detectada -> cinta detenida
   (enclavada)`.
3. Apartar la caja y presionar el pulsador: la cinta arranca. En el Sim:
   `marcha: rearme -> cinta en marcha`.

Con un PLC externo, OIP corre a velocidad real (×1).

### Por qué el sketch enclava la parada

La primera versión era `cinta = NOT fotocelda` y la cinta solo se detenía
un instante. Con un monitor del puente se midió:

```text
 t (s)    I0.0 Q0.0
 75.466    1    1    OIP: la fotocelda ve la caja
 75.481    1    0    el Sim detiene la cinta (15 ms)
 75.642    0    0    la caja sale del haz por inercia
 75.692    0    1    fotocelda libre: la cinta vuelve a arrancar
```

El Sim responde en 15-44 ms; la caja pasa el haz 160-370 ms después de
detenerse la cinta. Por eso el sketch enclava la parada y se rearma con el
pulsador (I0.1), solo con la fotocelda libre. Con OIP, cualquier programa
debe contar con que la carga se sigue moviendo un poco después de parar.

## 6. Verificación sin OIP

```text
node scripts/check-oip-cliente.mjs
```

Compila el sketch de `tests/projects/oip-cinta`, abre el puente y hace las
mismas tramas que OIP (FC16 al holding 0, FC4 al input register 1): marcha,
parada con la caja, la caja sale del haz (sigue parada), rearme con el
pulsador y parada con una caja nueva. Termina en `OIP_CLIENTE=PASS`.

## 7. Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| OIP dice *Waiting for the PLC at 127.0.0.1:5020* | El Sim no está en **Ejecutar**, o el puerto no es 5020. OIP reintenta cada segundo. |
| La cinta corre pero nunca se detiene | La fotocelda no tiene `%IX0.0`. Revisar la lista del diálogo (paso 4.3). |
| La cinta no arranca nunca | La cinta tiene `%QX0.0` en vez de `%QX2.0`, o el sketch quedó enclavado: presionar el pulsador. |
| La cinta para un instante y sigue | Programa sin enclavamiento (ver §5). |
| La cinta empieza detenida tras Stop/Play en OIP | El enclavamiento vive en el Sim y no se entera del Stop de OIP. Presionar el pulsador. |
| El Sim dice `puente de E/S: el puerto 5020 está en uso` | Otro programa usa el 5020 (por ejemplo, OIP en el modo *The PLC polls the simulator*, que también abre el 5020). Usar el modo de esta guía. |
| OIP deja de leer y la cinta se para sola | OIP apaga las salidas si el Sim no responde durante 1 s (Sim pausado o cerrado). |

## 8. Pendiente

- Indicador «OIP conectado / desconectado» en la app del Sim.
- Decidir si el puente publica las salidas también en el input register 0,
  para usar `%QX0.n` en OIP (hoy el input register 0 tiene las entradas y
  lo usa FUXA).
- Etapas 2 y 3 de `PROPUESTA_OIP.md`: puente de escena y exportar la planta.
