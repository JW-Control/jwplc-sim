// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Fuentes de reloj del ESP32 (subset de soc/esp32/include/soc/clk_tree_defs.h).
#pragma once

typedef enum {
  SOC_MOD_CLK_CPU = 1,
  SOC_MOD_CLK_RTC_FAST,
  SOC_MOD_CLK_RTC_SLOW,
  SOC_MOD_CLK_APB,
  SOC_MOD_CLK_PLL_D2,
  SOC_MOD_CLK_PLL_F160M,
  SOC_MOD_CLK_XTAL32K,
  SOC_MOD_CLK_RC_FAST,
  SOC_MOD_CLK_RC_FAST_D256,
  SOC_MOD_CLK_XTAL,
  SOC_MOD_CLK_REF_TICK,
  SOC_MOD_CLK_APLL,
  SOC_MOD_CLK_INVALID,
} soc_module_clk_t;

// En el ESP32 los GPTimer solo cuentan con el reloj APB (80 MHz).
#define SOC_GPTIMER_CLKS {SOC_MOD_CLK_APB}
typedef enum {
  GPTIMER_CLK_SRC_APB = SOC_MOD_CLK_APB,
  GPTIMER_CLK_SRC_DEFAULT = SOC_MOD_CLK_APB,
} soc_periph_gptimer_clk_src_t;
