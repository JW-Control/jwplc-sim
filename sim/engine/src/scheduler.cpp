// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Planificador determinista del ESP32 simulado.
//
// Modelo:
// - Dos núcleos virtuales, cada uno con su propio reloj t[c] (ns).
// - Las tareas son fibras ancladas a un núcleo; en cada núcleo corre la tarea
//   lista de mayor prioridad (FIFO entre iguales, rotación por tick).
// - El planificador siempre avanza el núcleo con la próxima actividad más
//   temprana; un núcleo corre como máximo hasta su "horizonte" (próximo evento
//   externo, despertar de una tarea de mayor prioridad, siguiente tick con
//   rotación pendiente o el reloj del otro núcleo + QUANTUM).
// - Solo hay cambios de contexto en puntos de sincronización; nunca se usa el
//   reloj del sistema operativo. Misma entrada => misma ejecución.
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>

#include "fiber.h"
#if defined(__GLIBC__)
#include <execinfo.h>
#endif
#include "jwsim/engine.h"

namespace {

using jwsim::Fiber;

// Desfase máximo tolerado entre núcleos que corren a la vez.
constexpr jwsim_ns_t QUANTUM = 10 * JWSIM_NS_PER_US;
constexpr size_t MIN_HOST_STACK = 256 * 1024;

enum class State { Ready, Blocked, Suspended, Deleted };

} // namespace

struct jwsim_task {
  uint64_t id = 0;
  std::string name;
  unsigned priority = 0;
  int core = 0;
  Fiber *fiber = nullptr;
  jwsim_task_fn fn = nullptr;
  void *arg = nullptr;
  State state = State::Ready;
  jwsim_ns_t ready_at = 0;                 // Ready: instante mínimo para correr
  jwsim_ns_t wake_at = JWSIM_NS_FOREVER;   // Blocked: vencimiento del timeout
  jwsim_waitq *waiting_on = nullptr;
  bool signaled = false;                   // despertada por señal (no timeout)
  uint64_t seq = 0;                        // orden FIFO entre iguales
  bool waiting_notify = false;
  uint32_t notify_value = 0;
  bool notify_pending = false;
  jwsim_ns_t cpu_ns = 0;                   // tiempo de CPU virtual consumido
  uint64_t dispatches = 0;
};

struct jwsim_waitq {
  std::vector<jwsim_task *> waiters;
};

namespace {

struct Core {
  jwsim_ns_t t = 0;
  jwsim_ns_t horizon = 0;
  jwsim_task *current = nullptr;
  uint32_t slice_tick = 0;     // tick en que la tarea actual empezó su turno
};

struct Event {
  jwsim_ns_t when;
  int external;  // 0 interno, 1 externo (a igual instante, después)
  uint64_t seq;
  jwsim_event_fn fn;
  void *arg;
};

struct Isr {
  jwsim_ns_t at;
  int core;
  jwsim_isr_fn fn;
  void *arg;
};

struct Sched {
  Core cores[JWSIM_NUM_CORES];
  std::vector<Isr> isrs;                 // interrupciones pendientes (FIFO)
  bool in_isr = false;
  jwsim_ns_t isr_now = 0;
  std::vector<jwsim_task *> tasks;       // en orden de creación (determinista)
  std::vector<jwsim_task *> graveyard;   // borradas pendientes de liberar
  std::vector<Event> events;             // min-heap por (when, seq)
  Fiber *main_fiber = nullptr;
  jwsim_task *running = nullptr;         // tarea en ejecución (o nullptr)
  int running_core = -1;
  jwsim_ns_t event_now = 0;              // instante del evento en curso
  bool in_event = false;
  uint64_t next_id = 1;
  uint64_t next_seq = 1;
  uint64_t next_event_seq = 1;
  int lock_depth = 0;
  bool stop_requested = false;
  bool restart_requested = false;
  jwsim_ns_t restart_at = 0;
  jwsim_ns_t boot = 0;          // instante del último arranque del ESP32
  jwsim_cost_model costs{};
  uint64_t trace_hash = 1469598103934665603ULL;
  uint64_t trace_count = 0;
};

// Costos por defecto (ESP32 @240 MHz, orden de magnitud). Se calibran en G1.
constexpr jwsim_cost_model DEFAULT_COSTS = {
    /*task_yield*/ 2 * JWSIM_NS_PER_US,
    /*gpio_access*/ 100,
    /*millis_call*/ 50,
    /*hal_call*/ 100,
    /*sem_op*/ 200,
};

// S() se llama en cada operación del firmware: tras la primera vez es una
// lectura de puntero que el compilador integra.
Sched *g_sched = nullptr;

__attribute__((noinline)) Sched &S_init() {
  static Sched s = [] {
    Sched init;
    init.costs = DEFAULT_COSTS;
    return init;
  }();
  g_sched = &s;
  return s;
}

inline Sched &S() { return __builtin_expect(g_sched != nullptr, 1) ? *g_sched : S_init(); }

bool event_after(const Event &a, const Event &b) {
  if (a.when != b.when) return a.when > b.when;
  if (a.external != b.external) return a.external > b.external;
  return a.seq > b.seq;
}

// Los ticks de FreeRTOS cuentan desde el arranque (boot es múltiplo del tick).
jwsim_ns_t tick_to_ns(uint32_t tick) { return S().boot + static_cast<jwsim_ns_t>(tick) * JWSIM_TICK_NS; }

void make_ready(jwsim_task *t, jwsim_ns_t at) {
  t->state = State::Ready;
  t->ready_at = at;
  t->wake_at = JWSIM_NS_FOREVER;
  t->seq = S().next_seq++;
}

void remove_from_waitq(jwsim_task *t) {
  if (!t->waiting_on) return;
  auto &w = t->waiting_on->waiters;
  w.erase(std::remove(w.begin(), w.end(), t), w.end());
  t->waiting_on = nullptr;
}

// Próxima actividad del núcleo c (sin modificar estado).
jwsim_ns_t next_activity(int c) {
  Sched &s = S();
  const jwsim_ns_t now = s.cores[c].t;
  jwsim_ns_t best = JWSIM_NS_FOREVER;
  for (jwsim_task *t : s.tasks) {
    if (t->core != c) continue;
    jwsim_ns_t at = JWSIM_NS_FOREVER;
    if (t->state == State::Ready) at = std::max(t->ready_at, now);
    else if (t->state == State::Blocked) at = std::max(t->wake_at, now);
    best = std::min(best, at);
  }
  return best;
}

void expire_timeouts(int c) {
  Sched &s = S();
  const jwsim_ns_t now = s.cores[c].t;
  for (jwsim_task *t : s.tasks) {
    if (t->core == c && t->state == State::Blocked && t->wake_at <= now) {
      remove_from_waitq(t);
      t->signaled = false;
      t->waiting_notify = false;
      const jwsim_ns_t at = t->wake_at;
      make_ready(t, at);
    }
  }
}

jwsim_task *pick(int c) {
  Sched &s = S();
  const jwsim_ns_t now = s.cores[c].t;
  jwsim_task *best = nullptr;
  for (jwsim_task *t : s.tasks) {
    if (t->core != c || t->state != State::Ready || t->ready_at > now) continue;
    if (!best || t->priority > best->priority ||
        (t->priority == best->priority && t->seq < best->seq)) {
      best = t;
    }
  }
  return best;
}

// Horizonte del núcleo c para la tarea elegida.
jwsim_ns_t compute_horizon(int c, jwsim_task *chosen, jwsim_ns_t until) {
  Sched &s = S();
  jwsim_ns_t h = until;
  if (!s.events.empty()) h = std::min(h, s.events.front().when);
  for (int o = 0; o < JWSIM_NUM_CORES; ++o) {
    if (o == c) continue;
    const jwsim_ns_t na = next_activity(o);
    if (na != JWSIM_NS_FOREVER) h = std::min(h, na + QUANTUM);
  }
  bool equal_ready = false;
  for (jwsim_task *t : s.tasks) {
    if (t == chosen || t->core != c) continue;
    if (t->state == State::Blocked && t->priority > chosen->priority) h = std::min(h, t->wake_at);
    if (t->state == State::Ready && t->priority > chosen->priority) h = std::min(h, t->ready_at);
    if (t->state == State::Ready && t->priority == chosen->priority) {
      if (t->ready_at <= s.cores[c].t) equal_ready = true;
      else h = std::min(h, t->ready_at);
    }
  }
  if (equal_ready) {
    // Rotación por tiempo (configUSE_TIME_SLICING): hasta el próximo tick.
    const jwsim_ns_t next_tick = (s.cores[c].t / JWSIM_TICK_NS + 1) * JWSIM_TICK_NS;
    h = std::min(h, next_tick);
  }
  return h;
}

// Depuración: JWSIM_TRACE_TASK=<nombre> y JWSIM_TRACE_BT=1 imprimen la pila
// de la tarea en cada bloqueo (solo glibc).
void debug_backtrace(const jwsim_task *self) {
#if defined(__GLIBC__)
  static const char *trace_task = std::getenv("JWSIM_TRACE_TASK");
  static const bool bt = std::getenv("JWSIM_TRACE_BT") != nullptr;
  if (!bt || !trace_task || self->name != trace_task || self->state == State::Ready) return;
  void *frames[24];
  const int n = backtrace(frames, 24);
  std::fprintf(stderr, "[sched] %s se bloquea en t=%.3f ms:\n", self->name.c_str(),
               static_cast<double>(S().cores[self->core].t) / 1e6);
  backtrace_symbols_fd(frames + 2, n - 2, 2);
#else
  (void)self;
#endif
}

// Vuelve al planificador desde la tarea actual.
void to_scheduler() {
  Sched &s = S();
  jwsim_task *self = s.running;
  if (!self) jwsim_fatal("punto de sincronización fuera de una tarea");
  debug_backtrace(self);
  jwsim::fiber_switch(self->fiber, s.main_fiber);
}

void task_entry(void *arg) {
  jwsim_task *t = static_cast<jwsim_task *>(arg);
  t->fn(t->arg);
  // En ESP-IDF retornar de una tarea es un error; aquí se borra con aviso.
  std::fprintf(stderr, "[jwsim] aviso: la tarea '%s' retornó; se elimina\n", t->name.c_str());
  jwsim_task_delete(nullptr);
}

void free_graveyard() {
  Sched &s = S();
  for (jwsim_task *t : s.graveyard) {
    if (t->fiber) jwsim::fiber_destroy(t->fiber);
    delete t;
  }
  s.graveyard.clear();
}

// Ejecuta las interrupciones pendientes en el contexto del planificador, en
// el instante en que fueron levantadas (o en el reloj del núcleo si va
// adelantado). Equivale a la ISR apropiando a la tarea del núcleo dueño.
// Salida de una ISR que no vuelve (esp_restart() desde una interrupción):
// __builtin_longjmp regresa al despacho sin desenrollar con SEH (MinGW).
void *g_isr_exit[5];
bool g_isr_exit_armed = false;

void run_pending_isrs() {
  Sched &s = S();
  for (size_t i = 0; i < s.isrs.size(); ++i) {
    const Isr isr = s.isrs[i];
    Core &c = s.cores[isr.core];
    c.t = std::max(c.t, isr.at);
    s.in_isr = true;
    s.isr_now = c.t;
    if (__builtin_setjmp(g_isr_exit) == 0) {
      g_isr_exit_armed = true;
      isr.fn(isr.arg);
    }
    g_isr_exit_armed = false;
    s.in_isr = false;
    if (s.restart_requested) break;
  }
  s.isrs.clear();
}

// ---------------------------------------------------------------- vigilante
// Detecta, en tiempo de pared, código que no llega a ningún punto de
// sincronización (p. ej. while(1){} sin llamadas al HAL): en el ESP32 el
// tick lo apropiaría, aquí el tiempo virtual quedaría detenido.
std::atomic<uint64_t> g_progress{0};
// Solo el hilo del motor lo incrementa (el vigilante solo lo lee): sin
// instrucción atómica de lectura-modificación-escritura.
inline void progress() { g_progress.store(g_progress.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed); }
std::atomic<const char *> g_running_name{nullptr};
std::atomic<bool> g_in_run{false};
std::atomic<bool> g_watchdog_hold{false};

void start_watchdog() {
  static bool started = false;
  if (started) return;
  started = true;
  const char *env = std::getenv("JWSIM_WATCHDOG_MS");
  const long limit_ms = env ? std::atol(env) : 2000;
  if (limit_ms <= 0) return;
  std::thread([limit_ms] {
    uint64_t last = g_progress.load();
    auto since = std::chrono::steady_clock::now();
    auto prev = since;
    for (;;) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
      const uint64_t now = g_progress.load(std::memory_order_relaxed);
      const auto t = std::chrono::steady_clock::now();
      // Un salto grande entre vueltas significa que el proceso entero estuvo
      // detenido (depurador en un breakpoint, equipo suspendido): ese lapso
      // no es tiempo de la tarea.
      const bool suspended = t - prev > std::chrono::seconds(1);
      prev = t;
      if (now != last || !g_in_run.load() || suspended || g_watchdog_hold.load()) {
        last = now;
        since = t;
        continue;
      }
      if (t - since >= std::chrono::milliseconds(limit_ms)) {
        const char *name = g_running_name.load();
        std::fprintf(stderr,
                     "[jwsim] FATAL: la tarea '%s' lleva %ld ms de reloj real sin llegar a ningún punto de "
                     "sincronización (bucle sin llamadas a delay/yield/HAL). En el ESP32 la apropiaría el "
                     "tick; en el simulador el tiempo virtual quedaría detenido. Agregue delay(), yield() o "
                     "una llamada al HAL dentro del bucle.\n",
                     name ? name : "?", limit_ms);
        std::fflush(stderr);
        std::_Exit(70);
      }
    }
  }).detach();
}

void fire_event() {
  Sched &s = S();
  std::pop_heap(s.events.begin(), s.events.end(), event_after);
  Event e = s.events.back();
  s.events.pop_back();
  s.in_event = true;
  s.event_now = e.when;
  e.fn(e.arg, e.when);
  s.in_event = false;
}

} // namespace

extern "C" {

jwsim_ns_t jwsim_now(void) {
  Sched &s = S();
  if (s.running) return s.cores[s.running_core].t;
  if (s.in_isr) return s.isr_now;
  if (s.in_event) return s.event_now;
  jwsim_ns_t m = JWSIM_NS_FOREVER;
  for (const Core &c : s.cores) m = std::min(m, c.t);
  return m;
}

uint32_t jwsim_tick_count(void) { return static_cast<uint32_t>((jwsim_now() - S().boot) / JWSIM_TICK_NS); }

jwsim_ns_t jwsim_boot_ns(void) { return S().boot; }

void jwsim_set_boot(jwsim_ns_t boot, uint64_t trace_hash, uint64_t trace_count) {
  Sched &s = S();
  if (boot % JWSIM_TICK_NS) jwsim_fatal("jwsim_set_boot: el arranque debe caer en un tick");
  s.boot = boot;
  for (Core &c : s.cores) c.t = std::max(c.t, boot);
  s.trace_hash = trace_hash;
  s.trace_count = trace_count;
}

void jwsim_request_restart(void) {
  Sched &s = S();
  if (!s.restart_requested) s.restart_at = jwsim_now();
  s.restart_requested = true;
  s.stop_requested = true;
  // Ninguna instrucción más del firmware: la ISR o la tarea que pidió el
  // reinicio no continúa y jwsim_run() vuelve en cuanto recupera el control.
  if (jwsim_in_isr() && g_isr_exit_armed) __builtin_longjmp(g_isr_exit, 1);
  if (s.running && !jwsim_in_isr()) jwsim_task_suspend(nullptr);
}

bool jwsim_restart_pending(void) { return S().restart_requested; }

jwsim_ns_t jwsim_restart_time(void) {
  // Los núcleos ociosos quedaron atrás: el reinicio ocurre para todos en el
  // instante del núcleo que lo pidió.
  Sched &s = S();
  for (Core &c : s.cores) c.t = std::max(c.t, s.restart_at);
  return s.restart_at;
}

jwsim_cost_model *jwsim_costs(void) { return &S().costs; }

void jwsim_cpu(jwsim_ns_t ns) {
  Sched &s = S();
  if (!s.running) return;   // fuera de tareas (eventos, arranque): sin costo
  Core &core = s.cores[s.running_core];
  core.t += ns;
  s.running->cpu_ns += ns;
  progress();
  if (core.t >= core.horizon && s.lock_depth == 0) to_scheduler();
}

void jwsim_isr_raise(int core, jwsim_isr_fn fn, void *arg) {
  Sched &s = S();
  if (core < 0 || core >= JWSIM_NUM_CORES) core = 0;
  s.isrs.push_back(Isr{jwsim_now(), core, fn, arg});
  // La tarea en curso del núcleo dueño cede en su próximo punto de
  // sincronización (si no está dentro de una sección crítica).
  if (s.running) s.cores[s.running_core].horizon = s.cores[s.running_core].t;
}

bool jwsim_in_isr(void) { return S().in_isr; }

void jwsim_wait(jwsim_ns_t ns) {
  Sched &s = S();
  if (!s.running) return;
  jwsim_task *self = s.running;
  self->state = State::Blocked;
  self->wake_at = s.cores[s.running_core].t + ns;
  to_scheduler();
}

jwsim_task *jwsim_task_create(jwsim_task_fn fn, void *arg, const char *name,
                              size_t stack_bytes, unsigned priority, int core) {
  Sched &s = S();
  jwsim_task *t = new jwsim_task();
  t->id = s.next_id++;
  t->name = name ? name : "";
  t->priority = std::min<unsigned>(priority, JWSIM_MAX_PRIORITIES - 1);
  // Sin afinidad: se ancla al núcleo 0 (regla fija y documentada).
  t->core = (core >= 0 && core < JWSIM_NUM_CORES) ? core : 0;
  t->fn = fn;
  t->arg = arg;
  t->fiber = jwsim::fiber_create(std::max(stack_bytes * 8, MIN_HOST_STACK), task_entry, t);
  make_ready(t, jwsim_now());
  s.tasks.push_back(t);
  // Una tarea de mayor prioridad en el mismo núcleo apropia a la creadora.
  if (s.running && s.running_core == t->core && t->priority > s.running->priority) {
    s.cores[s.running_core].horizon = s.cores[s.running_core].t;
    jwsim_cpu(0);
  }
  return t;
}

void jwsim_task_delete(jwsim_task *task) {
  Sched &s = S();
  if (!task) task = s.running;
  if (!task || task->state == State::Deleted) return;
  remove_from_waitq(task);
  task->state = State::Deleted;
  s.tasks.erase(std::remove(s.tasks.begin(), s.tasks.end(), task), s.tasks.end());
  s.graveyard.push_back(task);
  if (task == s.running) {
    to_scheduler();
    jwsim_fatal("tarea borrada volvió a ejecutarse");
  }
}

jwsim_task *jwsim_task_self(void) { return S().running; }
const char *jwsim_task_name(const jwsim_task *t) { return t ? t->name.c_str() : "main"; }
unsigned jwsim_task_priority(const jwsim_task *t) { return t ? t->priority : 0; }
void jwsim_task_set_priority(jwsim_task *t, unsigned p) {
  if (!t) t = S().running;
  if (t) t->priority = std::min<unsigned>(p, JWSIM_MAX_PRIORITIES - 1);
}
int jwsim_task_core(const jwsim_task *t) { return t ? t->core : 0; }
int jwsim_current_core(void) { return S().running ? S().running_core : 0; }

void jwsim_task_suspend(jwsim_task *t) {
  Sched &s = S();
  if (!t) t = s.running;
  if (!t || t->state == State::Deleted) return;
  remove_from_waitq(t);
  t->state = State::Suspended;
  if (t == s.running) to_scheduler();
}

void jwsim_task_resume(jwsim_task *t) {
  if (t && t->state == State::Suspended) make_ready(t, jwsim_now());
}

void jwsim_task_sleep_until_tick(uint32_t tick) {
  Sched &s = S();
  if (!s.running) return;
  const jwsim_ns_t at = tick_to_ns(tick);
  if (at <= s.cores[s.running_core].t) {
    jwsim_task_yield();
    return;
  }
  s.running->state = State::Blocked;
  s.running->wake_at = at;
  to_scheduler();
}

void jwsim_task_yield(void) {
  Sched &s = S();
  if (!s.running) return;
  Core &core = s.cores[s.running_core];
  core.t += s.costs.task_yield;
  s.running->cpu_ns += s.costs.task_yield;
  progress();
  if (s.lock_depth) return;
  // Atajo: si ninguna otra tarea del núcleo con prioridad >= puede correr
  // ahora y no se alcanzó el horizonte, ceder no cambia nada.
  if (core.t < core.horizon) {
    bool competitor = false;
    for (const jwsim_task *t : s.tasks) {
      if (t != s.running && t->core == s.running_core && t->state == State::Ready &&
          t->ready_at <= core.t && t->priority >= s.running->priority) {
        competitor = true;
        break;
      }
    }
    if (!competitor) return;
  }
  // Pasa al final de la fila de su prioridad.
  s.running->seq = s.next_seq++;
  to_scheduler();
}

void jwsim_sched_lock(void) { ++S().lock_depth; }
void jwsim_sched_unlock(void) {
  Sched &s = S();
  if (s.lock_depth > 0 && --s.lock_depth == 0) jwsim_cpu(0);
}

jwsim_waitq *jwsim_waitq_new(void) { return new jwsim_waitq(); }

void jwsim_waitq_free(jwsim_waitq *q) {
  if (!q) return;
  for (jwsim_task *t : q->waiters) {
    t->waiting_on = nullptr;
    make_ready(t, jwsim_now());
  }
  delete q;
}

bool jwsim_waitq_block(jwsim_waitq *q, jwsim_ns_t timeout_ns) {
  Sched &s = S();
  jwsim_task *self = s.running;
  if (!self) jwsim_fatal(s.in_isr ? "operación bloqueante dentro de una ISR" : "bloqueo fuera de una tarea");
  if (timeout_ns == 0) return false;
  self->state = State::Blocked;
  self->signaled = false;
  self->waiting_on = q;
  self->wake_at = (timeout_ns == JWSIM_NS_FOREVER) ? JWSIM_NS_FOREVER
                                                    : s.cores[s.running_core].t + timeout_ns;
  q->waiters.push_back(self);
  to_scheduler();
  return self->signaled;
}

bool jwsim_waitq_wake_one(jwsim_waitq *q) {
  if (!q || q->waiters.empty()) return false;
  // Mayor prioridad; FIFO entre iguales (orden de llegada en el vector).
  auto it = std::max_element(q->waiters.begin(), q->waiters.end(),
                             [](const jwsim_task *a, const jwsim_task *b) {
                               return a->priority < b->priority;
                             });
  unsigned top = (*it)->priority;
  it = std::find_if(q->waiters.begin(), q->waiters.end(),
                    [top](const jwsim_task *t) { return t->priority == top; });
  jwsim_task *t = *it;
  q->waiters.erase(it);
  t->waiting_on = nullptr;
  t->signaled = true;
  make_ready(t, jwsim_now());
  Sched &s = S();
  if (s.running && s.running_core == t->core && t->priority > s.running->priority) {
    s.cores[s.running_core].horizon = s.cores[s.running_core].t;   // apropiación
  }
  return true;
}

void jwsim_waitq_wake_all(jwsim_waitq *q) {
  while (jwsim_waitq_wake_one(q)) {
  }
}

bool jwsim_waitq_empty(const jwsim_waitq *q) { return !q || q->waiters.empty(); }

bool jwsim_task_notify_wait(uint32_t *value_out, uint32_t clear_on_entry,
                            uint32_t clear_on_exit, jwsim_ns_t timeout_ns) {
  Sched &s = S();
  jwsim_task *self = s.running;
  if (!self) return false;
  if (!self->notify_pending) {
    self->notify_value &= ~clear_on_entry;
    if (timeout_ns != 0) {
      self->state = State::Blocked;
      self->waiting_notify = true;
      self->signaled = false;
      self->wake_at = (timeout_ns == JWSIM_NS_FOREVER) ? JWSIM_NS_FOREVER
                                                        : s.cores[s.running_core].t + timeout_ns;
      to_scheduler();
    }
  }
  if (value_out) *value_out = self->notify_value;
  const bool got = self->notify_pending;
  if (got) self->notify_value &= ~clear_on_exit;
  self->notify_pending = false;
  return got;
}

// action: 0 = sin acción, 1 = OR de bits, 2 = incrementar, 3 = sobrescribir.
void jwsim_task_notify(jwsim_task *t, uint32_t value, int action, uint32_t *prev) {
  if (!t) return;
  if (prev) *prev = t->notify_value;
  switch (action) {
    case 1: t->notify_value |= value; break;
    case 2: t->notify_value += 1; break;
    case 3: t->notify_value = value; break;
    default: break;
  }
  t->notify_pending = true;
  if (t->state == State::Blocked && t->waiting_notify) {
    t->waiting_notify = false;
    t->signaled = true;
    make_ready(t, jwsim_now());
  }
}

static void schedule_event(jwsim_ns_t when, int external, jwsim_event_fn fn, void *arg) {
  Sched &s = S();
  s.events.push_back(Event{when, external, s.next_event_seq++, fn, arg});
  std::push_heap(s.events.begin(), s.events.end(), event_after);
  if (s.running) {
    Core &core = s.cores[s.running_core];
    core.horizon = std::min(core.horizon, when);
  }
}

void jwsim_schedule_event(jwsim_ns_t when, jwsim_event_fn fn, void *arg) { schedule_event(when, 0, fn, arg); }

void jwsim_schedule_external_event(jwsim_ns_t when, jwsim_event_fn fn, void *arg) {
  schedule_event(when, 1, fn, arg);
}

void jwsim_watchdog_hold(int on) { g_watchdog_hold = on != 0; }

void jwsim_request_stop(void) {
  Sched &s = S();
  s.stop_requested = true;
  if (s.running) s.cores[s.running_core].horizon = s.cores[s.running_core].t;
}

jwsim_stop_reason jwsim_run(const jwsim_run_limits *limits) {
  Sched &s = S();
  if (!s.main_fiber) s.main_fiber = jwsim::fiber_from_thread();
  const jwsim_ns_t until = limits ? limits->until_ns : JWSIM_NS_FOREVER;
  s.stop_requested = false;
  start_watchdog();
  g_in_run = true;
  struct RunFlag {
    ~RunFlag() { g_in_run = false; }
  } run_flag;

  for (;;) {
    free_graveyard();
    if (!s.isrs.empty()) run_pending_isrs();
    if (s.stop_requested) return JWSIM_STOP_REQUEST;

    jwsim_ns_t na[JWSIM_NUM_CORES];
    int best = -1;
    for (int c = 0; c < JWSIM_NUM_CORES; ++c) {
      na[c] = next_activity(c);
      if (best < 0 || na[c] < na[best]) best = c;
    }
    const jwsim_ns_t m = na[best];
    const jwsim_ns_t ev = s.events.empty() ? JWSIM_NS_FOREVER : s.events.front().when;

    if (ev != JWSIM_NS_FOREVER && ev <= m && ev <= until) {
      fire_event();
      continue;
    }
    if (m == JWSIM_NS_FOREVER || m >= until) {
      // Los núcleos ociosos avanzan hasta el límite: el tiempo es continuo
      // entre llamadas sucesivas a jwsim_run().
      if (until != JWSIM_NS_FOREVER) {
        for (Core &c : s.cores) c.t = std::max(c.t, until);
      }
      return (m == JWSIM_NS_FOREVER && until == JWSIM_NS_FOREVER) ? JWSIM_STOP_IDLE
                                                                    : JWSIM_STOP_TIME;
    }

    Core &core = s.cores[best];
    core.t = std::max(core.t, m);
    expire_timeouts(best);
    jwsim_task *t = pick(best);
    if (!t) continue;

    const uint32_t tick = static_cast<uint32_t>(core.t / JWSIM_TICK_NS);
    if (core.current != t) core.slice_tick = tick;
    core.current = t;
    core.horizon = compute_horizon(best, t, until);
    if (core.horizon <= core.t) core.horizon = core.t + 1;   // progreso mínimo

    ++t->dispatches;
    static const char *trace_task = std::getenv("JWSIM_TRACE_TASK");
    if (trace_task && t->name == trace_task) {
      std::fprintf(stderr, "[sched] t=%.3f ms core=%d -> %s\n", static_cast<double>(core.t) / 1e6, best, t->name.c_str());
    }
    s.running = t;
    s.running_core = best;
    g_running_name.store(t->name.c_str());
    progress();
    jwsim::fiber_switch(s.main_fiber, t->fiber);
    s.running = nullptr;
    s.running_core = -1;
    if (core.current && core.current->state != State::Ready) {
      core.current = nullptr;
    } else if (core.current && core.t / JWSIM_TICK_NS != core.slice_tick) {
      // Rotación por tick entre tareas de igual prioridad.
      core.current->seq = s.next_seq++;
      core.slice_tick = static_cast<uint32_t>(core.t / JWSIM_TICK_NS);
    }
  }
}

void jwsim_print_task_stats(FILE *out) {
  Sched &s = S();
  std::fprintf(out, "%-18s %4s %4s %14s %12s\n", "tarea", "prio", "core", "cpu_virtual_ms", "despachos");
  for (const jwsim_task *t : s.tasks) {
    std::fprintf(out, "%-18s %4u %4d %14.3f %12llu\n", t->name.c_str(), t->priority, t->core,
                 static_cast<double>(t->cpu_ns) / 1e6, static_cast<unsigned long long>(t->dispatches));
  }
}

void jwsim_trace_bytes(const void *data, size_t len) {
  Sched &s = S();
  const unsigned char *p = static_cast<const unsigned char *>(data);
  for (size_t i = 0; i < len; ++i) {
    s.trace_hash ^= p[i];
    s.trace_hash *= 1099511628211ULL;
  }
  ++s.trace_count;
}

void jwsim_trace_u64(uint64_t v) {
  unsigned char b[8];
  for (int i = 0; i < 8; ++i) b[i] = static_cast<unsigned char>(v >> (8 * i));
  jwsim_trace_bytes(b, sizeof(b));
}

uint64_t jwsim_trace_hash(void) { return S().trace_hash; }
uint64_t jwsim_trace_count(void) { return S().trace_count; }

static void (*g_fatal_hook)(void) = nullptr;

void jwsim_set_fatal_hook(void (*hook)(void)) { g_fatal_hook = hook; }

void jwsim_fatal(const char *fmt, ...) {
  std::fprintf(stderr, "[jwsim] FATAL: ");
  va_list ap;
  va_start(ap, fmt);
  std::vfprintf(stderr, fmt, ap);
  va_end(ap);
  std::fprintf(stderr, "\n");
  std::fflush(stderr);
  // Una sola vez: si el gancho falla, no se vuelve a entrar.
  if (void (*hook)(void) = g_fatal_hook) {
    g_fatal_hook = nullptr;
    hook();
  }
  std::abort();
}

} // extern "C"
