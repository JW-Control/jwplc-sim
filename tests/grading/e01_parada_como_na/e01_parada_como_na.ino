// Error típico (ejercicio 1): la parada se programa como si fuera NA
// (1 = pulsada). Con un pulsador NC eso deja el motor siempre parado.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
static bool marcha = false;
void loop()
{
    if (digitalRead(I0_1)) marcha = false;
    else if (digitalRead(I0_0)) marcha = true;
    digitalWrite(Q0_0, marcha);
    digitalWrite(Q0_1, marcha);
    delay(1);
}
