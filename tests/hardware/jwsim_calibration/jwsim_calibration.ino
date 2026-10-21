// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Calibración del modelo de costos de JWPLC Sim (gate G1 PACKAGE_EXAMPLES_IO).
//
// Cargar en un JWPLC Basic REAL y en el simulador con el mismo package.
// Cada 5 s imprime una línea "JWSIM_CAL ..." con el profiler H3E.0B del core
// y microbenchmarks de E/S. scripts/calibrate.mjs compara ambas salidas.
//
// Fases (cambian solas cada 20 s, sin cablear nada):
//   A: loop() vacío
//   B: 02_io_basic (digitalWrite(Q0_0, digitalRead(I0_0)))
//   C: start/stop de 8 E/S sin delay (igual que tests/sketches/start_stop_8io)
#include <Arduino.h>
#include <jwplc_h3e0b_profile.h>

extern "C" bool jwplcH3E0BProfilerEnabled(void) { return true; }

static uint32_t g_loops = 0;
static uint32_t g_windowStartMs = 0;
static uint8_t g_phase = 0;
static uint32_t g_phaseStartMs = 0;

static void printStage(const char *name, const JWPLCH3E0BStageStats &s)
{
    Serial.printf(" %s_calls=%lu %s_avg_us=%.3f %s_max_us=%lu", name, (unsigned long)s.calls, name,
                  s.calls ? (double)s.total_us / s.calls : 0.0, name, (unsigned long)s.max_us);
}

static void microbench()
{
    const uint32_t N = 2000;
    uint32_t t0 = micros();
    volatile int acc = 0;
    for (uint32_t i = 0; i < N; i++) acc += digitalRead(I0_0);
    const uint32_t tRead = micros() - t0;

    t0 = micros();
    for (uint32_t i = 0; i < N; i++) digitalWrite(Q0_7, LOW);   // mismo valor: camino del shadow
    const uint32_t tWriteSame = micros() - t0;

    t0 = micros();
    for (uint32_t i = 0; i < N; i++) (void)millis();
    const uint32_t tMillis = micros() - t0;

    t0 = micros();
    for (uint32_t i = 0; i < 200; i++) digitalWrite(Q0_7, (i & 1) ? HIGH : LOW);   // cambia: I2C
    const uint32_t tWriteToggle = micros() - t0;
    digitalWrite(Q0_7, LOW);

    Serial.printf("JWSIM_CAL bench di_read_ns=%.1f do_write_same_ns=%.1f millis_ns=%.1f do_write_i2c_us=%.2f\n",
                  tRead * 1000.0 / N, tWriteSame * 1000.0 / N, tMillis * 1000.0 / N, tWriteToggle / 200.0);
    (void)acc;
}

void setup()
{
    Serial.begin(115200);
    delay(500);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    Serial.println("JWSIM_CAL start");
    microbench();
    jwplcH3E0BReset();
    g_windowStartMs = g_phaseStartMs = millis();
}

void loop()
{
    g_loops++;

    if (g_phase == 1)
    {
        digitalWrite(Q0_0, digitalRead(I0_0));
    }
    else if (g_phase == 2)
    {
        static bool motor = false;
        static uint32_t arranque = 0;
        const bool marcha = digitalRead(I0_0);
        const bool parada = !digitalRead(I0_1);
        const bool termico = !digitalRead(I0_2);
        if (parada || termico) motor = false;
        else if (marcha && !motor)
        {
            motor = true;
            arranque = millis();
        }
        const bool arrancando = motor && (millis() - arranque) < 3000;
        digitalWrite(Q0_0, motor);
        digitalWrite(Q0_1, arrancando ? ((millis() / 500) % 2) : motor);
        digitalWrite(Q0_2, termico);
        for (uint8_t i = 3; i < 8; i++) digitalWrite(Q0_X[i], digitalRead(I0_X[i]));
    }

    const uint32_t now = millis();
    if (now - g_windowStartMs >= 5000)
    {
        JWPLCH3E0BStats st;
        jwplcH3E0BSnapshot(&st);
        Serial.printf("JWSIM_CAL phase=%c window_ms=%lu loops=%lu loop_us=%.3f",
                      'A' + g_phase, (unsigned long)(now - g_windowStartMs), (unsigned long)g_loops,
                      g_loops ? (now - g_windowStartMs) * 1000.0 / g_loops : 0.0);
        printStage("system_io", st.system_io);
        printStage("system_active", st.system_active);
        printStage("system_display", st.system_display);
        printStage("system_ethernet", st.system_ethernet);
        printStage("task_yield", st.task_yield);
        printStage("tcp_pre", st.tcp_pre);
        printStage("outside_total", st.outside_total);
        Serial.println();
        g_loops = 0;
        g_windowStartMs = now;
        jwplcH3E0BReset();
        if (now - g_phaseStartMs >= 20000 && g_phase < 2)
        {
            g_phase++;
            g_phaseStartMs = now;
        }
    }
}
