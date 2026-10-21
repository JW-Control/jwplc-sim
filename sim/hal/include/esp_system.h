// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <stdint.h>
#include <stdbool.h>
// newlib (toolchain xtensa) expone limits.h a través de stdlib/stdio; glibc no.
#include <limits.h>
#include "esp_err.h"
#include "esp_random.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  ESP_RST_UNKNOWN,
  ESP_RST_POWERON,
  ESP_RST_EXT,
  ESP_RST_SW,
  ESP_RST_PANIC,
  ESP_RST_INT_WDT,
  ESP_RST_TASK_WDT,
  ESP_RST_WDT,
  ESP_RST_DEEPSLEEP,
  ESP_RST_BROWNOUT,
  ESP_RST_SDIO,
} esp_reset_reason_t;

typedef void (*shutdown_handler_t)(void);

void esp_restart(void) __attribute__((noreturn));
esp_reset_reason_t esp_reset_reason(void);
uint32_t esp_get_free_heap_size(void);
uint32_t esp_get_free_internal_heap_size(void);
uint32_t esp_get_minimum_free_heap_size(void);
esp_err_t esp_register_shutdown_handler(shutdown_handler_t handle);
void esp_system_abort(const char *details) __attribute__((noreturn));

#ifdef __cplusplus
}
#endif
