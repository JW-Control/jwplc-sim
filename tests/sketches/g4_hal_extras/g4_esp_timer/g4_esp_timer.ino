// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_HAL_EXTRAS: esp_timer de ESP-IDF y la librería Ticker del core
// (que lo usa). Imprime "[PASS]"/"[FAIL]" por caso y al final
// "ESP_TIMER: P PASS, F FAIL".
#include <Ticker.h>
#include <esp_timer.h>

int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

volatile int64_t onceAt = -1;
volatile int onceRuns = 0;
volatile int64_t stamps[6];
volatile int periodicRuns = 0;
volatile bool isrContext = false;
volatile int64_t isrAt = -1;
volatile int tickerRuns = 0;
volatile int order[4];
volatile int orderN = 0;

void onceCb(void *arg) {
  onceAt = esp_timer_get_time();
  onceRuns++;
  *static_cast<int *>(arg) = 42;
}
void periodicCb(void *) {
  if (periodicRuns < 6) stamps[periodicRuns] = esp_timer_get_time();
  periodicRuns++;
}
void isrCb(void *) {
  isrContext = xPortInIsrContext();
  isrAt = esp_timer_get_time();
}
void orderCb(void *arg) {
  if (orderN < 4) order[orderN++] = static_cast<int>(reinterpret_cast<intptr_t>(arg));
}
void tickerCb() { tickerRuns++; }

void setup() {
  Serial.begin(115200);
  esp_timer_handle_t once = nullptr, periodic = nullptr, isr = nullptr;
  int arg = 0;
  esp_timer_create_args_t a = {};
  check(esp_timer_create(&a, &once) == ESP_ERR_INVALID_ARG, "create sin callback da INVALID_ARG");
  a.callback = onceCb;
  a.arg = &arg;
  a.name = "una_vez";
  check(esp_timer_create(&a, &once) == ESP_OK, "create una vez");
  a.callback = periodicCb;
  a.arg = nullptr;
  a.name = "periodico";
  check(esp_timer_create(&a, &periodic) == ESP_OK, "create periodico");
  a.callback = isrCb;
  a.dispatch_method = ESP_TIMER_ISR;
  a.name = "isr";
  check(esp_timer_create(&a, &isr) == ESP_OK, "create con despacho ISR");

  // Una vez a 1,5 ms.
  const int64_t t0 = esp_timer_get_time();
  check(esp_timer_start_once(once, 1500) == ESP_OK, "start_once");
  check(esp_timer_start_once(once, 1500) == ESP_ERR_INVALID_STATE, "start_once activo da INVALID_STATE");
  check(esp_timer_is_active(once), "is_active tras start_once");
  uint64_t expiry = 0;
  check(esp_timer_get_expiry_time(once, &expiry) == ESP_OK && expiry == static_cast<uint64_t>(t0) + 1500,
        "get_expiry_time");
  check(esp_timer_get_next_alarm() == t0 + 1500, "get_next_alarm");
  delay(5);
  check(onceRuns == 1 && arg == 42, "callback una vez con su argumento");
  check(onceAt >= t0 + 1500 && onceAt < t0 + 1600, "una vez vence a los 1500 us");
  check(!esp_timer_is_active(once), "una vez queda inactivo");
  check(esp_timer_stop(once) == ESP_ERR_INVALID_STATE, "stop inactivo da INVALID_STATE");
  check(esp_timer_restart(once, 100) == ESP_ERR_INVALID_STATE, "restart inactivo da INVALID_STATE");

  // Periódico de 10 ms sin deriva.
  const int64_t p0 = esp_timer_get_time();
  check(esp_timer_start_periodic(periodic, 10000) == ESP_OK, "start_periodic");
  uint64_t period = 0;
  check(esp_timer_get_period(periodic, &period) == ESP_OK && period == 10000, "get_period");
  check(esp_timer_get_expiry_time(periodic, &expiry) == ESP_ERR_NOT_SUPPORTED, "get_expiry_time de periódico");
  check(esp_timer_delete(periodic) == ESP_ERR_INVALID_STATE, "delete activo da INVALID_STATE");
  delay(65);
  bool regular = periodicRuns >= 6;
  for (int i = 1; i < 6 && regular; ++i) regular = stamps[i] - stamps[i - 1] == 10000;
  check(regular, "periódico cada 10000 us exactos");
  check(stamps[0] >= p0 + 10000 && stamps[0] < p0 + 10100, "primer periódico a los 10 ms");
  check(esp_timer_stop(periodic) == ESP_OK, "stop periódico");
  const int runs = periodicRuns;
  delay(30);
  check(periodicRuns == runs, "periódico detenido no vuelve a correr");
  check(esp_timer_delete(periodic) == ESP_OK, "delete inactivo");

  // restart cambia el plazo de un timer activo.
  const int64_t r0 = esp_timer_get_time();
  esp_timer_start_once(once, 50000);
  check(esp_timer_restart(once, 2000) == ESP_OK, "restart activo");
  delay(5);
  check(onceRuns == 2 && onceAt >= r0 + 2000 && onceAt < r0 + 2100, "restart adelanta el vencimiento");

  // Despacho ISR: el callback corre en la interrupción, en el instante exacto.
  const int64_t i0 = esp_timer_get_time();
  esp_timer_start_once(isr, 3000);
  delay(5);
  check(isrContext, "callback ESP_TIMER_ISR en contexto de interrupción");
  check(isrAt == i0 + 3000, "callback ESP_TIMER_ISR sin latencia de tarea");

  // Alarmas iguales: en orden de armado.
  esp_timer_handle_t o[4];
  for (int i = 0; i < 4; ++i) {
    esp_timer_create_args_t oa = {};
    oa.callback = orderCb;
    oa.arg = reinterpret_cast<void *>(static_cast<intptr_t>(i));
    oa.name = "orden";
    esp_timer_create(&oa, &o[i]);
  }
  const int idx[4] = {2, 0, 3, 1};
  for (int i : idx) esp_timer_start_once(o[i], 1000);
  delay(3);
  check(orderN == 4 && order[0] == 2 && order[1] == 0 && order[2] == 3 && order[3] == 1, "alarmas iguales en orden de armado");

  // Ticker (librería del core sobre esp_timer).
  Ticker ticker;
  ticker.attach_ms(20, tickerCb);
  check(ticker.active(), "Ticker activo");
  delay(205);
  ticker.detach();
  check(tickerRuns == 10, "Ticker cada 20 ms: 10 llamadas en 205 ms");
  check(!ticker.active(), "Ticker detenido");

  Serial.print("ESP_TIMER: ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

void loop() { delay(1000); }
