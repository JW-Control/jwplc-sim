# G8: prueba del puente de E/S con FUXA real

```text
Fecha: 2026-10-27
FUXA: @frangoteam/fuxa 1.3.5 con el plugin modbus-serial 8.0.19 (Linux, Node 22)
Simulador: puente de E/S en 127.0.0.1:5020, sketch tests/sketches/g8_io_bridge (Q0_k = I0_k), velocidad real
Script: node scripts/check-fuxa-real.mjs --fuxa <carpeta de @frangoteam/fuxa>

JWSIM_G8_FUXA_REAL=PASS   (C4 de JWSIM_G8_OIP_FUXA, parte FUXA)
```

El script levanta un servidor FUXA con una carpeta de datos descartable
(`--userDir`) y le crea, por su API REST (`/api/projectData`, `set-device`), lo
mismo que se arma en el editor: un dispositivo **ModbusTCP**
`127.0.0.1:5020`, unidad 1, polling 200 ms, con tags de bobinas, entradas
discretas y registros holding. Después escribe y lee por las tags de FUXA
(`/api/setTagValue`, `/api/getTagValue`).

| Criterio | Qué se hizo | Resultado |
|---|---|---|
| COILS | pulsadores en Coil 1 y 4 (I0.0, I0.3) → pilotos en Digital Input 1 y 4 (Q0.0, Q0.3) se encienden; Coil 17 (Q0.0) también; al soltar, Q0.0 se apaga | PASS |
| REGISTROS | Holding 1 = 165 (10100101b, las entradas) → Holding 2 (salidas) = 165; a 0 vuelve a 0 | PASS |

## Hallazgos

1. **FUXA numera desde 1.** La dirección 1 del editor es la 0 del mapa
   (`offset = address − 1` en su driver Modbus). La guía lo indicaba como
   posible; queda confirmado y la tabla de la guía usa la numeración de FUXA.
2. **FUXA agrupa las tags vecinas en un solo pedido.** Con las bobinas 1 y 17
   pide las bobinas 0 a 16 de una vez. El hueco 8-15 del mapa respondía con la
   excepción 02 y FUXA perdía toda la lectura (la Coil 17 no llegaba). El puente
   ahora lee ese hueco como 0; escribirlo sigue dando 02. El gate
   `scripts/gate-g8-io-bridge.mjs` comprueba la lectura del bloque 0-23 en un
   solo pedido.
3. **El driver Modbus es un plugin.** Sin `modbus-serial` (pantalla
   *Plugins* de FUXA) el dispositivo no carga y las tags no existen.

Falta la parte de Open Industry Project, que necesita Godot con pantalla:
se prueba en taller con la guía `docs/integration/OIP_FUXA.md`.
