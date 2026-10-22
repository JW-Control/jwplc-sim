// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Driver GPTimer de ESP-IDF v5 (driver/gptimer.h), implementado en
// sim/hal/src/gptimer.cpp. esp32-hal-timer.c del core se compila encima.
#pragma once

#include <stdint.h>

#include "driver/gptimer_types.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  gptimer_clock_source_t clk_src;
  gptimer_count_direction_t direction;
  uint32_t resolution_hz;
  int intr_priority;
  struct {
    uint32_t intr_shared : 1;
    uint32_t allow_pd : 1;
    uint32_t backup_before_sleep : 1;
  } flags;
} gptimer_config_t;

typedef struct {
  gptimer_alarm_cb_t on_alarm;
} gptimer_event_callbacks_t;

typedef struct {
  uint64_t alarm_count;
  uint64_t reload_count;
  struct {
    uint32_t auto_reload_on_alarm : 1;
  } flags;
} gptimer_alarm_config_t;

esp_err_t gptimer_new_timer(const gptimer_config_t *config, gptimer_handle_t *ret_timer);
esp_err_t gptimer_del_timer(gptimer_handle_t timer);
esp_err_t gptimer_set_raw_count(gptimer_handle_t timer, uint64_t value);
esp_err_t gptimer_get_raw_count(gptimer_handle_t timer, uint64_t *value);
esp_err_t gptimer_get_resolution(gptimer_handle_t timer, uint32_t *out_resolution);
esp_err_t gptimer_get_captured_count(gptimer_handle_t timer, uint64_t *value);
esp_err_t gptimer_register_event_callbacks(gptimer_handle_t timer, const gptimer_event_callbacks_t *cbs, void *user_data);
esp_err_t gptimer_set_alarm_action(gptimer_handle_t timer, const gptimer_alarm_config_t *config);
esp_err_t gptimer_enable(gptimer_handle_t timer);
esp_err_t gptimer_disable(gptimer_handle_t timer);
esp_err_t gptimer_start(gptimer_handle_t timer);
esp_err_t gptimer_stop(gptimer_handle_t timer);

#ifdef __cplusplus
}
#endif
