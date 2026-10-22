// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Timers de software de FreeRTOS (timers.c de FreeRTOS V10.5, sabor ESP-IDF)
// sobre el planificador determinista (gate JWSIM_G4_HAL_EXTRAS).
//
// Como en FreeRTOS: las funciones xTimer* solo encolan un comando para la
// tarea de servicio "Tmr Svc" (prioridad configTIMER_TASK_PRIORITY = 1, sin
// afinidad, cola de 10 comandos); el timer recién queda activo cuando esa
// tarea procesa el comando. El vencimiento se cuenta desde el tick en que se
// llamó a xTimerStart/Reset (no desde que se procesó); los de recarga
// automática se reprograman sobre el vencimiento anterior y, si la tarea se
// atrasó, se llama al callback una vez por cada período perdido. A igual
// vencimiento, en orden de inserción. Los callbacks corren en la tarea de
// servicio. Diferencia: la tarea se crea con el primer timer, no al arrancar
// el planificador (sin timers, en el ESP32 nunca corre).
//
// Valores de ESP-IDF v5 por defecto (VERIFICAR contra el sdkconfig real de
// esp32-arduino-libs): CONFIG_FREERTOS_TIMER_TASK_PRIORITY=1,
// CONFIG_FREERTOS_TIMER_TASK_STACK_DEPTH=2048, CONFIG_FREERTOS_TIMER_QUEUE_LENGTH=10,
// CONFIG_FREERTOS_TIMER_TASK_NO_AFFINITY.
#include <algorithm>
#include <deque>
#include <list>
#include <string>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"
#include "jwsim/engine.h"

struct jwsim_rtos_timer {
  std::string name;
  TickType_t period = 0;
  bool auto_reload = false;
  void *id = nullptr;
  TimerCallbackFunction_t callback = nullptr;
  bool active = false;
  bool is_static = false;
  TickType_t expiry = 0;      // tick de vencimiento (en la lista activa)
};

namespace {

constexpr UBaseType_t kTaskPriority = 1;
constexpr size_t kTaskStack = 2048;
constexpr size_t kQueueLength = 10;

enum class Cmd { Start, Reset, Stop, ChangePeriod, Delete, Pend };
struct Message {
  Cmd cmd;
  TimerHandle_t timer;
  TickType_t value;            // tick del comando o período nuevo
  PendedFunction_t fn;
  void *p1;
  uint32_t p2;
};

std::deque<Message> g_queue;
jwsim_waitq *g_rx = nullptr;    // la tarea de servicio esperando comandos
jwsim_waitq *g_tx = nullptr;    // emisores esperando lugar en la cola
std::list<TimerHandle_t> g_active;   // ordenada por vencimiento (FIFO a igual valor)
jwsim_task *g_task = nullptr;

jwsim_ns_t tick_deadline(TickType_t tick) { return jwsim_boot_ns() + static_cast<jwsim_ns_t>(tick) * JWSIM_TICK_NS; }

void insert_active(TimerHandle_t t, TickType_t expiry) {
  t->expiry = expiry;
  auto it = std::find_if(g_active.begin(), g_active.end(), [&](TimerHandle_t o) { return o->expiry > expiry; });
  g_active.insert(it, t);
}

void remove_active(TimerHandle_t t) { g_active.remove(t); }

void run_callback(TimerHandle_t t) {
  jwsim_cpu(jwsim_costs()->hal_call);
  t->callback(t);
}

// prvInsertTimerInActiveList: true si ya venció (hay que procesarlo ya).
bool insert_or_expired(TimerHandle_t t, TickType_t next, TickType_t now, TickType_t command_time) {
  if (next <= now && static_cast<TickType_t>(now - command_time) >= t->period) return true;
  insert_active(t, next);
  return false;
}

// prvReloadTimer: un callback por cada período ya vencido.
void reload(TimerHandle_t t, TickType_t expired, TickType_t now) {
  while (insert_or_expired(t, expired + t->period, now, expired)) {
    expired += t->period;
    run_callback(t);
  }
}

void process_expired(TimerHandle_t t, TickType_t now) {
  g_active.remove(t);
  if (t->auto_reload) reload(t, t->expiry, now);
  else t->active = false;
  run_callback(t);
}

void process_commands() {
  while (!g_queue.empty()) {
    const Message m = g_queue.front();
    g_queue.pop_front();
    jwsim_waitq_wake_one(g_tx);
    if (m.cmd == Cmd::Pend) {
      m.fn(m.p1, m.p2);
      continue;
    }
    TimerHandle_t t = m.timer;
    remove_active(t);
    const TickType_t now = xTaskGetTickCount();
    switch (m.cmd) {
      case Cmd::Start:
      case Cmd::Reset:
        t->active = true;
        if (insert_or_expired(t, m.value + t->period, now, m.value)) {
          if (t->auto_reload) reload(t, m.value + t->period, now);
          else t->active = false;
          run_callback(t);
        }
        break;
      case Cmd::Stop: t->active = false; break;
      case Cmd::ChangePeriod:
        t->active = true;
        t->period = m.value;
        insert_active(t, now + t->period);
        break;
      case Cmd::Delete:
        t->active = false;
        if (!t->is_static) delete t;
        break;
      case Cmd::Pend: break;
    }
  }
}

void service_task(void *) {
  for (;;) {
    const TickType_t now = xTaskGetTickCount();
    if (!g_active.empty() && g_active.front()->expiry <= now) {
      process_expired(g_active.front(), now);
    } else if (g_queue.empty()) {
      const jwsim_ns_t timeout = g_active.empty() ? JWSIM_NS_FOREVER : tick_deadline(g_active.front()->expiry) - jwsim_now();
      jwsim_waitq_block(g_rx, timeout);
    }
    process_commands();
  }
}

void ensure_task() {
  if (g_task) return;
  g_rx = jwsim_waitq_new();
  g_tx = jwsim_waitq_new();
  g_task = jwsim_task_create(service_task, nullptr, "Tmr Svc", kTaskStack, kTaskPriority, JWSIM_CORE_ANY);
}

// xTimerGenericCommand: encola sin esperar desde una ISR; desde una tarea
// espera hasta `ticks` si la cola está llena.
BaseType_t send(const Message &m, TickType_t ticks, bool from_isr) {
  if (!g_task) return pdFAIL;
  if (g_queue.size() >= kQueueLength) {
    if (from_isr || jwsim_in_isr() || !jwsim_task_self() || ticks == 0) return pdFAIL;
    const jwsim_ns_t deadline = ticks == portMAX_DELAY ? JWSIM_NS_FOREVER : jwsim_now() + static_cast<jwsim_ns_t>(ticks) * JWSIM_TICK_NS;
    while (g_queue.size() >= kQueueLength) {
      const jwsim_ns_t now = jwsim_now();
      if (deadline != JWSIM_NS_FOREVER && now >= deadline) return pdFAIL;
      jwsim_waitq_block(g_tx, deadline == JWSIM_NS_FOREVER ? JWSIM_NS_FOREVER : deadline - now);
    }
  }
  g_queue.push_back(m);
  jwsim_waitq_wake_one(g_rx);
  return pdPASS;
}

TimerHandle_t init(TimerHandle_t t, const char *name, TickType_t period, UBaseType_t reload, void *id,
                   TimerCallbackFunction_t cb) {
  if (period == 0) jwsim_fatal("assert failed: xTimerCreate timers.c (( xTimerPeriodInTicks > 0 ))");
  t->name = name ? name : "";
  t->period = period;
  t->auto_reload = reload != pdFALSE;
  t->id = id;
  t->callback = cb;
  ensure_task();
  return t;
}

} // namespace

extern "C" {

TimerHandle_t xTimerCreate(const char *name, TickType_t period, UBaseType_t autoReload, void *id,
                           TimerCallbackFunction_t cb) {
  return init(new jwsim_rtos_timer, name, period, autoReload, id, cb);
}

TimerHandle_t xTimerCreateStatic(const char *name, TickType_t period, UBaseType_t autoReload, void *id,
                                 TimerCallbackFunction_t cb, StaticTimer_t *buffer) {
  static_assert(sizeof(StaticTimer_t) >= sizeof(jwsim_rtos_timer), "StaticTimer_t demasiado chico");
  if (!buffer) return nullptr;
  TimerHandle_t t = init(new (buffer) jwsim_rtos_timer, name, period, autoReload, id, cb);
  t->is_static = true;
  return t;
}

BaseType_t xTimerGenericCommand(TimerHandle_t t, BaseType_t command, TickType_t value, BaseType_t *woken,
                                TickType_t ticks) {
  if (woken) *woken = pdFALSE;
  if (!t) return pdFAIL;
  const bool isr = command >= tmrFIRST_FROM_ISR_COMMAND;
  Cmd c;
  switch (isr ? command - (tmrFIRST_FROM_ISR_COMMAND - tmrCOMMAND_START) : command) {
    case tmrCOMMAND_START: c = Cmd::Start; break;
    case tmrCOMMAND_RESET: c = Cmd::Reset; break;
    case tmrCOMMAND_STOP: c = Cmd::Stop; break;
    case tmrCOMMAND_CHANGE_PERIOD:
      if (value == 0) jwsim_fatal("assert failed: xTimerChangePeriod timers.c (( xNewPeriod > 0 ))");
      c = Cmd::ChangePeriod;
      break;
    case tmrCOMMAND_DELETE: c = Cmd::Delete; break;
    default: return pdFAIL;
  }
  return send({c, t, value, nullptr, nullptr, 0}, ticks, isr);
}

BaseType_t xTimerIsTimerActive(TimerHandle_t t) { return t && t->active ? pdTRUE : pdFALSE; }
void *pvTimerGetTimerID(TimerHandle_t t) { return t ? t->id : nullptr; }
void vTimerSetTimerID(TimerHandle_t t, void *id) {
  if (t) t->id = id;
}
const char *pcTimerGetName(TimerHandle_t t) { return t ? t->name.c_str() : nullptr; }
TickType_t xTimerGetPeriod(TimerHandle_t t) { return t ? t->period : 0; }
TickType_t xTimerGetExpiryTime(TimerHandle_t t) { return t ? t->expiry : 0; }
void vTimerSetReloadMode(TimerHandle_t t, BaseType_t reload) {
  if (t) t->auto_reload = reload != pdFALSE;
}
BaseType_t xTimerGetReloadMode(TimerHandle_t t) { return t && t->auto_reload ? pdTRUE : pdFALSE; }
UBaseType_t uxTimerGetReloadMode(TimerHandle_t t) { return xTimerGetReloadMode(t); }
TaskHandle_t xTimerGetTimerDaemonTaskHandle(void) {
  ensure_task();
  return g_task;
}

BaseType_t xTimerPendFunctionCall(PendedFunction_t fn, void *p1, uint32_t p2, TickType_t ticks) {
  ensure_task();
  return send({Cmd::Pend, nullptr, 0, fn, p1, p2}, ticks, false);
}
BaseType_t xTimerPendFunctionCallFromISR(PendedFunction_t fn, void *p1, uint32_t p2, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  ensure_task();
  return send({Cmd::Pend, nullptr, 0, fn, p1, p2}, 0, true);
}

} // extern "C"
