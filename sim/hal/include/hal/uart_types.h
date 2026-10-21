// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tipos de UART de ESP-IDF (hal/uart_types.h) usados por HardwareSerial.
#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int uart_port_t;
#define UART_NUM_0 (0)
#define UART_NUM_1 (1)
#define UART_NUM_2 (2)
#define UART_NUM_MAX (3)

typedef enum {
  UART_MODE_UART = 0x00,
  UART_MODE_RS485_HALF_DUPLEX = 0x01,
  UART_MODE_IRDA = 0x02,
  UART_MODE_RS485_COLLISION_DETECT = 0x03,
  UART_MODE_RS485_APP_CTRL = 0x04,
} uart_mode_t;

typedef enum {
  UART_HW_FLOWCTRL_DISABLE = 0x0,
  UART_HW_FLOWCTRL_RTS = 0x1,
  UART_HW_FLOWCTRL_CTS = 0x2,
  UART_HW_FLOWCTRL_CTS_RTS = 0x3,
  UART_HW_FLOWCTRL_MAX = 0x4,
} uart_hw_flowcontrol_t;

typedef enum { UART_DATA_5_BITS = 0, UART_DATA_6_BITS, UART_DATA_7_BITS, UART_DATA_8_BITS, UART_DATA_BITS_MAX } uart_word_length_t;
typedef enum { UART_STOP_BITS_1 = 1, UART_STOP_BITS_1_5 = 2, UART_STOP_BITS_2 = 3, UART_STOP_BITS_MAX } uart_stop_bits_t;
typedef enum { UART_PARITY_DISABLE = 0, UART_PARITY_EVEN = 2, UART_PARITY_ODD = 3 } uart_parity_t;

typedef enum {
  UART_SCLK_APB = 4,
  UART_SCLK_REF_TICK = 5,
  UART_SCLK_DEFAULT = UART_SCLK_APB,
} uart_sclk_t;
typedef uart_sclk_t soc_periph_uart_clk_src_legacy_t;

typedef enum {
  UART_SIGNAL_INV_DISABLE = 0,
  UART_SIGNAL_IRDA_TX_INV = (0x1 << 0),
  UART_SIGNAL_IRDA_RX_INV = (0x1 << 1),
  UART_SIGNAL_RXD_INV = (0x1 << 2),
  UART_SIGNAL_CTS_INV = (0x1 << 3),
  UART_SIGNAL_DSR_INV = (0x1 << 4),
  UART_SIGNAL_TXD_INV = (0x1 << 5),
  UART_SIGNAL_RTS_INV = (0x1 << 6),
  UART_SIGNAL_DTR_INV = (0x1 << 7),
} uart_signal_inv_t;

#ifdef __cplusplus
}
#endif
