// Ejercicio 4 · Llenado de tanque por niveles (ver ENUNCIADO.md)
//   I0_0  B1, interruptor de nivel bajo: Cerrado: hay agua a la altura de B1
//   I0_1  B2, interruptor de nivel alto: Cerrado: tanque lleno
//   Q0_0  KM1, contactor: Bomba M1 (230 VAC)
//   Q0_1  H1, piloto rojo: Tanque bajo
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
