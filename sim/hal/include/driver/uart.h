// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Subset de driver/uart.h (ESP-IDF) usado por HardwareSerial::_uartEventTask.
#pragma once

#include <stddef.h>
#include "hal/uart_types.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  UART_DATA,
  UART_BREAK,
  UART_BUFFER_FULL,
  UART_FIFO_OVF,
  UART_FRAME_ERR,
  UART_PARITY_ERR,
  UART_DATA_BREAK,
  UART_PATTERN_DET,
  UART_EVENT_MAX,
} uart_event_type_t;

typedef struct {
  uart_event_type_t type;
  size_t size;
  bool timeout_flag;
} uart_event_t;

#define UART_PIN_NO_CHANGE (-1)

#ifdef __cplusplus
}
#endif
