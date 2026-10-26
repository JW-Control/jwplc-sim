// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Electroválvula 5/2 biestable con cilindro: un pulso de 100 ms en A+ lo saca
// y uno en A- lo entra; la corredera recuerda la posición entre pulsos.
//   I0_0 B1 cilindro afuera   I0_1 B0 cilindro adentro (fines de carrera)
//   Q0_0 bobina A+            Q0_1 bobina A-
// Tres ciclos completos y se detiene.

static uint32_t pulso = 0, ciclos = 0;
static bool sale = true;

void setup()
{
    Serial.begin(115200);
}

void loop()
{
    const uint32_t now = millis();
    const bool afuera = digitalRead(I0_0);
    const bool adentro = digitalRead(I0_1);

    // Apaga la bobina al terminar el pulso: el cilindro sigue solo.
    if (pulso && now - pulso >= 100)
    {
        digitalWrite(Q0_0, LOW);
        digitalWrite(Q0_1, LOW);
        pulso = 0;
        Serial.printf("%lu ms fin del pulso\n", (unsigned long)now);
    }
    if (pulso || ciclos >= 3 || now < 500) return;

    if (sale && adentro)
    {
        digitalWrite(Q0_0, HIGH);
        pulso = now;
        sale = false;
        Serial.printf("%lu ms pulso A+\n", (unsigned long)now);
    }
    else if (!sale && afuera)
    {
        digitalWrite(Q0_1, HIGH);
        pulso = now;
        sale = true;
        ciclos++;
        Serial.printf("%lu ms pulso A-, ciclo %lu\n", (unsigned long)now, (unsigned long)ciclos);
    }
}
