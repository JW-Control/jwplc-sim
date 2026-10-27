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

**a) La bornera (este puente).** Dispositivo **ModbusTCP**, IP
`127.0.0.1`, puerto `5020`, unidad 1. Tags:

- pulsadores del HMI → **Coil** 0-7 (I0.0-I0.7);
- pilotos del HMI → **Discrete Input** 0-7 (Q0.0-Q0.7);
- o, en un solo tag cada uno, **Holding Register** 0 (entradas) y 1
  (salidas) como bits.

FUXA puede numerar desde 1 según la versión (Coil 1 = dirección 0); si un
piloto queda corrido en uno, corregir el desplazamiento.

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
La prueba con OIP y FUXA reales se hace en taller y se registra en
`docs/reports/`.
