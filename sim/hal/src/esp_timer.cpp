// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// esp_timer de ESP-IDF v5 sobre el tiempo virtual (gate JWSIM_G4_HAL_EXTRAS).
//
// Como en el ESP32: un temporizador de hardware levanta una interrupción en
// el núcleo 0 al vencer la alarma más próxima; los callbacks ESP_TIMER_ISR
// corren en esa ISR y los ESP_TIMER_TASK en la tarea "esp_timer" (prioridad
// 22, núcleo 0), en orden de vencimiento. Los periódicos se reprograman sobre
// la alarma anterior (sin deriva); con skip_unhandled_events, las alarmas ya
// pasadas se saltan en lugar de repetirse. La tarea se crea con el primer
// timer (en el ESP32 existe desde el arranque, pero sin timers no corre).
// esp_timer_get_time() cuenta desde el último arranque.
#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>

#include "esp_timer.h"
#include "jwsim/engine.h"

struct esp_timer {
  esp_timer_cb_t callback = nullptr;
  void *arg = nullptr;
  esp_timer_dispatch_t dispatch = ESP_TIMER_TASK;
  std::string name;
  bool skip_unhandled = false;
  bool armed = false;         // activo (once o periódico)
  bool pending = false;       // vencido, esperando a la tarea esp_timer
  jwsim_ns_t alarm = 0;       // instante absoluto de la próxima alarma
  jwsim_ns_t period = 0;      // 0 = una sola vez
  uint64_t seq = 0;           // orden de armado entre alarmas iguales
  uint64_t runs = 0;
};

namespace {

constexpr unsigned kTaskPriority = 22;   // ESP_TASK_TIMER_PRIO
constexpr int kTaskCore = 0;             // CONFIG_ESP_TIMER_TASK_AFFINITY_CPU0
constexpr size_t kTaskStack = 3584;      // CONFIG_ESP_TIMER_TASK_STACK_SIZE

std::vector<esp_timer *> g_timers;       // creados, en orden de creación
jwsim_task *g_task = nullptr;
jwsim_ns_t g_event_at = JWSIM_NS_FOREVER;   // alarma de hardware programada
uint64_t g_seq = 0;

bool earlier(const esp_timer *a, const esp_timer *b) {
  return a->alarm != b->alarm ? a->alarm < b->alarm : a->seq < b->seq;
}

esp_timer *next_armed() {
  esp_timer *best = nullptr;
  for (esp_timer *t : g_timers) {
    if (t->armed && !t->pending && (!best || earlier(t, best))) best = t;
  }
  return best;
}

void program_alarm();

// Avanza un periódico tras vencer (o lo desarma si es de una vez).
void rearm(esp_timer *t, jwsim_ns_t now) {
  if (!t->period) {
    t->armed = false;
    return;
  }
  t->alarm += t->period;
  if (t->skip_unhandled && t->alarm <= now) t->alarm = now + t->period;
  t->seq = ++g_seq;
}

// ISR de la alarma (núcleo 0).
void alarm_isr(void *) {
  const jwsim_ns_t now = jwsim_now();
  bool wake_task = false;
  for (;;) {
    esp_timer *t = next_armed();
    if (!t || t->alarm > now) break;
    if (t->dispatch == ESP_TIMER_ISR) {
      ++t->runs;
      rearm(t, now);
      t->callback(t->arg);
    } else {
      t->pending = true;
      wake_task = true;
    }
  }
  if (wake_task && g_task) jwsim_task_notify(g_task, 0, 2, nullptr);
  program_alarm();
}

void alarm_event(void *, jwsim_ns_t when) {
  if (when != g_event_at) return;   // alarma reemplazada por una anterior
  g_event_at = JWSIM_NS_FOREVER;
  jwsim_isr_raise(kTaskCore, alarm_isr, nullptr);
}

void program_alarm() {
  const esp_timer *t = next_armed();
  if (!t) return;
  const jwsim_ns_t at = std::max(t->alarm, jwsim_now());
  if (at >= g_event_at) return;
  g_event_at = at;
  jwsim_schedule_event(at, alarm_event, nullptr);
}

void timer_task(void *) {
  for (;;) {
    jwsim_task_notify_wait(nullptr, 0, ~0u, JWSIM_NS_FOREVER);
    // Vencidos en orden de alarma; un callback puede parar o rearmar otros.
    for (;;) {
      esp_timer *t = nullptr;
      for (esp_timer *c : g_timers) {
        if (c->pending && (!t || earlier(c, t))) t = c;
      }
      if (!t) break;
      t->pending = false;
      ++t->runs;
      rearm(t, jwsim_now());
      jwsim_cpu(jwsim_costs()->hal_call);
      t->callback(t->arg);
    }
    program_alarm();
  }
}

bool valid(esp_timer_handle_t t) { return t && std::find(g_timers.begin(), g_timers.end(), t) != g_timers.end(); }

esp_err_t arm(esp_timer_handle_t t, uint64_t us, bool periodic) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->armed) return ESP_ERR_INVALID_STATE;
  if (periodic && us < 50) us = 50;   // esp_timer_impl_get_min_period_us() en ESP32
  t->armed = true;
  t->pending = false;
  t->alarm = jwsim_now() + us * JWSIM_NS_PER_US;
  t->period = periodic ? us * JWSIM_NS_PER_US : 0;
  t->seq = ++g_seq;
  program_alarm();
  return ESP_OK;
}

} // namespace

extern "C" {

int64_t esp_timer_get_time(void) { return static_cast<int64_t>((jwsim_now() - jwsim_boot_ns()) / JWSIM_NS_PER_US); }

esp_err_t esp_timer_create(const esp_timer_create_args_t *args, esp_timer_handle_t *out) {
  if (!args || !args->callback || !out || args->dispatch_method >= ESP_TIMER_MAX) return ESP_ERR_INVALID_ARG;
  auto *t = new esp_timer;
  t->callback = args->callback;
  t->arg = args->arg;
  t->dispatch = args->dispatch_method;
  t->name = args->name ? args->name : "";
  t->skip_unhandled = args->skip_unhandled_events;
  g_timers.push_back(t);
  if (!g_task) g_task = jwsim_task_create(timer_task, nullptr, "esp_timer", kTaskStack, kTaskPriority, kTaskCore);
  *out = t;
  return ESP_OK;
}

esp_err_t esp_timer_start_once(esp_timer_handle_t t, uint64_t timeout_us) { return arm(t, timeout_us, false); }
esp_err_t esp_timer_start_periodic(esp_timer_handle_t t, uint64_t period_us) { return arm(t, period_us, true); }

esp_err_t esp_timer_restart(esp_timer_handle_t t, uint64_t timeout_us) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (!t->armed) return ESP_ERR_INVALID_STATE;
  const bool periodic = t->period != 0;
  t->armed = false;
  return arm(t, timeout_us, periodic);
}

esp_err_t esp_timer_stop(esp_timer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (!t->armed) return ESP_ERR_INVALID_STATE;
  t->armed = false;
  t->pending = false;
  return ESP_OK;
}

esp_err_t esp_timer_delete(esp_timer_handle_t t) {
  if (!t) return ESP_ERR_INVALID_ARG;
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->armed) return ESP_ERR_INVALID_STATE;
  g_timers.erase(std::find(g_timers.begin(), g_timers.end(), t));
  delete t;
  return ESP_OK;
}

bool esp_timer_is_active(esp_timer_handle_t t) { return valid(t) && t->armed; }

esp_err_t esp_timer_get_period(esp_timer_handle_t t, uint64_t *period) {
  if (!valid(t) || !period) return ESP_ERR_INVALID_ARG;
  *period = t->period / JWSIM_NS_PER_US;
  return ESP_OK;
}

esp_err_t esp_timer_get_expiry_time(esp_timer_handle_t t, uint64_t *expiry) {
  if (!valid(t) || !expiry) return ESP_ERR_INVALID_ARG;
  if (t->period) return ESP_ERR_NOT_SUPPORTED;   // solo para timers de una vez
  if (!t->armed) return ESP_ERR_INVALID_STATE;
  *expiry = (t->alarm - jwsim_boot_ns()) / JWSIM_NS_PER_US;
  return ESP_OK;
}

int64_t esp_timer_get_next_alarm(void) {
  const esp_timer *t = next_armed();
  return t ? static_cast<int64_t>((t->alarm - jwsim_boot_ns()) / JWSIM_NS_PER_US) : INT64_MAX;
}
int64_t esp_timer_get_next_alarm_for_wake_up(void) { return esp_timer_get_next_alarm(); }

esp_err_t esp_timer_dump(FILE *stream) {
  if (!stream) return ESP_ERR_INVALID_ARG;
  std::fprintf(stream, "Timer stats:\nName                  Period      Alarm       Times_armed Times_trigg\n");
  for (const esp_timer *t : g_timers) {
    std::fprintf(stream, "%-20s  %-10llu  %-10lld  %-11d %llu\n", t->name.c_str(),
                 static_cast<unsigned long long>(t->period / JWSIM_NS_PER_US),
                 t->armed ? static_cast<long long>((t->alarm - jwsim_boot_ns()) / JWSIM_NS_PER_US) : 0LL, t->armed ? 1 : 0,
                 static_cast<unsigned long long>(t->runs));
  }
  return ESP_OK;
}

esp_err_t esp_timer_init(void) { return ESP_OK; }
esp_err_t esp_timer_deinit(void) { return ESP_OK; }

} // extern "C"
