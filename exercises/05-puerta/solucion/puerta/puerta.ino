// Ejercicio 5 · Portón automático · solución de referencia (la rúbrica le da 20/20).
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

enum Estado { QUIETO, ABRE, CIERRA };
static Estado estado = QUIETO;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool abrir = digitalRead(I0_0);
    const bool cerrar = digitalRead(I0_1);
    const bool parada = !digitalRead(I0_2);
    const bool abierto = digitalRead(I0_3);
    const bool cerrado = digitalRead(I0_4);
    const bool obstaculo = digitalRead(I0_5);
    if (parada) estado = QUIETO;
    else switch (estado)
    {
    case QUIETO:
        if (abrir && !abierto) estado = ABRE;
        else if (cerrar && !cerrado && !obstaculo) estado = CIERRA;
        break;
    case ABRE:
        if (abierto) estado = QUIETO;
        break;
    case CIERRA:
        if (cerrado) estado = QUIETO;
        else if (obstaculo) estado = ABRE;
        break;
    }
    digitalWrite(Q0_0, estado == ABRE);
    digitalWrite(Q0_1, estado == CIERRA);
    digitalWrite(Q0_2, estado != QUIETO);
    delay(1);
}
