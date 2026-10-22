// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Driver GPTimer de ESP-IDF v5 sobre el tiempo virtual (gate
// JWSIM_G4_HAL_EXTRAS). esp32-hal-timer.c del core (timerBegin,
// timerAlarm...) se compila sin cambios encima.
//
// Como en el ESP32: 4 temporizadores (2 grupos × 2) que cuentan hacia arriba
// a 80 MHz / divisor (2..65536); la resolución real es la que da el divisor
// entero. Estados init → enable → run (enable/disable, start/stop) con
// ESP_ERR_INVALID_STATE fuera de orden; los callbacks solo se registran en
// init. La alarma interrumpe al llegar la cuenta al valor de alarma (o de
// inmediato si ya lo pasó); con recarga automática la cuenta vuelve a
// reload_count en ese mismo instante y la alarma sigue armada, sin ella se
// desarma. El callback corre en contexto ISR en el núcleo que habilitó el
// timer. La cuenta se calcula en ticks exactos desde un ancla: las alarmas
// periódicas no acumulan error de redondeo.
#include "driver/gptimer.h"
#include "esp_clk_tree.h"
#include "jwsim/engine.h"

struct gptimer_t {
  bool used = false;
  enum State { Init, Enable, Run } state = Init;
  uint32_t resolution = 0;
  gptimer_alarm_cb_t on_alarm = nullptr;
  void *user = nullptr;
  int core = 0;
  // Alarma.
  bool alarm_on = false;
  uint64_t alarm = 0;
  uint64_t reload = 0;
  bool auto_reload = false;
  // Cuenta: corriendo, raw = raw_base + (U(t) - u_base), con U(t) los ticks
  // enteros desde `anchor`; detenido, raw = raw_base.
  jwsim_ns_t anchor = 0;
  uint64_t raw_base = 0;
  uint64_t u_base = 0;
  // Evento programado (para descartar los que quedaron viejos).
  uint64_t gen = 0;
  jwsim_ns_t event_at = 0;
};

namespace {

constexpr uint32_t kApbHz = 80000000;
gptimer_t g_timers[4];

uint64_t ticks_since_anchor(const gptimer_t &t, jwsim_ns_t now) {
  return static_cast<uint64_t>(static_cast<unsigned __int128>(now - t.anchor) * t.resolution / 1000000000u);
}

jwsim_ns_t time_of_tick(const gptimer_t &t, uint64_t u) {
  // Primer instante en que U(t) >= u.
  const unsigned __int128 ns = static_cast<unsigned __int128>(u) * 1000000000u;
  return t.anchor + static_cast<jwsim_ns_t>((ns + t.resolution - 1) / t.resolution);
}

uint64_t raw_now(const gptimer_t &t) {
  if (t.state != gptimer_t::Run) return t.raw_base;
  return t.raw_base + (ticks_since_anchor(t, jwsim_now()) - t.u_base);
}

// Fija la cuenta en `raw` a partir de ahora.
void rebase(gptimer_t &t, uint64_t raw) {
  t.raw_base = raw;
  t.u_base = t.state == gptimer_t::Run ? ticks_since_anchor(t, jwsim_now()) : 0;
}

void schedule(gptimer_t &t);

void alarm_isr(void *arg) {
  gptimer_t &t = *static_cast<gptimer_t *>(arg);
  if (t.state != gptimer_t::Run || !t.alarm_on) return;
  const uint64_t count = raw_now(t);
  if (count < t.alarm) {   // la alarma cambió después de programar el evento
    schedule(t);
    return;
  }
  gptimer_alarm_event_data_t ed{count, t.alarm};
  if (t.auto_reload) {
    // La cuenta vuelve a reload_count en el tick exacto de la alarma.
    const uint64_t u_alarm = t.u_base + (t.alarm - t.raw_base);
    t.u_base = u_alarm;
    t.raw_base = t.reload;
    ed.count_value = t.alarm;
  } else {
    t.alarm_on = false;
  }
  if (t.on_alarm) t.on_alarm(&t, &ed, t.user);
  schedule(t);
}

void alarm_event(void *arg, jwsim_ns_t when) {
  auto *t = static_cast<gptimer_t *>(arg);
  if (when != t->event_at || !t->used) return;
  t->event_at = 0;
  jwsim_isr_raise(t->core, alarm_isr, t);
}

void schedule(gptimer_t &t) {
  ++t.gen;
  t.event_at = 0;
  if (t.state != gptimer_t::Run || !t.alarm_on) return;
  const uint64_t raw = raw_now(t);
  const jwsim_ns_t now = jwsim_now();
  jwsim_ns_t at = now;
  if (t.alarm > raw) at = time_of_tick(t, t.u_base + (t.alarm - t.raw_base));
  if (at < now) at = now;
  t.event_at = at;
  jwsim_schedule_event(at, alarm_event, &t);
}

bool valid(gptimer_handle_t t) { return t && t >= g_timers && t < g_timers + 4 && t->used; }

} // namespace

extern "C" {

esp_err_t esp_clk_tree_src_get_freq_hz(soc_module_clk_t clk, esp_clk_tree_src_freq_precision_t, uint32_t *hz) {
  if (!hz) return ESP_ERR_INVALID_ARG;
  switch (clk) {
    case SOC_MOD_CLK_APB: *hz = kApbHz; return ESP_OK;
    case SOC_MOD_CLK_CPU: *hz = 240000000; return ESP_OK;
    case SOC_MOD_CLK_XTAL: *hz = 40000000; return ESP_OK;
    case SOC_MOD_CLK_REF_TICK: *hz = 1000000; return ESP_OK;
    case SOC_MOD_CLK_PLL_F160M: *hz = 160000000; return ESP_OK;
    case SOC_MOD_CLK_RTC_SLOW: *hz = 150000; return ESP_OK;
    case SOC_MOD_CLK_RTC_FAST: *hz = 8000000; return ESP_OK;
    default: return ESP_ERR_INVALID_ARG;
  }
}

esp_err_t gptimer_new_timer(const gptimer_config_t *config, gptimer_handle_t *ret) {
  if (!config || !ret || config->resolution_hz == 0) return ESP_ERR_INVALID_ARG;
  if (config->clk_src != GPTIMER_CLK_SRC_APB) return ESP_ERR_INVALID_ARG;
  if (config->direction != GPTIMER_COUNT_UP) return ESP_ERR_NOT_SUPPORTED;   // solo se modela la cuenta ascendente
  const uint32_t prescale = kApbHz / config->resolution_hz;
  if (prescale < 2 || prescale > 65536) return ESP_ERR_INVALID_ARG;
  for (gptimer_t &t : g_timers) {
    if (t.used) continue;
    t = gptimer_t{};
    t.used = true;
    t.resolution = kApbHz / prescale;
    t.core = jwsim_current_core() >= 0 ? jwsim_current_core() : 0;
    *ret = &t;
    return ESP_OK;
  }
  return ESP_ERR_NOT_FOUND;
}

esp_err_t gptimer_del_timer(gptimer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Init) return ESP_ERR_INVALID_STATE;
  t->used = false;
  ++t->gen;
  return ESP_OK;
}

esp_err_t gptimer_set_raw_count(gptimer_handle_t t, uint64_t value) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  rebase(*t, value);
  schedule(*t);
  return ESP_OK;
}

esp_err_t gptimer_get_raw_count(gptimer_handle_t t, uint64_t *value) {
  if (!valid(t) || !value) return ESP_ERR_INVALID_ARG;
  *value = raw_now(*t);
  return ESP_OK;
}

esp_err_t gptimer_get_captured_count(gptimer_handle_t t, uint64_t *value) { return gptimer_get_raw_count(t, value); }

esp_err_t gptimer_get_resolution(gptimer_handle_t t, uint32_t *out) {
  if (!valid(t) || !out) return ESP_ERR_INVALID_ARG;
  *out = t->resolution;
  return ESP_OK;
}

esp_err_t gptimer_register_event_callbacks(gptimer_handle_t t, const gptimer_event_callbacks_t *cbs, void *user) {
  if (!valid(t) || !cbs) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Init) return ESP_ERR_INVALID_STATE;
  t->on_alarm = cbs->on_alarm;
  t->user = user;
  return ESP_OK;
}

esp_err_t gptimer_set_alarm_action(gptimer_handle_t t, const gptimer_alarm_config_t *config) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (config) {
    if (config->flags.auto_reload_on_alarm && config->reload_count == config->alarm_count) return ESP_ERR_INVALID_ARG;
    t->alarm_on = true;
    t->alarm = config->alarm_count;
    t->reload = config->reload_count;
    t->auto_reload = config->flags.auto_reload_on_alarm;
  } else {
    t->alarm_on = false;
    t->auto_reload = false;
  }
  schedule(*t);
  return ESP_OK;
}

esp_err_t gptimer_enable(gptimer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Init) return ESP_ERR_INVALID_STATE;
  t->state = gptimer_t::Enable;
  t->core = jwsim_current_core() >= 0 ? jwsim_current_core() : 0;
  return ESP_OK;
}

esp_err_t gptimer_disable(gptimer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Enable) return ESP_ERR_INVALID_STATE;
  t->state = gptimer_t::Init;
  return ESP_OK;
}

esp_err_t gptimer_start(gptimer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Enable) return ESP_ERR_INVALID_STATE;
  t->state = gptimer_t::Run;
  t->anchor = jwsim_now();
  t->u_base = 0;
  schedule(*t);
  return ESP_OK;
}

esp_err_t gptimer_stop(gptimer_handle_t t) {
  if (!valid(t)) return ESP_ERR_INVALID_ARG;
  if (t->state != gptimer_t::Run) return ESP_ERR_INVALID_STATE;
  t->raw_base = raw_now(*t);
  t->state = gptimer_t::Enable;
  schedule(*t);
  return ESP_OK;
}

} // extern "C"
