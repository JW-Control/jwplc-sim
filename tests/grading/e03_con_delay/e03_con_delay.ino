// Error típico (ejercicio 3): el ciclo con delay() bloquea el programa y la
// parada no se atiende a tiempo.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
void loop()
{
    if (!digitalRead(I0_0)) return;
    for (;;)
    {
        digitalWrite(Q0_2, 1); delay(4000); digitalWrite(Q0_2, 0);
        digitalWrite(Q0_1, 1); delay(1000); digitalWrite(Q0_1, 0);
        digitalWrite(Q0_0, 1); delay(4000); digitalWrite(Q0_0, 0);
        if (!digitalRead(I0_1)) break;
    }
}
