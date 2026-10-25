// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba de lazo cerrado con el fermentador emulado (G9): no es el firmware
// del proyecto, solo comprueba que la planta responde como se espera.
//   Calefacción por la temperatura de masa con histéresis (SP 27,0; abre a
//   26,5), bomba de retorno con la válvula y 20 s después para vaciar el
//   serpentín; recirculación de mosto 1 min cada 4 min; fin por pH <= 3,70
//   sostenido 30 s: todo apagado, sirena y baliza.
#include <JW_ModbusRTU.h>

JW_RS485 rs485(Serial2, JWPLC_RS485_RX_PIN, JWPLC_RS485_TX_PIN);
JW_ModbusRTU modbus(rs485);

static float tMasa = NAN, ph = NAN, tMosto = NAN;
static bool calef = false, fin = false;
static uint32_t tLectura = 0, tCalefOff = 0, tPhBajo = 0, t0 = 0, tLog = 0;

void setup()
{
    Serial.begin(115200);
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
    rs485.setAutoDirection();
    modbus.setQueuedTxEnabled(false);
    modbus.begin(247, 9600, SERIAL_8N1);
    t0 = millis();
}

void loop()
{
    const uint32_t now = millis();
    if (now - tLectura >= 1000)
    {
        tLectura = now;
        uint16_t r[2];
        tMasa = modbus.readHoldingRegistersSync(1, 0, 1, r, 200) ? (int16_t)r[0] / 10.0f : NAN;
        if (modbus.readHoldingRegistersSync(2, 0, 2, r, 200))
        {
            ph = r[0] / 100.0f;
            tMosto = (int16_t)r[1] / 10.0f;
        }
    }
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
    const bool retorno = calef || (now - tCalefOff < 20000 && tCalefOff);
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
    delay(5);
}
