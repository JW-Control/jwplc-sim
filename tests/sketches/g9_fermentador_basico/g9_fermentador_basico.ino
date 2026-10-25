// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba de lazo cerrado con el fermentador emulado (G9): no es el firmware
// del proyecto, solo comprueba que la planta responde como se espera.
//   Calefacción por la temperatura de masa con histéresis (SP 27,0; abre a
//   26,5), bomba de retorno con la válvula y 20 s después para vaciar el
//   serpentín; recirculación de mosto 1 min cada 4 min; fin por pH <= 3,70
//   sostenido 30 s: todo apagado, sirena y baliza.
// Como en los ejemplos del package: E/S y maestro JWPLC_ModbusRTU ya vienen
// configurados; solo se arranca el bus a 9600 8N1.

static float tMasa = NAN, ph = NAN, tMosto = NAN;
static bool calef = false, fin = false;
static uint16_t regs[2];
static uint8_t sensor = 0;  // 0 = PT100 (dirección 1), 1 = pH (dirección 2)
static uint32_t proximaLectura = 0, tCalefOff = 0, tPhBajo = 0, t0 = 0, tLog = 0;

// Lee los dos transmisores uno tras otro, una vez por segundo, sin bloquear.
static void leerSensores(uint32_t now)
{
    JWPLC_ModbusRTU.task();
    if (JWPLC_ModbusRTU.masterDone())
    {
        const bool ok = JWPLC_ModbusRTU.masterSucceeded();
        if (sensor == 0) tMasa = ok ? (int16_t)regs[0] / 10.0f : NAN;
        else if (ok)
        {
            ph = regs[0] / 100.0f;
            tMosto = (int16_t)regs[1] / 10.0f;
        }
        JWPLC_ModbusRTU.clearMasterResult();
        sensor ^= 1;
        if (sensor == 0) proximaLectura = now + 1000;
    }
    if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && (int32_t)(now - proximaLectura) >= 0)
    {
        if (sensor == 0) JWPLC_ModbusRTU.requestReadHoldingRegisters(1, 0, 1, regs, 200);
        else JWPLC_ModbusRTU.requestReadHoldingRegisters(2, 0, 2, regs, 200);
    }
}

void setup()
{
    Serial.begin(115200);
    JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1);
    t0 = millis();
}

void loop()
{
    const uint32_t now = millis();
    leerSensores(now);

    if (!fin)
    {
        if (!isnan(tMasa) && tMasa <= 26.5f) calef = true;
        else if (isnan(tMasa) || tMasa >= 27.0f) calef = false;
        if (!isnan(ph) && ph <= 3.70f)
        {
            if (!tPhBajo) tPhBajo = now;
            else if (now - tPhBajo >= 30000)
            {
                fin = true;
                calef = false;
                Serial.printf("%lu ms FIN pH=%.2f T=%.1f\n", (unsigned long)now, ph, tMasa);
            }
        }
        else tPhBajo = 0;
    }
    if (calef) tCalefOff = now;
    const bool retorno = calef || (tCalefOff && now - tCalefOff < 20000);
    const bool mosto = !fin && ((now - t0) % 240000) < 60000;
    digitalWrite(Q0_0, calef);
    digitalWrite(Q0_1, retorno);
    digitalWrite(Q0_2, mosto);
    digitalWrite(Q0_3, fin);
    digitalWrite(Q0_4, fin);

    if (now - tLog >= 60000)
    {
        tLog = now;
        Serial.printf("%lu ms T=%.1f Tm=%.1f pH=%.2f calef=%d flujo=%d\n", (unsigned long)now, tMasa, tMosto, ph, calef, digitalRead(I0_0));
    }
}
