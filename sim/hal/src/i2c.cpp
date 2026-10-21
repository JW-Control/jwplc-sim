// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// I2C maestro del ESP32 simulado: reemplaza esp32-hal-i2c.c / -i2c-ng.c.
//
// Cada transacción se entrega completa al bus de la placa (jwsim::I2CBus),
// que la ejecuta contra los modelos a nivel de byte/ACK. La tarea que llama
// queda bloqueada durante la duración eléctrica de la transacción a la
// frecuencia configurada (otras tareas pueden correr, igual que con el driver
// de ESP-IDF que espera por interrupción).
#include <cstdio>

#include "esp32-hal-i2c.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"

namespace {

struct Port {
  bool init = false;
  int8_t sda = -1;
  int8_t scl = -1;
  uint32_t freq = 100000;
};

Port g_ports[SOC_I2C_NUM];

bool valid(uint8_t n) { return n < SOC_I2C_NUM; }

esp_err_t do_transfer(uint8_t num, uint16_t address, const uint8_t *w, size_t wl, uint8_t *r, size_t rl,
                      size_t *rx) {
  if (!valid(num) || !g_ports[num].init) return ESP_FAIL;
  jwsim::I2CBus *bus = jwsim::board().i2c_bus(num);
  jwsim_ns_t duration = 0;
  size_t got = 0;
  jwsim::I2CResult res = jwsim::I2CResult::AddressNack;
  if (bus) {
    res = bus->transfer(static_cast<uint8_t>(address), w, wl, r, rl, &got, g_ports[num].freq, &duration);
  } else {
    duration = 1000000000ULL / g_ports[num].freq * 10;
  }
  if (rx) *rx = got;
  jwsim_cpu(jwsim_costs()->hal_call);
  jwsim_wait(duration);
  // arduino-esp32 3.x (i2c_master) informa NACK como error genérico.
  return res == jwsim::I2CResult::Ok ? ESP_OK : ESP_FAIL;
}

} // namespace

extern "C" {

esp_err_t i2cInit(uint8_t num, int8_t sda, int8_t scl, uint32_t freq) {
  if (!valid(num)) return ESP_ERR_INVALID_ARG;
  g_ports[num] = Port{true, sda, scl, freq ? freq : 100000};
  return ESP_OK;
}

esp_err_t i2cDeinit(uint8_t num) {
  if (!valid(num)) return ESP_ERR_INVALID_ARG;
  g_ports[num].init = false;
  return ESP_OK;
}

esp_err_t i2cSetClock(uint8_t num, uint32_t freq) {
  if (!valid(num) || !g_ports[num].init) return ESP_FAIL;
  g_ports[num].freq = freq ? freq : 100000;
  return ESP_OK;
}

esp_err_t i2cGetClock(uint8_t num, uint32_t *freq) {
  if (!valid(num) || !g_ports[num].init) return ESP_FAIL;
  *freq = g_ports[num].freq;
  return ESP_OK;
}

bool i2cIsInit(uint8_t num) { return valid(num) && g_ports[num].init; }
void *i2cBusHandle(uint8_t num) { return valid(num) && g_ports[num].init ? &g_ports[num] : nullptr; }

esp_err_t i2cWrite(uint8_t num, uint16_t address, const uint8_t *buff, size_t size, uint32_t) {
  return do_transfer(num, address, buff, size, nullptr, 0, nullptr);
}

esp_err_t i2cRead(uint8_t num, uint16_t address, uint8_t *buff, size_t size, uint32_t, size_t *readCount) {
  return do_transfer(num, address, nullptr, 0, buff, size, readCount);
}

esp_err_t i2cWriteReadNonStop(uint8_t num, uint16_t address, const uint8_t *wbuf, size_t wsize, uint8_t *rbuf,
                              size_t rsize, uint32_t, size_t *readCount) {
  return do_transfer(num, address, wbuf, wsize, rbuf, rsize, readCount);
}

} // extern "C"
