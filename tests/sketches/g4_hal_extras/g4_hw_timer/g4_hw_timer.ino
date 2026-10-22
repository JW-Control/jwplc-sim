// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_HAL_EXTRAS: temporizadores de hardware (timerBegin... de
// esp32-hal-timer.c del core, sobre el driver GPTimer simulado). Imprime
// "[PASS]"/"[FAIL]" por caso y al final "HW_TIMER: P PASS, F FAIL".
int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

volatile uint32_t ticks = 0;
volatile uint64_t lastAt = 0;
volatile bool inIsr = false;
volatile int withArg = 0;
volatile uint32_t onceRuns = 0;

void ARDUINO_ISR_ATTR onTick() {
  ticks++;
  lastAt = esp_timer_get_time();
  inIsr = xPortInIsrContext();
}
void ARDUINO_ISR_ATTR onArg(void *arg) { withArg += *static_cast<int *>(arg); }
void ARDUINO_ISR_ATTR onOnce() { onceRuns++; }

void setup() {
  Serial.begin(115200);

  hw_timer_t *t = timerBegin(1000000);
  check(t != nullptr, "timerBegin a 1 MHz");
  check(timerGetFrequency(t) == 1000000, "timerGetFrequency");
  const uint64_t r0 = timerRead(t);
  delayMicroseconds(250);
  const uint64_t r1 = timerRead(t);
  check(r1 - r0 >= 250 && r1 - r0 <= 260, "la cuenta avanza 1 por microsegundo");

  // Alarma periódica de 1 ms desde la cuenta 0.
  timerAttachInterrupt(t, &onTick);
  timerWrite(t, 0);
  const int64_t a0 = esp_timer_get_time();
  timerAlarm(t, 1000, true, 0);
  delay(100);
  check(ticks >= 99 && ticks <= 100, "alarma de 1 ms: 100 interrupciones en 100 ms");
  check(inIsr, "el callback corre en contexto de interrupción");
  check((lastAt - a0) % 1000 == 0, "interrupciones en múltiplos exactos de 1 ms");

  // Parar congela la cuenta; arrancar la reanuda desde ahí.
  timerStop(t);
  const uint32_t stoppedTicks = ticks;
  const uint64_t c0 = timerRead(t);
  delay(20);
  check(timerRead(t) == c0 && ticks == stoppedTicks, "timerStop congela la cuenta y las alarmas");
  timerStart(t);
  delay(5);
  check(ticks > stoppedTicks, "timerStart reanuda las alarmas");

  // Sin alarma (que recarga la cuenta a 0 cada 1 ms) la cuenta sigue.
  timerDetachInterrupt(t);
  const uint32_t detached = ticks;
  delay(5);
  check(ticks == detached, "timerDetachInterrupt quita la alarma");
  // timerRestart vuelve la cuenta a 0; lectura en unidades.
  timerRestart(t);
  delay(3);
  const uint64_t ms = timerReadMillis(t);
  Serial.printf("timerReadMillis = %llu\n", ms);
  // vTaskDelay(3) espera entre 2 y 3 ms según dónde cae dentro del tick.
  check(ms == 2 || ms == 3, "timerRestart + timerReadMillis");
  check(timerReadMicros(t) == timerRead(t), "timerReadMicros a 1 MHz");
  timerEnd(t);

  // Sin recarga: una sola alarma.
  hw_timer_t *o = timerBegin(10000);   // 10 kHz: divisor 8000
  check(timerGetFrequency(o) == 10000, "timerBegin a 10 kHz");
  timerAttachInterrupt(o, &onOnce);
  timerAlarm(o, 50, false, 0);   // 5 ms
  delay(20);
  check(onceRuns == 1, "alarma sin recarga: una sola interrupción");

  // Callback con argumento y valor de recarga.
  static int inc = 3;
  hw_timer_t *g = timerBegin(1000000);
  timerAttachInterruptArg(g, &onArg, &inc);
  timerWrite(g, 0);
  timerAlarm(g, 2000, true, 1000);   // primera a 2 ms, luego cada 1 ms
  delay(10);
  timerEnd(g);
  check(withArg >= 24 && withArg <= 27, "callback con argumento y recarga a 1000");

  // El ESP32 tiene 4 temporizadores de propósito general.
  hw_timer_t *all[4] = {};
  int got = 0;
  for (int i = 0; i < 4; ++i) {
    all[i] = timerBegin(1000000);
    if (all[i]) got++;
  }
  check(got == 3, "solo quedan 3 libres (uno en uso)");
  for (auto *x : all) if (x) timerEnd(x);
  timerEnd(o);
  check(timerBegin(10) == nullptr, "frecuencia imposible (divisor > 65536) da NULL");

  Serial.print("HW_TIMER: ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

void loop() { delay(1000); }
