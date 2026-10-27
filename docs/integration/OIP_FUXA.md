# Planta 3D (Open Industry Project) y HMI (FUXA) con JWPLC Sim

JWPLC Sim publica la bornera del JWPLC Basic simulado como un **esclavo
Modbus TCP** (puente de E/S, `app/lib/io-bridge.mjs`). Una planta 3D o un
SCADA conectado a ese puerto maneja las entradas y lee las salidas como si
estuviera cableado a la placa. El sketch no cambia: lee `I0_x` y escribe
`Q0_x` como siempre.

Gate: `JWSIM_G8_OIP_FUXA` (`node scripts/gate-g8-io-bridge.mjs`).

## 1. El puente

Se abre al presionar **Ejecutar**, en `127.0.0.1:5020`; la consola lo
confirma: `[jwsim] puente de E/S (Modbus TCP): bornera en 127.0.0.1:5020`.
Se configura en el proyecto `.jwsim`:

```json
"simulation": {
  "ioBridge": { "port": 5020, "listenHost": "127.0.0.1" }
}
```

`"listenHost": "0.0.0.0"` lo publica en la red local (otra PC con OIP o
FUXA); `"present": false` lo quita. Al reproducir una grabación no se abre.

### Mapa Modbus (cualquier unidad; direcciones desde 0)

| Tabla | Direcciones | Contenido | Acceso |
|---|---|---|---|
| Bobinas (FC01, FC05, FC15) | 0-7 | I0.0-I0.7 (sensores, pulsadores) | lectura y escritura |
| Bobinas (FC01) | 8-15 | reservadas: se leen como 0 | solo lectura |
| Bobinas (FC01) | 16-23 | Q0.0-Q0.7 (salidas a relé) | solo lectura |
| Entradas discretas (FC02) | 0-7 | Q0.0-Q0.7 (actuadores) | solo lectura |
| Entradas discretas (FC02) | 8-15 | I0.0-I0.7 | solo lectura |
| Holding (FC03, FC06, FC16) e input (FC04) | 0 | I0.7…I0.0 como bits (bit 0 = I0.0) | escritura solo en holding |
| Holding (FC03) e input (FC04) | 1 | Q0.7…Q0.0 como bits | solo lectura |

Fuera del mapa responde la excepción 02; una función no admitida, la 01.

**Con escena (G7):** las entradas que tienen un cable en la escena las
maneja la escena; el puente no las escribe (las lee igual). Las demás
quedan libres para la planta.

## 2. Open Industry Project (planta 3D)

OIP se conecta a un PLC por Modbus TCP a través de libplctag (además de
OPC UA y EtherNet/IP). En el panel **Comms**:

1. Protocolo **Modbus TCP**, gateway `127.0.0.1:5020` (o la IP de la PC con
   JWPLC Sim si OIP corre en otra).
2. En cada pieza, el tag con la nomenclatura de libplctag para Modbus:
   - sensores (fotocelda, final de carrera): bobina de la entrada,
     `co0` … `co7` (I0.0 … I0.7);
   - actuadores (cinta, cilindro, desviador): entrada discreta de la
     salida, `di0` … `di7` (Q0.0 … Q0.7), o la bobina `co16` … `co23`.
3. Ejecutar en JWPLC Sim y luego **Play** en OIP.

Ejemplo: cinta transportadora con una fotocelda al final. La fotocelda
escribe `co0` (I0.0) y la cinta lee `di0` (Q0.0); con el sketch
«marcha mientras no haya caja» la cinta se detiene al llegar la caja.

> La interfaz de OIP cambia entre versiones: los nombres del panel y de
> los campos pueden diferir. La nomenclatura de los tags (`co`, `di`, `hr`,
> `ir` seguidos de la dirección) es la de libplctag.

## 3. FUXA (HMI/SCADA web)

FUXA es un cliente Modbus TCP. Dos usos:

**a) La bornera (este puente).** Dispositivo **ModbusTCP**, dirección
`127.0.0.1:5020`, unidad (slave id) 1. FUXA necesita su plugin Modbus
(`modbus-serial`, en *Plugins*); sin él el dispositivo no carga.

FUXA numera las direcciones **desde 1** (probado con FUXA 1.3.5): la
dirección 1 del editor es la 0 del mapa. Tags:

| Uso en el HMI | Tipo en FUXA | Dirección en FUXA | Señal |
|---|---|---|---|
| pulsadores | Coil Status, Bool | 1-8 | I0.0-I0.7 |
| pilotos | Digital Inputs, Bool | 1-8 | Q0.0-Q0.7 |
| pilotos (otra forma) | Coil Status, Bool | 17-24 | Q0.0-Q0.7 |
| todas las entradas | Holding Register, UInt16 | 1 | I0.7…I0.0 como bits |
| todas las salidas | Holding Register, UInt16 | 2 | Q0.7…Q0.0 como bits |

FUXA agrupa en un solo pedido las tags vecinas de una misma tabla (por
ejemplo, bobinas 1 a 17). Por eso el hueco de bobinas 8-15 del mapa se lee
como 0 y no da excepción.

**b) El Modbus TCP del propio sketch.** Si el sketch usa
`JWPLC_ModbusTCP` como servidor (ejemplo `01.ModbusTCP_Server`), su puerto
502 aparece en el host como `127.0.0.1:1502` (P + 1000; ver
ARCHITECTURE §7.4). FUXA se conecta ahí y ve los registros que publica el
programa, igual que con la placa real en la red.

## 4. Verificación

`node scripts/gate-g8-io-bridge.mjs` corre el sketch
`tests/sketches/g8_io_bridge` (Q0_k = I0_k) con el puente y un cliente que
hace las mismas operaciones que OIP (bobinas y entradas discretas) y FUXA
(registros): mapa completo, excepciones, que no pise las entradas de la
escena y la latencia de la entrada a la salida a velocidad real (≤ 100 ms).
Con FUXA real: `node scripts/check-fuxa-real.mjs --fuxa <carpeta de
@frangoteam/fuxa>` levanta un servidor FUXA, le crea el dispositivo y las
tags por su API REST (como el editor) y comprueba pulsadores, pilotos y
registros contra el sketch (informe en `docs/reports/G8_FUXA_REAL.md`). La
prueba con Open Industry Project (Godot, con pantalla) se hace en taller.
