// Ejercicio 9 con un error típico: la bomba sigue solo a B2 (sin histeresis),
// así arranca apenas el agua baja de B2 en vez de esperar a B1.
#include <Arduino.h>

void setup()
{
}

void loop()
{
    const bool bajo = digitalRead(I0_0);
    const bool lleno = digitalRead(I0_1);
    const bool habilitado = digitalRead(I0_2);
    digitalWrite(Q0_0, habilitado && !lleno);
    digitalWrite(Q0_1, habilitado);
    digitalWrite(Q0_2, !bajo);
    delay(1);
}
