// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G2_LOCAL_COMPILE: funciones usadas antes de su definición y desde
// otra pestaña; compila solo con prototipos automáticos (como arduino-cli).
void setup()
{
  Serial.begin(115200);
  Serial.printf("doble=%d\n", doble(21));
}

void loop()
{
  digitalWrite(Q0_0, invertida(digitalRead(I0_0)));
  delay(5);
}

static int doble(int v) { return 2 * v; }
