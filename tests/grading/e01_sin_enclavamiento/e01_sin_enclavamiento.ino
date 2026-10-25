// Error típico (ejercicio 1): sin enclavamiento, el motor solo anda mientras se pulsa marcha.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
void loop()
{
    const bool m = digitalRead(I0_0) && digitalRead(I0_1);
    digitalWrite(Q0_0, m);
    digitalWrite(Q0_1, m);
    delay(1);
}
