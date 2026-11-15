// Ejercicio 9 · Nivel de una tolva con descarga por gravedad · solución de referencia (la rúbrica le da 20/20).
//   I0_0  B1, sensor capacitivo al 30 %: detecta agua a la altura de B1
//   I0_1  B2, sensor capacitivo al 80 %: tolva llena
//   I0_2  S1, selector «Habilitar»: en I, proceso habilitado
//   Q0_0  KM1, contactor: bomba M1 (230 VAC)
//   Q0_1  Y1, electroválvula de descarga
//   Q0_2  H1, piloto rojo: nivel bajo
#include <Arduino.h>

static bool bomba = false;

void setup()
{
}

void loop()
{
    const bool bajo = digitalRead(I0_0);       // agua a la altura de B1
    const bool lleno = digitalRead(I0_1);      // agua a la altura de B2
    const bool habilitado = digitalRead(I0_2);
    if (!habilitado) bomba = false;
    else if (!bajo) bomba = true;
    else if (lleno) bomba = false;
    digitalWrite(Q0_0, bomba);
    digitalWrite(Q0_1, habilitado);
    digitalWrite(Q0_2, !bajo);
    delay(1);
}
