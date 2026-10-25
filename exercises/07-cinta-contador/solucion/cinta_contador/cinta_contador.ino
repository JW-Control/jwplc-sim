// Ejercicio 7 · Cinta transportadora con contador de lote · solución de referencia (la rúbrica le da 20/20).
//   I0_0  S1, pulsador NA: Marcha / nuevo lote
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   I0_2  B1, sensor inductivo: Pieza al final de la cinta
//   Q0_0  KM1, contactor: Motor de la cinta
//   Q0_1  H1, piloto azul: Lote completo
#include <Arduino.h>

static bool marcha = false;
static bool lote = false;
static bool antes = false;
static int piezas = 0;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool pMarcha = digitalRead(I0_0);
    const bool parada = !digitalRead(I0_1);
    const bool pieza = digitalRead(I0_2);
    if (parada) marcha = false;
    else if (pMarcha && !marcha)
    {
        marcha = true;
        if (lote)
        {
            lote = false;
            piezas = 0;
        }
    }
    if (pieza && !antes && marcha && ++piezas >= 3)
    {
        marcha = false;
        lote = true;
    }
    antes = pieza;
    digitalWrite(Q0_0, marcha);
    digitalWrite(Q0_1, lote);
    delay(1);
}
