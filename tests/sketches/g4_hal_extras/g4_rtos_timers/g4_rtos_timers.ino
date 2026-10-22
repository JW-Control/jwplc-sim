// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_HAL_EXTRAS: timers de software de FreeRTOS (timers.h). Imprime
// "[PASS]"/"[FAIL]" por caso y al final "RTOS_TIMERS: P PASS, F FAIL".
#include <freertos/timers.h>

int passed = 0;
int failed = 0;

void check(bool ok, const char *what) {
  Serial.print(ok ? "[PASS] " : "[FAIL] ");
  Serial.println(what);
  (ok ? passed : failed)++;
}

volatile TickType_t oneShotAt = 0;
volatile int oneShotRuns = 0;
volatile TickType_t reloadAt[12];
volatile int reloadRuns = 0;
volatile bool inService = false;
volatile int pendArg2 = 0;
char pendTask[16];

void oneShotCb(TimerHandle_t t) {
  oneShotAt = xTaskGetTickCount();
  oneShotRuns++;
  inService = strcmp(pcTaskGetName(nullptr), "Tmr Svc") == 0;
  vTimerSetTimerID(t, reinterpret_cast<void *>(static_cast<intptr_t>(7)));
}
void reloadCb(TimerHandle_t) {
  if (reloadRuns < 12) reloadAt[reloadRuns] = xTaskGetTickCount();
  reloadRuns++;
}
void pended(void *p1, uint32_t p2) {
  strncpy(pendTask, pcTaskGetName(nullptr), sizeof(pendTask) - 1);
  pendArg2 = static_cast<int>(p2) + *static_cast<int *>(p1);
}

StaticTimer_t staticBuffer;
volatile int staticRuns = 0;
void staticCb(TimerHandle_t) { staticRuns++; }

void setup() {
  Serial.begin(115200);

  TimerHandle_t one = xTimerCreate("uno", pdMS_TO_TICKS(100), pdFALSE, reinterpret_cast<void *>(1), oneShotCb);
  check(one != nullptr, "xTimerCreate una vez");
  check(strcmp(pcTimerGetName(one), "uno") == 0, "pcTimerGetName");
  check(xTimerGetPeriod(one) == 100, "xTimerGetPeriod");
  check(pvTimerGetTimerID(one) == reinterpret_cast<void *>(1), "pvTimerGetTimerID");
  check(xTimerGetReloadMode(one) == pdFALSE, "modo sin recarga");
  check(xTimerIsTimerActive(one) == pdFALSE, "inactivo al crear");

  // Una vez: vence a los 100 ticks contados desde la llamada a xTimerStart.
  const TickType_t s0 = xTaskGetTickCount();
  check(xTimerStart(one, 0) == pdPASS, "xTimerStart");
  delay(2);
  check(xTimerIsTimerActive(one) == pdTRUE, "activo tras procesar el comando");
  check(xTimerGetExpiryTime(one) == s0 + 100, "xTimerGetExpiryTime");
  delay(150);
  check(oneShotRuns == 1 && oneShotAt == s0 + 100, "una vez vence en el tick exacto");
  check(inService, "el callback corre en la tarea Tmr Svc");
  check(pvTimerGetTimerID(one) == reinterpret_cast<void *>(7), "vTimerSetTimerID desde el callback");
  check(xTimerIsTimerActive(one) == pdFALSE, "una vez queda inactivo");

  // xTimerReset extiende el plazo.
  const TickType_t r0 = xTaskGetTickCount();
  xTimerStart(one, 0);
  delay(60);
  const TickType_t r1 = xTaskGetTickCount();
  xTimerReset(one, 0);
  delay(70);
  check(oneShotRuns == 1, "reset posterga el vencimiento");
  delay(50);
  check(oneShotRuns == 2 && oneShotAt == r1 + 100 && oneShotAt != r0 + 100, "vence 100 ticks después del reset");

  // Recarga automática de 50 ticks: sin deriva.
  TimerHandle_t rel = xTimerCreate("recarga", pdMS_TO_TICKS(50), pdTRUE, nullptr, reloadCb);
  check(xTimerGetReloadMode(rel) == pdTRUE, "modo con recarga");
  const TickType_t a0 = xTaskGetTickCount();
  xTimerStart(rel, 0);
  delay(525);
  bool regular = reloadRuns == 10;
  for (int i = 0; i < 10 && regular; ++i) regular = reloadAt[i] == a0 + 50 * (i + 1);
  check(regular, "recarga cada 50 ticks exactos (10 en 525 ms)");

  // xTimerChangePeriod: nuevo período desde que se procesa el comando.
  const int before = reloadRuns;
  xTimerChangePeriod(rel, pdMS_TO_TICKS(20), 0);
  // Como todo comando, recién vale cuando lo procesa la tarea de servicio.
  check(xTimerGetPeriod(rel) == 50, "el período no cambia antes de procesar el comando");
  delay(1);
  check(xTimerGetPeriod(rel) == 20, "xTimerChangePeriod cambia el período");
  delay(100);
  check(reloadRuns - before == 5, "nuevo período: 5 llamadas en 101 ms");
  xTimerStop(rel, 0);
  delay(2);
  check(xTimerIsTimerActive(rel) == pdFALSE, "xTimerStop");
  const int stopped = reloadRuns;
  delay(60);
  check(reloadRuns == stopped, "detenido no vuelve a llamar");
  // Cambiar el período de un timer detenido lo arranca.
  xTimerChangePeriod(rel, pdMS_TO_TICKS(30), 0);
  delay(2);
  check(xTimerIsTimerActive(rel) == pdTRUE, "xTimerChangePeriod arranca un timer detenido");
  xTimerDelete(rel, 0);
  delay(2);

  // vTimerSetReloadMode convierte uno de una vez en periódico.
  vTimerSetReloadMode(one, pdTRUE);
  const int base = oneShotRuns;
  xTimerStart(one, 0);
  delay(305);
  check(oneShotRuns - base == 3, "vTimerSetReloadMode: 3 llamadas en 305 ms");
  xTimerStop(one, 0);

  // Timer estático.
  TimerHandle_t st = xTimerCreateStatic("estatico", 10, pdTRUE, nullptr, staticCb, &staticBuffer);
  check(st != nullptr, "xTimerCreateStatic");
  xTimerStart(st, 0);
  delay(55);
  xTimerStop(st, 0);
  check(staticRuns == 5, "timer estático: 5 llamadas en 55 ms");

  // Función diferida a la tarea de servicio.
  static int p1 = 40;
  check(xTimerPendFunctionCall(pended, &p1, 2, 0) == pdPASS, "xTimerPendFunctionCall");
  delay(2);
  check(pendArg2 == 42 && strcmp(pendTask, "Tmr Svc") == 0, "función diferida corre en Tmr Svc");
  check(xTimerGetTimerDaemonTaskHandle() != nullptr &&
            strcmp(pcTaskGetName(xTimerGetTimerDaemonTaskHandle()), "Tmr Svc") == 0,
        "xTimerGetTimerDaemonTaskHandle");

  Serial.print("RTOS_TIMERS: ");
  Serial.print(passed);
  Serial.print(" PASS, ");
  Serial.print(failed);
  Serial.println(" FAIL");
}

void loop() { delay(1000); }
