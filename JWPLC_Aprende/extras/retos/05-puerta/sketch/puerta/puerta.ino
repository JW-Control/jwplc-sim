// Ejercicio 5 · Portón automático (ver ENUNCIADO.md)
//   I0_0  S1, pulsador NA: Abrir
//   I0_1  S2, pulsador NA: Cerrar
//   I0_2  S0, pulsador NC: Parada (1 = sin pulsar)
//   I0_3  B1, final de carrera NA: Portón abierto
//   I0_4  B2, final de carrera NA: Portón cerrado
//   I0_5  B3, sensor fotoeléctrico: Obstáculo en el paso
//   Q0_0  KM1, contactor: Motor: abrir
//   Q0_1  KM2, contactor: Motor: cerrar
//   Q0_2  H1, piloto amarillo: Baliza de movimiento
#include <Arduino.h>

void setup()
{
    // Las entradas y salidas del JWPLC ya vienen configuradas: no hace falta pinMode.
}

void loop()
{
    // Escriba aquí su programa.
}
