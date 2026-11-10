// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Módulo de E/S remotas Modbus RTU (jwsim/remote-io) desde el JWPLC Basic.
// El módulo va en el RS-485 de la placa (A con A, B con B), dirección 3,
// 9600 8N1. Mapa del módulo:
//   bobinas 0-7            = salidas DO1-DO8   (FC01 leer, FC05 una, FC15 varias)
//   entradas discretas 0-7 = entradas DI1-DI8  (FC02)
// Los bits van empaquetados: el bit 0 es DI1 (o DO1), el bit 7 es DI8 (DO8).
//
// Este ejemplo usa la API Sync de JWPLC_ModbusRTU (bloquea hasta la
// respuesta), la más simple para empezar. Para no detener el loop, la API
// cooperativa hace lo mismo con requestReadDiscreteInputs(),
// requestWriteMultipleCoils(), task() y masterDone() (ver el ejemplo
// 02.ModbusRTU_Master_Read de la librería).

static constexpr uint8_t IO_ID = 3;  // dirección Modbus del módulo

void setup()
{
    Serial.begin(115200);
    delay(300);
    // 247 es el ID local del maestro; el destino real va en cada petición.
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1))
    {
        Serial.print("Modbus begin failed: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
        return;
    }
    // FC05: una sola salida. DO8 es la bobina 7.
    if (JWPLC_ModbusRTU.writeSingleCoilSync(IO_ID, 7, true))
        Serial.println("DO8 encendida (FC05)");
}

void loop()
{
    uint8_t di = 0;  // DI1..DI8
    // FC02: leer las 8 entradas.
    if (JWPLC_ModbusRTU.readDiscreteInputsSync(IO_ID, 0, 8, &di))
    {
        // Lógica de ejemplo: cada entrada enciende su salida; DO8 queda encendida.
        uint8_t salidas = di | 0x80;
        // FC15: escribir las 8 salidas de una vez.
        JWPLC_ModbusRTU.writeMultipleCoilsSync(IO_ID, 0, 8, &salidas);
        // FC01: leer de vuelta el estado de las salidas.
        uint8_t leidas = 0;
        JWPLC_ModbusRTU.readCoilsSync(IO_ID, 0, 8, &leidas);
        Serial.printf("DI=%02X DO=%02X\n", di, leidas);
    }
    else
    {
        Serial.print("Sin respuesta del modulo: ");
        Serial.println(JWPLC_ModbusRTU.lastErrorString());
    }
    delay(500);
}
