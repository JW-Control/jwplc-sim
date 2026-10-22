// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Consulta de frecuencias de reloj (esp_clk_tree.h de ESP-IDF v5).
#pragma once

#include <stdint.h>

#include "esp_err.h"
#include "soc/clk_tree_defs.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  ESP_CLK_TREE_SRC_FREQ_PRECISION_CACHED,
  ESP_CLK_TREE_SRC_FREQ_PRECISION_APPROX,
  ESP_CLK_TREE_SRC_FREQ_PRECISION_EXACT,
  ESP_CLK_TREE_SRC_FREQ_PRECISION_INVALID,
} esp_clk_tree_src_freq_precision_t;

esp_err_t esp_clk_tree_src_get_freq_hz(soc_module_clk_t clk_src, esp_clk_tree_src_freq_precision_t precision,
                                       uint32_t *freq_value);

#ifdef __cplusplus
}
#endif
