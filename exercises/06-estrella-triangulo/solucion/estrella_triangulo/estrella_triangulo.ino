// Ejercicio 6 · Arranque estrella-triángulo · solución de referencia (la rúbrica le da 20/20).
//   I0_0  S1, pulsador NA: Marcha
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  KM1, contactor: Línea
//   Q0_1  KM2, contactor: Estrella
//   Q0_2  KM3, contactor: Triángulo
//   Q0_3  H1, piloto verde: En marcha
#include <Arduino.h>

enum Paso { PARADO, ESTRELLA, PAUSA, TRIANGULO };
static Paso paso = PARADO;
static uint32_t t0 = 0;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool marcha = digitalRead(I0_0);
    const bool parada = !digitalRead(I0_1);
    if (parada) paso = PARADO;
    else if (paso == PARADO && marcha)
    {
        paso = ESTRELLA;
        t0 = millis();
    }
    else if (paso == ESTRELLA && millis() - t0 >= 3000)
    {
        paso = PAUSA;
        t0 = millis();
    }
    else if (paso == PAUSA && millis() - t0 >= 100) paso = TRIANGULO;
    digitalWrite(Q0_0, paso != PARADO);
    digitalWrite(Q0_1, paso == ESTRELLA);
    digitalWrite(Q0_2, paso == TRIANGULO);
    digitalWrite(Q0_3, paso != PARADO);
    delay(1);
}
