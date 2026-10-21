// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// UART del ESP32 simulado: reemplaza esp32-hal-uart.c. HardwareSerial.cpp del
// package se compila sin cambios encima de esta API.
//
// TX: los bytes se entregan a la placa (consola para UART0, transceptor RS-485
// para UART2 en G4). RX: buffer alimentado con jwsim::uart_inject().
// La temporización por baudios de RX/TX se modela en G4 (RS485_MULTINODE).
#include <deque>
#include <vector>

#include "esp32-hal-uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"

struct uart_struct_t {
  uint8_t num = 0;
  bool installed = false;
  uint32_t baud = 115200;
  uint32_t config = 0;
  int8_t rx_pin = -1;
  int8_t tx_pin = -1;
  int8_t cts_pin = -1;
  int8_t rts_pin = -1;
  size_t rx_buffer = 256;
  std::deque<uint8_t> rx;
  QueueHandle_t events = nullptr;
};

namespace {

uart_struct_t g_uart[SOC_UART_NUM];
int g_debug_uart = 0;

uart_struct_t *get(uint8_t n) { return n < SOC_UART_NUM ? &g_uart[n] : nullptr; }

int8_t default_rx(uint8_t n) { return n == 0 ? SOC_RX0 : n == 1 ? SOC_RX1 : SOC_RX2; }
int8_t default_tx(uint8_t n) { return n == 0 ? SOC_TX0 : n == 1 ? SOC_TX1 : SOC_TX2; }

} // namespace

namespace jwsim {
void uart_inject(int port, const uint8_t *data, size_t len) {
  uart_struct_t *u = get(static_cast<uint8_t>(port));
  if (!u) return;
  u->rx.insert(u->rx.end(), data, data + len);
  jwsim_trace_bytes(data, len);
}
} // namespace jwsim

extern "C" {

bool _testUartBegin(uint8_t, uint32_t, uint32_t, int8_t, int8_t, uint32_t, uint32_t, bool, uint8_t) { return false; }

uart_t *uartBegin(uint8_t num, uint32_t baud, uint32_t config, int8_t rxPin, int8_t txPin, uint32_t rxBuf,
                  uint32_t, bool, uint8_t) {
  uart_struct_t *u = get(num);
  if (!u) return nullptr;
  u->num = num;
  u->installed = true;
  u->baud = baud;
  u->config = config;
  if (rxPin >= 0) u->rx_pin = rxPin;
  if (txPin >= 0) u->tx_pin = txPin;
  if (u->rx_pin < 0) u->rx_pin = default_rx(num);
  if (u->tx_pin < 0) u->tx_pin = default_tx(num);
  u->rx_buffer = rxBuf;
  return u;
}

void uartEnd(uint8_t num) {
  if (uart_struct_t *u = get(num)) {
    u->installed = false;
    u->rx.clear();
  }
}

void uartGetEventQueue(uart_t *, QueueHandle_t *q) {
  if (q) *q = nullptr;   // eventos de UART (onReceive) llegan en G4
}

uint32_t uartAvailable(uart_t *u) { return u ? static_cast<uint32_t>(u->rx.size()) : 0; }
uint32_t uartAvailableForWrite(uart_t *u) { return u ? 128 : 0; }

size_t uartReadBytes(uart_t *u, uint8_t *buffer, size_t size, uint32_t) {
  if (!u) return 0;
  size_t n = 0;
  while (n < size && !u->rx.empty()) {
    buffer[n++] = u->rx.front();
    u->rx.pop_front();
  }
  jwsim_cpu(jwsim_costs()->hal_call);
  return n;
}

uint8_t uartRead(uart_t *u) {
  uint8_t c = 0;
  uartReadBytes(u, &c, 1, 0);
  return c;
}

uint8_t uartPeek(uart_t *u) { return (u && !u->rx.empty()) ? u->rx.front() : 0; }

void uartWriteBuf(uart_t *u, const uint8_t *data, size_t len) {
  if (!u || !len) return;
  uint8_t hdr[2] = {'U', u->num};
  jwsim_trace_bytes(hdr, sizeof(hdr));
  jwsim_trace_bytes(data, len);
  jwsim::board().uart_tx(u->num, data, len);
  jwsim_cpu(jwsim_costs()->hal_call);
}

void uartWrite(uart_t *u, uint8_t c) { uartWriteBuf(u, &c, 1); }
void uartFlush(uart_t *) {}
void uartFlushTxOnly(uart_t *, bool) {}
bool uartSetBaudRate(uart_t *u, uint32_t baud) { return u && ((u->baud = baud), true); }
uint32_t uartGetBaudRate(uart_t *u) { return u ? u->baud : 0; }
bool uartPinSignalInversion(uart_t *, uint32_t, bool) { return true; }
bool uartSetRxInvert(uart_t *, bool) { return true; }
bool uartSetTxInvert(uart_t *, bool) { return true; }
bool uartSetCtsInvert(uart_t *, bool) { return true; }
bool uartSetRtsInvert(uart_t *, bool) { return true; }
bool uartSetRxTimeout(uart_t *, uint8_t) { return true; }
bool uartSetRxFIFOFull(uart_t *, uint8_t) { return true; }
void uartSetFastReading(uart_t *) {}
void uartSetDebug(uart_t *u) { g_debug_uart = u ? u->num : -1; }
int uartGetDebug() { return g_debug_uart; }
bool uartIsDriverInstalled(uart_t *u) { return u && u->installed; }

bool uartSetPins(uint8_t num, int8_t rxPin, int8_t txPin, int8_t ctsPin, int8_t rtsPin) {
  uart_struct_t *u = get(num);
  if (!u) return false;
  if (rxPin >= 0) u->rx_pin = rxPin;
  if (txPin >= 0) u->tx_pin = txPin;
  if (ctsPin >= 0) u->cts_pin = ctsPin;
  if (rtsPin >= 0) u->rts_pin = rtsPin;
  return true;
}

int8_t uart_get_RxPin(uint8_t num) { return get(num) ? get(num)->rx_pin : -1; }
int8_t uart_get_TxPin(uint8_t num) { return get(num) ? get(num)->tx_pin : -1; }
bool uartSetHwFlowCtrlMode(uart_t *, uart_hw_flowcontrol_t, uint8_t) { return true; }
bool uartSetMode(uart_t *, uart_mode_t) { return true; }
bool uartSetClockSource(uint8_t, uart_sclk_t) { return true; }
void uartStartDetectBaudrate(uart_t *) {}
unsigned long uartDetectBaudrate(uart_t *u) { return u ? u->baud : 0; }
void uart_internal_loopback(uint8_t, int8_t) {}
void uart_internal_hw_flow_ctrl_loopback(uint8_t, int8_t) {}
void uart_send_break(uint8_t) {}
int uart_send_msg_with_break(uint8_t num, uint8_t *msg, size_t size) {
  uartWriteBuf(get(num), msg, size);
  return 1;
}
uint16_t uart_get_max_rx_timeout(uint8_t) { return 101; }

} // extern "C"
