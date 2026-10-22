// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos del driver GPTimer de ESP-IDF v5 (driver/gptimer_types.h).
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "soc/clk_tree_defs.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct gptimer_t *gptimer_handle_t;
typedef soc_periph_gptimer_clk_src_t gptimer_clock_source_t;

typedef enum {
  GPTIMER_COUNT_DOWN,
  GPTIMER_COUNT_UP,
} gptimer_count_direction_t;

typedef struct {
  uint64_t count_value;
  uint64_t alarm_value;
} gptimer_alarm_event_data_t;

typedef bool (*gptimer_alarm_cb_t)(gptimer_handle_t timer, const gptimer_alarm_event_data_t *edata, void *user_ctx);

#ifdef __cplusplus
}
#endif
