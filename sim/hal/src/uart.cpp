// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// UART del ESP32 simulado: reemplaza esp32-hal-uart.c. HardwareSerial.cpp del
// package se compila sin cambios encima de esta API.
//
// TX: los bytes se entregan a la placa (consola para UART0, transceptor RS-485
// para UART2). RX: buffer alimentado con jwsim::uart_inject().
//
// Tiempo de carácter (gate JWSIM_G4_RS485_MULTINODE): en UART1 y UART2 cada
// byte ocupa en la línea 1 + datos + paridad + parada bits a la velocidad
// configurada. TX pasa por la FIFO de hardware (128 bytes) más el búfer del
// driver que pidió HardwareSerial (setTxBufferSize): si están llenos,
// escribir espera a que salga el carácter más antiguo; flush() espera el bit
// de parada del último. RX: cada byte que llega desde afuera queda disponible
// al terminar su carácter; lo que excede la FIFO + el búfer de RX se pierde
// (desborde). UART0 (consola) sigue sin tiempo de carácter: así no cambian
// los tiempos de todos los sketches que imprimen.
#include <algorithm>
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
  size_t tx_buffer = 0;
  std::deque<uint8_t> rx;
  QueueHandle_t events = nullptr;
  // Tiempo de carácter (UART1/UART2).
  jwsim_ns_t tx_free_at = 0;           // fin del último carácter encolado
  std::deque<jwsim_ns_t> tx_ends;      // fin de cada carácter aún en la FIFO/búfer
  uint64_t rx_overflow = 0;
};

namespace {

uart_struct_t g_uart[SOC_UART_NUM];
int g_debug_uart = 0;

uart_struct_t *get(uint8_t n) { return n < SOC_UART_NUM ? &g_uart[n] : nullptr; }

constexpr size_t kHwFifo = 128;   // SOC_UART_FIFO_LEN

bool timed(const uart_struct_t *u) { return u->num != 0; }

// Bits por carácter según el config de arduino-esp32 (UART_CONF_*):
// datos ((c >> 2) & 3) + 5, paridad (c & 3: 2 par, 3 impar), parada
// ((c >> 4) & 3: 1, 1,5 o 2).
jwsim_ns_t char_ns(const uart_struct_t *u) {
  const uint32_t c = u->config;
  const double data = ((c >> 2) & 3) + 5;
  const double parity = (c & 3) >= 2 ? 1 : 0;
  const uint32_t s = (c >> 4) & 3;
  const double stop = s == 2 ? 1.5 : s == 3 ? 2 : 1;
  const uint32_t baud = u->baud ? u->baud : 115200;
  return static_cast<jwsim_ns_t>((1 + data + parity + stop) * 1e9 / baud + 0.5);
}

void drop_sent(uart_struct_t *u, jwsim_ns_t now) {
  while (!u->tx_ends.empty() && u->tx_ends.front() <= now) u->tx_ends.pop_front();
}

// Ruido en la línea (G9): splitmix64 con la semilla de la falla.
struct Noise {
  double rate = 0;
  uint64_t s = 0;
  uint64_t corrupted = 0;
};
Noise g_noise[SOC_UART_NUM];

uint64_t splitmix(uint64_t &s) {
  uint64_t z = (s += 0x9E3779B97F4A7C15ULL);
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
  return z ^ (z >> 31);
}

uint8_t noisy(uint8_t port, uint8_t b) {
  Noise &n = g_noise[port];
  if (n.rate <= 0) return b;
  if (static_cast<double>(splitmix(n.s) >> 11) * 0x1.0p-53 >= n.rate) return b;
  ++n.corrupted;
  return static_cast<uint8_t>(b ^ (1u << (splitmix(n.s) & 7)));
}

void rx_push(uart_struct_t *u, uint8_t b) {
  if (timed(u) && u->rx.size() >= u->rx_buffer + kHwFifo) {
    ++u->rx_overflow;
    return;
  }
  u->rx.push_back(b);
}

struct RxByte {
  uart_struct_t *u;
  uint8_t b;
};

void rx_event(void *arg, jwsim_ns_t) {
  auto *e = static_cast<RxByte *>(arg);
  e->b = noisy(e->u->num, e->b);
  rx_push(e->u, e->b);
  jwsim_trace_bytes(&e->b, 1);
  delete e;
}

int8_t default_rx(uint8_t n) { return n == 0 ? SOC_RX0 : n == 1 ? SOC_RX1 : SOC_RX2; }
int8_t default_tx(uint8_t n) { return n == 0 ? SOC_TX0 : n == 1 ? SOC_TX1 : SOC_TX2; }

} // namespace

namespace jwsim {
// Bytes que llegan desde afuera a partir de ahora: en UART1/UART2, uno por
// tiempo de carácter (el primero disponible al terminar su carácter).
void uart_inject(int port, const uint8_t *data, size_t len) {
  uart_struct_t *u = get(static_cast<uint8_t>(port));
  if (!u) return;
  if (!timed(u)) {
    for (size_t i = 0; i < len; ++i) {
      const uint8_t b = noisy(u->num, data[i]);
      u->rx.push_back(b);
      jwsim_trace_bytes(&b, 1);
    }
    return;
  }
  const jwsim_ns_t now = jwsim_now(), ch = char_ns(u);
  for (size_t i = 0; i < len; ++i) jwsim_schedule_external_event(now + (i + 1) * ch, rx_event, new RxByte{u, data[i]});
}

// Un byte que termina de llegar en el instante `at` (bus RS-485 entre nodos).
void uart_inject_at(int port, uint8_t byte, jwsim_ns_t at) {
  uart_struct_t *u = get(static_cast<uint8_t>(port));
  if (!u) return;
  jwsim_schedule_external_event(std::max(at, jwsim_now()), rx_event, new RxByte{u, byte});
}
void uart_set_noise(int port, double rate, uint64_t seed) {
  if (port < 0 || port >= SOC_UART_NUM) return;
  g_noise[port].rate = rate;
  g_noise[port].s = seed;
}

uint64_t uart_noise_count(int port) { return port < 0 || port >= SOC_UART_NUM ? 0 : g_noise[port].corrupted; }

} // namespace jwsim

extern "C" {

bool _testUartBegin(uint8_t, uint32_t, uint32_t, int8_t, int8_t, uint32_t, uint32_t, bool, uint8_t) { return false; }

uart_t *uartBegin(uint8_t num, uint32_t baud, uint32_t config, int8_t rxPin, int8_t txPin, uint32_t rxBuf,
                  uint32_t txBuf, bool, uint8_t) {
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
  u->tx_buffer = txBuf;
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
uint32_t uartAvailableForWrite(uart_t *u) {
  if (!u) return 0;
  if (!timed(u)) return kHwFifo;
  drop_sent(u, jwsim_now());
  const size_t cap = kHwFifo + u->tx_buffer;
  return static_cast<uint32_t>(cap > u->tx_ends.size() ? cap - u->tx_ends.size() : 0);
}

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
  if (!timed(u)) return;
  const jwsim_ns_t ch = char_ns(u);
  const size_t cap = kHwFifo + u->tx_buffer;
  for (size_t i = 0; i < len; ++i) {
    jwsim_ns_t now = jwsim_now();
    drop_sent(u, now);
    // FIFO y búfer llenos: espera a que salga el carácter más antiguo.
    while (u->tx_ends.size() >= cap) {
      jwsim_wait(u->tx_ends.front() - now);
      now = jwsim_now();
      drop_sent(u, now);
    }
    const jwsim_ns_t start = std::max(now, u->tx_free_at);
    u->tx_free_at = start + ch;
    u->tx_ends.push_back(u->tx_free_at);
    jwsim::board().uart_char(u->num, data[i], start, u->tx_free_at);
  }
}

void uartWrite(uart_t *u, uint8_t c) { uartWriteBuf(u, &c, 1); }
// Espera el bit de parada del último carácter (y, con txOnly = false,
// descarta lo recibido, como el driver de ESP-IDF).
void uartFlushTxOnly(uart_t *u, bool txOnly) {
  if (!u) return;
  if (timed(u)) {
    const jwsim_ns_t now = jwsim_now();
    if (u->tx_free_at > now) jwsim_wait(u->tx_free_at - now);
    drop_sent(u, jwsim_now());
  }
  if (!txOnly) u->rx.clear();
}
void uartFlush(uart_t *u) { uartFlushTxOnly(u, true); }
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
