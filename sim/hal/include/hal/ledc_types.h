// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos de LEDC (hal/ledc_types.h de ESP-IDF) usados por esp32-hal-ledc.h.
#pragma once
#ifdef __cplusplus
extern "C" {
#endif
typedef enum {
  LEDC_AUTO_CLK = 0,
  LEDC_USE_APB_CLK,
  LEDC_USE_RC_FAST_CLK,
  LEDC_USE_REF_TICK,
} ledc_clk_cfg_t;
#define LEDC_USE_RTC8M_CLK LEDC_USE_RC_FAST_CLK
typedef enum { LEDC_HIGH_SPEED_MODE = 0, LEDC_LOW_SPEED_MODE, LEDC_SPEED_MODE_MAX } ledc_mode_t;
#ifdef __cplusplus
}
#endif
