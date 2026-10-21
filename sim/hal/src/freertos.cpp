// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// API FreeRTOS (sabor ESP-IDF) implementada sobre el planificador determinista.
//
// Semántica conservada: prioridades, afinidad de núcleo, bloqueo con timeout
// en ticks, colas FIFO, semáforos binarios/contadores, mutex recursivos y
// notificaciones. No se modela: herencia de prioridad, desbordes de pila,
// asserts internos de FreeRTOS ni contextos de interrupción reales.
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <vector>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "freertos/ringbuf.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "freertos/timers.h"
#include "jwsim/engine.h"

namespace {

jwsim_ns_t ticks_to_ns(TickType_t ticks) {
  return ticks == portMAX_DELAY ? JWSIM_NS_FOREVER : static_cast<jwsim_ns_t>(ticks) * JWSIM_TICK_NS;
}

// Espera con plazo absoluto sobre una cola de espera; reintenta tras cada
// despertar hasta que cond() se cumpla o venza el plazo.
template <typename Cond>
bool wait_for(jwsim_waitq *q, TickType_t ticks, Cond cond) {
  if (cond()) return true;
  if (ticks == 0 || !jwsim_task_self()) return false;
  const jwsim_ns_t timeout = ticks_to_ns(ticks);
  const jwsim_ns_t deadline = timeout == JWSIM_NS_FOREVER ? JWSIM_NS_FOREVER : jwsim_now() + timeout;
  while (!cond()) {
    const jwsim_ns_t now = jwsim_now();
    if (deadline != JWSIM_NS_FOREVER && now >= deadline) return false;
    jwsim_waitq_block(q, deadline == JWSIM_NS_FOREVER ? JWSIM_NS_FOREVER : deadline - now);
  }
  return true;
}

} // namespace

enum class QKind { Queue, Binary, Counting, Mutex, Recursive };

struct jwsim_queue {
  QKind kind = QKind::Queue;
  UBaseType_t length = 0;
  UBaseType_t item_size = 0;
  std::deque<std::vector<uint8_t>> items;   // colas con datos
  UBaseType_t count = 0;                     // semáforos y mutex
  TaskHandle_t owner = nullptr;
  UBaseType_t recursion = 0;
  jwsim_waitq *not_empty = nullptr;
  jwsim_waitq *not_full = nullptr;
  bool is_static = false;
};

namespace {

QueueHandle_t new_queue(QKind kind, UBaseType_t length, UBaseType_t item_size, UBaseType_t initial) {
  auto *q = new jwsim_queue();
  q->kind = kind;
  q->length = length;
  q->item_size = item_size;
  q->count = initial;
  q->not_empty = jwsim_waitq_new();
  q->not_full = jwsim_waitq_new();
  return q;
}

UBaseType_t q_used(const jwsim_queue *q) {
  return q->kind == QKind::Queue ? static_cast<UBaseType_t>(q->items.size()) : q->count;
}

} // namespace

extern "C" {

// ------------------------------------------------------------------ port
void jwsim_freertos_assert(const char *file, int line) { jwsim_fatal("configASSERT falló en %s:%d", file, line); }
void jwsim_port_enter_critical(void) { jwsim_sched_lock(); }
void jwsim_port_exit_critical(void) { jwsim_sched_unlock(); }
BaseType_t xPortGetCoreID(void) { return jwsim_current_core(); }
BaseType_t xPortInIsrContext(void) { return pdFALSE; }
void jwsim_port_yield(void) { jwsim_task_yield(); }

// ------------------------------------------------------------------ tareas
BaseType_t xTaskCreatePinnedToCore(TaskFunction_t fn, const char *name, uint32_t stackDepth, void *param,
                                   UBaseType_t prio, TaskHandle_t *created, BaseType_t coreId) {
  const int core = (coreId == tskNO_AFFINITY || coreId < 0) ? JWSIM_CORE_ANY : static_cast<int>(coreId);
  TaskHandle_t t = jwsim_task_create(fn, param, name, stackDepth, prio, core);
  if (created) *created = t;
  return t ? pdPASS : errCOULD_NOT_ALLOCATE_REQUIRED_MEMORY;
}

TaskHandle_t xTaskCreateStaticPinnedToCore(TaskFunction_t fn, const char *name, uint32_t stackDepth, void *param,
                                           UBaseType_t prio, StackType_t *, StaticTask_t *, BaseType_t coreId) {
  TaskHandle_t t = nullptr;
  xTaskCreatePinnedToCore(fn, name, stackDepth, param, prio, &t, coreId);
  return t;
}

void vTaskDelete(TaskHandle_t task) { jwsim_task_delete(task); }

void vTaskDelay(const TickType_t ticks) {
  if (ticks == 0) {
    jwsim_task_yield();
    return;
  }
  jwsim_task_sleep_until_tick(jwsim_tick_count() + ticks);
}

BaseType_t xTaskDelayUntil(TickType_t *prev, const TickType_t increment) {
  const TickType_t wake = *prev + increment;
  const TickType_t now = jwsim_tick_count();
  *prev = wake;
  if (static_cast<int32_t>(wake - now) > 0) {
    jwsim_task_sleep_until_tick(wake);
    return pdTRUE;
  }
  return pdFALSE;
}

void vTaskDelayUntil(TickType_t *prev, const TickType_t increment) { (void)xTaskDelayUntil(prev, increment); }
TickType_t xTaskGetTickCount(void) { return jwsim_tick_count(); }
TickType_t xTaskGetTickCountFromISR(void) { return jwsim_tick_count(); }
TaskHandle_t xTaskGetCurrentTaskHandle(void) { return jwsim_task_self(); }
TaskHandle_t xTaskGetCurrentTaskHandleForCore(BaseType_t) { return jwsim_task_self(); }
TaskHandle_t xTaskGetIdleTaskHandleForCore(BaseType_t) { return nullptr; }
TaskHandle_t xTaskGetHandle(const char *) { return nullptr; }
char *pcTaskGetName(TaskHandle_t task) { return const_cast<char *>(jwsim_task_name(task ? task : jwsim_task_self())); }
UBaseType_t uxTaskPriorityGet(TaskHandle_t task) { return jwsim_task_priority(task ? task : jwsim_task_self()); }
void vTaskPrioritySet(TaskHandle_t task, UBaseType_t prio) { jwsim_task_set_priority(task, prio); }
BaseType_t xTaskGetCoreID(TaskHandle_t task) { return jwsim_task_core(task ? task : jwsim_task_self()); }
eTaskState eTaskGetState(TaskHandle_t task) { return (!task || task == jwsim_task_self()) ? eRunning : eReady; }
// Las pilas del host no equivalen a las del ESP32: se informa un margen fijo.
UBaseType_t uxTaskGetStackHighWaterMark(TaskHandle_t) { return 4096; }
UBaseType_t uxTaskGetNumberOfTasks(void) { return 0; }
UBaseType_t uxTaskGetSystemState(TaskStatus_t *, UBaseType_t, uint32_t *total) {
  if (total) *total = 0;
  return 0;
}
void vTaskSuspend(TaskHandle_t task) { jwsim_task_suspend(task); }
void vTaskResume(TaskHandle_t task) { jwsim_task_resume(task); }
BaseType_t xTaskResumeFromISR(TaskHandle_t task) {
  jwsim_task_resume(task);
  return pdFALSE;
}
void vTaskSuspendAll(void) { jwsim_sched_lock(); }
BaseType_t xTaskResumeAll(void) {
  jwsim_sched_unlock();
  return pdFALSE;
}
BaseType_t xTaskGetSchedulerState(void) { return taskSCHEDULER_RUNNING; }
void vTaskStartScheduler(void) {}

BaseType_t xTaskGenericNotify(TaskHandle_t task, UBaseType_t, uint32_t value, eNotifyAction action, uint32_t *prev) {
  int a = 0;
  switch (action) {
    case eSetBits: a = 1; break;
    case eIncrement: a = 2; break;
    case eSetValueWithOverwrite:
    case eSetValueWithoutOverwrite: a = 3; break;
    default: a = 0; break;
  }
  jwsim_task_notify(task, value, a, prev);
  return pdPASS;
}

BaseType_t xTaskGenericNotifyFromISR(TaskHandle_t task, UBaseType_t index, uint32_t value, eNotifyAction action,
                                     uint32_t *prev, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  return xTaskGenericNotify(task, index, value, action, prev);
}

BaseType_t xTaskGenericNotifyWait(UBaseType_t, uint32_t clearOnEntry, uint32_t clearOnExit, uint32_t *value,
                                  TickType_t ticks) {
  return jwsim_task_notify_wait(value, clearOnEntry, clearOnExit, ticks_to_ns(ticks)) ? pdTRUE : pdFALSE;
}

uint32_t ulTaskGenericNotifyTake(UBaseType_t, BaseType_t clearOnExit, TickType_t ticks) {
  uint32_t v = 0;
  if (!jwsim_task_notify_wait(&v, 0, 0, ticks_to_ns(ticks))) return 0;
  // Semántica de "take": el valor actúa como contador.
  uint32_t prev = 0;
  jwsim_task_notify(jwsim_task_self(), clearOnExit ? 0 : (v ? v - 1 : 0), 3, &prev);
  (void)jwsim_task_notify_wait(nullptr, 0, 0, 0);   // consume la marca pendiente
  return v;
}

void vTaskGenericNotifyGiveFromISR(TaskHandle_t task, UBaseType_t, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  jwsim_task_notify(task, 0, 2, nullptr);
}

// ------------------------------------------------------------------ colas
QueueHandle_t xQueueCreate(UBaseType_t length, UBaseType_t itemSize) {
  return new_queue(QKind::Queue, length, itemSize, 0);
}

QueueHandle_t xQueueCreateStatic(UBaseType_t length, UBaseType_t itemSize, uint8_t *, StaticQueue_t *) {
  return xQueueCreate(length, itemSize);
}

void vQueueDelete(QueueHandle_t q) {
  if (!q) return;
  jwsim_waitq_free(q->not_empty);
  jwsim_waitq_free(q->not_full);
  delete q;
}

BaseType_t xQueueGenericSend(QueueHandle_t q, const void *item, TickType_t ticks, BaseType_t pos) {
  if (!q) return pdFAIL;
  jwsim_cpu(jwsim_costs()->sem_op);
  if (pos != queueOVERWRITE && !wait_for(q->not_full, ticks, [q] { return q_used(q) < q->length; })) {
    return errQUEUE_FULL;
  }
  std::vector<uint8_t> data(q->item_size);
  if (q->item_size && item) std::memcpy(data.data(), item, q->item_size);
  if (pos == queueOVERWRITE && !q->items.empty()) q->items.clear();
  if (pos == queueSEND_TO_FRONT) q->items.push_front(std::move(data));
  else q->items.push_back(std::move(data));
  jwsim_waitq_wake_one(q->not_empty);
  return pdPASS;
}

BaseType_t xQueueGenericSendFromISR(QueueHandle_t q, const void *item, BaseType_t *woken, BaseType_t pos) {
  if (woken) *woken = pdFALSE;
  return xQueueGenericSend(q, item, 0, pos);
}

static BaseType_t queue_take(QueueHandle_t q, void *item, TickType_t ticks, bool peek) {
  if (!q) return pdFAIL;
  jwsim_cpu(jwsim_costs()->sem_op);
  if (!wait_for(q->not_empty, ticks, [q] { return !q->items.empty(); })) return errQUEUE_EMPTY;
  if (item && q->item_size) std::memcpy(item, q->items.front().data(), q->item_size);
  if (!peek) {
    q->items.pop_front();
    jwsim_waitq_wake_one(q->not_full);
  }
  return pdPASS;
}

BaseType_t xQueueReceive(QueueHandle_t q, void *item, TickType_t ticks) { return queue_take(q, item, ticks, false); }
BaseType_t xQueuePeek(QueueHandle_t q, void *item, TickType_t ticks) { return queue_take(q, item, ticks, true); }
BaseType_t xQueueReceiveFromISR(QueueHandle_t q, void *item, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  return queue_take(q, item, 0, false);
}

BaseType_t xQueueGenericReset(QueueHandle_t q, BaseType_t) {
  if (!q) return pdFAIL;
  q->items.clear();
  jwsim_waitq_wake_all(q->not_full);
  return pdPASS;
}

UBaseType_t uxQueueMessagesWaiting(QueueHandle_t q) { return q ? q_used(q) : 0; }
UBaseType_t uxQueueMessagesWaitingFromISR(QueueHandle_t q) { return uxQueueMessagesWaiting(q); }
UBaseType_t uxQueueSpacesAvailable(QueueHandle_t q) { return q ? q->length - q_used(q) : 0; }

// ------------------------------------------------------------------ semáforos
SemaphoreHandle_t xSemaphoreCreateBinary(void) { return new_queue(QKind::Binary, 1, 0, 0); }
SemaphoreHandle_t xSemaphoreCreateBinaryStatic(StaticSemaphore_t *) { return xSemaphoreCreateBinary(); }
SemaphoreHandle_t xSemaphoreCreateCounting(UBaseType_t max, UBaseType_t initial) {
  return new_queue(QKind::Counting, max, 0, initial);
}
SemaphoreHandle_t xSemaphoreCreateCountingStatic(UBaseType_t max, UBaseType_t initial, StaticSemaphore_t *) {
  return xSemaphoreCreateCounting(max, initial);
}
SemaphoreHandle_t xSemaphoreCreateMutex(void) { return new_queue(QKind::Mutex, 1, 0, 1); }
SemaphoreHandle_t xSemaphoreCreateMutexStatic(StaticSemaphore_t *) { return xSemaphoreCreateMutex(); }
SemaphoreHandle_t xSemaphoreCreateRecursiveMutex(void) { return new_queue(QKind::Recursive, 1, 0, 1); }
SemaphoreHandle_t xSemaphoreCreateRecursiveMutexStatic(StaticSemaphore_t *) { return xSemaphoreCreateRecursiveMutex(); }

BaseType_t xSemaphoreTake(SemaphoreHandle_t s, TickType_t ticks) {
  if (!s) return pdFAIL;
  jwsim_cpu(jwsim_costs()->sem_op);
  TaskHandle_t self = jwsim_task_self();
  if (s->kind == QKind::Recursive && s->owner == self && self) {
    ++s->recursion;
    return pdTRUE;
  }
  if (!wait_for(s->not_empty, ticks, [s] { return s->count > 0; })) return pdFALSE;
  --s->count;
  if (s->kind == QKind::Mutex || s->kind == QKind::Recursive) {
    s->owner = self;
    s->recursion = 1;
  }
  return pdTRUE;
}

BaseType_t xSemaphoreGive(SemaphoreHandle_t s) {
  if (!s) return pdFAIL;
  if (s->kind == QKind::Mutex || s->kind == QKind::Recursive) {
    if (s->owner != jwsim_task_self()) return pdFAIL;
    if (s->kind == QKind::Recursive && --s->recursion > 0) return pdTRUE;
    s->owner = nullptr;
    s->recursion = 0;
  }
  if (s->count >= s->length) return pdFAIL;
  ++s->count;
  jwsim_waitq_wake_one(s->not_empty);
  jwsim_cpu(jwsim_costs()->sem_op);
  return pdTRUE;
}

BaseType_t xSemaphoreTakeRecursive(SemaphoreHandle_t s, TickType_t ticks) { return xSemaphoreTake(s, ticks); }
BaseType_t xSemaphoreGiveRecursive(SemaphoreHandle_t s) { return xSemaphoreGive(s); }
BaseType_t xSemaphoreTakeFromISR(SemaphoreHandle_t s, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  return xSemaphoreTake(s, 0);
}
BaseType_t xSemaphoreGiveFromISR(SemaphoreHandle_t s, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  return xSemaphoreGive(s);
}
UBaseType_t uxSemaphoreGetCount(SemaphoreHandle_t s) { return s ? s->count : 0; }
TaskHandle_t xSemaphoreGetMutexHolder(SemaphoreHandle_t s) { return s ? s->owner : nullptr; }

} // extern "C"

// ------------------------------------------------------------------ eventos
struct jwsim_event_group {
  EventBits_t bits = 0;
  jwsim_waitq *waiters = nullptr;
};

extern "C" {

EventGroupHandle_t xEventGroupCreate(void) {
  auto *g = new jwsim_event_group();
  g->waiters = jwsim_waitq_new();
  return g;
}
EventGroupHandle_t xEventGroupCreateStatic(StaticEventGroup_t *) { return xEventGroupCreate(); }
void vEventGroupDelete(EventGroupHandle_t g) {
  if (!g) return;
  jwsim_waitq_free(g->waiters);
  delete g;
}
EventBits_t xEventGroupSetBits(EventGroupHandle_t g, const EventBits_t bits) {
  g->bits |= bits;
  jwsim_waitq_wake_all(g->waiters);
  return g->bits;
}
BaseType_t xEventGroupSetBitsFromISR(EventGroupHandle_t g, const EventBits_t bits, BaseType_t *woken) {
  if (woken) *woken = pdFALSE;
  xEventGroupSetBits(g, bits);
  return pdPASS;
}
EventBits_t xEventGroupClearBits(EventGroupHandle_t g, const EventBits_t bits) {
  const EventBits_t prev = g->bits;
  g->bits &= ~bits;
  return prev;
}
EventBits_t xEventGroupGetBits(EventGroupHandle_t g) { return g->bits; }
EventBits_t xEventGroupWaitBits(EventGroupHandle_t g, const EventBits_t bits, const BaseType_t clearOnExit,
                                const BaseType_t waitAll, TickType_t ticks) {
  auto ok = [&] { return waitAll ? (g->bits & bits) == bits : (g->bits & bits) != 0; };
  const bool met = wait_for(g->waiters, ticks, ok);
  const EventBits_t result = g->bits;
  if (met && clearOnExit) g->bits &= ~bits;
  return result;
}

// ------------------------------------------------------------------ timers
// Los timers de software de FreeRTOS aún no se modelan (no los usa el cierre
// de librerías del JWPLC Basic). Se rechazan de forma explícita.
TimerHandle_t xTimerCreate(const char *name, TickType_t, UBaseType_t, void *, TimerCallbackFunction_t) {
  jwsim_fatal("xTimerCreate('%s'): timers de software FreeRTOS no soportados todavía por JWPLC Sim", name ? name : "");
}
BaseType_t xTimerStart(TimerHandle_t, TickType_t) { return pdFAIL; }
BaseType_t xTimerStop(TimerHandle_t, TickType_t) { return pdFAIL; }
BaseType_t xTimerReset(TimerHandle_t, TickType_t) { return pdFAIL; }
BaseType_t xTimerChangePeriod(TimerHandle_t, TickType_t, TickType_t) { return pdFAIL; }
BaseType_t xTimerDelete(TimerHandle_t, TickType_t) { return pdFAIL; }
BaseType_t xTimerIsTimerActive(TimerHandle_t) { return pdFALSE; }
void *pvTimerGetTimerID(TimerHandle_t) { return nullptr; }

} // extern "C"

// ------------------------------------------------------------------ ringbuf
struct jwsim_ringbuf {
  size_t capacity = 0;
  std::deque<uint8_t> data;
  jwsim_waitq *readers = nullptr;
};

extern "C" {

RingbufHandle_t xRingbufferCreate(size_t size, RingbufferType_t type) {
  if (type != RINGBUF_TYPE_BYTEBUF) jwsim_fatal("xRingbufferCreate: solo RINGBUF_TYPE_BYTEBUF está soportado");
  auto *r = new jwsim_ringbuf();
  r->capacity = size;
  r->readers = jwsim_waitq_new();
  return r;
}
void vRingbufferDelete(RingbufHandle_t r) {
  if (!r) return;
  jwsim_waitq_free(r->readers);
  delete r;
}
BaseType_t xRingbufferSend(RingbufHandle_t r, const void *item, size_t size, TickType_t) {
  if (r->data.size() + size > r->capacity) return pdFALSE;
  const uint8_t *p = static_cast<const uint8_t *>(item);
  r->data.insert(r->data.end(), p, p + size);
  jwsim_waitq_wake_all(r->readers);
  return pdTRUE;
}
void *xRingbufferReceiveUpTo(RingbufHandle_t r, size_t *size, TickType_t ticks, size_t maxSize) {
  if (!wait_for(r->readers, ticks, [r] { return !r->data.empty(); })) return nullptr;
  const size_t n = std::min(maxSize, r->data.size());
  auto *out = static_cast<uint8_t *>(std::malloc(n ? n : 1));
  std::copy(r->data.begin(), r->data.begin() + static_cast<long>(n), out);
  r->data.erase(r->data.begin(), r->data.begin() + static_cast<long>(n));
  if (size) *size = n;
  return out;
}
void vRingbufferReturnItem(RingbufHandle_t, void *item) { std::free(item); }
size_t xRingbufferGetMaxItemSize(RingbufHandle_t r) { return r->capacity; }
size_t xRingbufferGetCurFreeSize(RingbufHandle_t r) { return r->capacity - r->data.size(); }
void vRingbufferGetInfo(RingbufHandle_t r, UBaseType_t *free, UBaseType_t *rd, UBaseType_t *wr, UBaseType_t *acq,
                        UBaseType_t *waiting) {
  if (free) *free = static_cast<UBaseType_t>(r->capacity - r->data.size());
  if (rd) *rd = 0;
  if (wr) *wr = 0;
  if (acq) *acq = 0;
  if (waiting) *waiting = static_cast<UBaseType_t>(r->data.size());
}

} // extern "C"
