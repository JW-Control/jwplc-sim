// Error típico (ejercicio 6): pasa de estrella a triángulo en el mismo ciclo,
// sin la pausa de 100 ms.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
static int paso = 0;
static uint32_t t0 = 0;
void loop()
{
    if (!digitalRead(I0_1)) paso = 0;
    else if (paso == 0 && digitalRead(I0_0)) { paso = 1; t0 = millis(); }
    else if (paso == 1 && millis() - t0 >= 3000) paso = 2;
    digitalWrite(Q0_0, paso != 0);
    digitalWrite(Q0_1, paso == 1);
    digitalWrite(Q0_2, paso == 2);
    digitalWrite(Q0_3, paso != 0);
    delay(1);
}
