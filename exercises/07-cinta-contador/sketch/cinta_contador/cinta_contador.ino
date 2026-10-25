// Ejercicio 7 · Cinta transportadora con contador de lote (ver ENUNCIADO.md)
//   I0_0  S1, pulsador NA: Marcha / nuevo lote
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   I0_2  B1, sensor inductivo: Pieza al final de la cinta
//   Q0_0  KM1, contactor: Motor de la cinta
//   Q0_1  H1, piloto azul: Lote completo
#include <Arduino.h>

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    // Escriba aquí su programa.
}
