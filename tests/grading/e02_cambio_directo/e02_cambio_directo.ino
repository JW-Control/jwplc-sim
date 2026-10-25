// Error típico (ejercicio 2): cambia de sentido sin pasar por parada y sin
// enclavamiento entre KM1 y KM2.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
static int s = 0;
void loop()
{
    if (!digitalRead(I0_2)) s = 0;
    else if (digitalRead(I0_0)) s = 1;
    else if (digitalRead(I0_1)) s = -1;
    digitalWrite(Q0_0, s == 1 || (digitalRead(I0_0) && digitalRead(I0_1)));
    digitalWrite(Q0_1, s == -1 || (digitalRead(I0_0) && digitalRead(I0_1)));
    digitalWrite(Q0_2, s != 0);
    delay(1);
}
