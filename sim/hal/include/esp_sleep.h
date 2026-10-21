// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <stdint.h>
#include "esp_err.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef enum {
  ESP_SLEEP_WAKEUP_UNDEFINED,
  ESP_SLEEP_WAKEUP_ALL,
  ESP_SLEEP_WAKEUP_EXT0,
  ESP_SLEEP_WAKEUP_EXT1,
  ESP_SLEEP_WAKEUP_TIMER,
  ESP_SLEEP_WAKEUP_TOUCHPAD,
  ESP_SLEEP_WAKEUP_ULP,
  ESP_SLEEP_WAKEUP_GPIO,
  ESP_SLEEP_WAKEUP_UART,
} esp_sleep_wakeup_cause_t;
typedef esp_sleep_wakeup_cause_t esp_sleep_source_t;
esp_err_t esp_sleep_enable_timer_wakeup(uint64_t time_in_us);
void esp_deep_sleep_start(void) __attribute__((noreturn));
esp_err_t esp_light_sleep_start(void);
void esp_deep_sleep(uint64_t time_in_us) __attribute__((noreturn));
esp_sleep_wakeup_cause_t esp_sleep_get_wakeup_cause(void);
#ifdef __cplusplus
}
#endif
