// Curso JWPLC Basic · Lección 47 · El JWPLC servidor Modbus TCP: la PC mira y manda
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// La máquina: una banda que cuenta cajas. El sensor B1 (I0.0) ve pasar cada
// caja y el contactor KM1 (Q0.0) mueve la banda. Desde la oficina, una PC
// con JW Modbus Tool se conecta al JWPLC por la red y:
//   lee   holding 40001   cajas contadas
//   lee   holding 40002   banda en marcha (1) o parada (0)
//   manda bobina  00001   marcha de la banda (1 = marcha)
//
// El JWPLC es el SERVIDOR: abre el puerto 502 y responde a quien pregunte.
// Las tablas son variables del programa; la librería las presta a la red.

#include <JWPLC_ModbusTCP.h>

uint8_t bobinas[1];           // bobinas 00001..00008, un bit cada una
uint16_t holding[8];          // holding 40001..40008

uint16_t cajas = 0;
bool sensorAntes = false;
bool bandaAntes = false;

void setup()
{
    Serial.begin(115200);
    JWPLC_ModbusTCP.setCoils(bobinas, 8);
    JWPLC_ModbusTCP.setHoldingRegisters(holding, 8);
    if (!JWPLC_ModbusTCP.beginServer(1, 502))
        Serial.println("No arranca el servidor Modbus TCP");
    Serial.println("Lección 47: servidor Modbus TCP, cajas en 40001, marcha en la bobina 00001");
}

void loop()
{
    // ---- Práctica: la meta la escribe la PC en 40003. Al llegar, la banda
    //      para sola: el programa apaga la bobina 00001.
    uint16_t meta = holding[2];
    if (meta > 0 && cajas >= meta && (bobinas[0] & 0b00000001) != 0)
    {
        bobinas[0] = bobinas[0] & 0b11111110;
        Serial.printf("Meta cumplida: %u cajas\n", cajas);
    }

    // ---- Lo que manda la PC: la bobina 00001 (bit 0).
    bool banda = (bobinas[0] & 0b00000001) != 0;
    if (banda != bandaAntes)
        Serial.println(banda ? "Banda en marcha (desde la PC)" : "Banda parada (desde la PC)");
    bandaAntes = banda;

    // ---- Contar cajas: flanco de subida del sensor (lección 07).
    bool sensor = digitalRead(I0_0);
    if (sensor && !sensorAntes)
    {
        cajas = cajas + 1;
        Serial.printf("Caja %u\n", cajas);
    }
    sensorAntes = sensor;

    // ---- Lo que lee la PC.
    holding[0] = cajas;
    holding[1] = banda ? 1 : 0;

    digitalWrite(Q0_0, banda);
}
