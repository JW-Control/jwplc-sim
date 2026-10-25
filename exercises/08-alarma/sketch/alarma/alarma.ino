// Ejercicio 8 · Alarma con reconocimiento (ver ENUNCIADO.md)
//   I0_0  B1, presostato (interruptor NA): Cerrado: presión alta (alarma)
//   I0_1  S1, pulsador NA: Reconocer
//   Q0_0  HA1, zumbador: Bocina
//   Q0_1  H1, piloto rojo: Alarma
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
