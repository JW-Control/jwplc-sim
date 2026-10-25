// Error típico (ejercicio 7): cuenta el nivel del sensor en cada ciclo en vez
// del flanco: una pieza quieta suma muchas veces.
#include <Arduino.h>
void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}
static bool marcha = false, lote = false;
static int n = 0;
void loop()
{
    if (!digitalRead(I0_1)) marcha = false;
    else if (digitalRead(I0_0) && !marcha) { marcha = true; if (lote) { lote = false; n = 0; } }
    if (digitalRead(I0_2) && marcha && ++n >= 3) { marcha = false; lote = true; }
    digitalWrite(Q0_0, marcha);
    digitalWrite(Q0_1, lote);
    delay(1);
}
