// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// GPIO nativo del ESP32 simulado: reemplaza esp32-hal-gpio.c,
// esp32-hal-matrix.c y la parte usada de driver/gpio.h.
//
// Cada GPIO es una jwsim::Net. En modo salida el pin maneja la red; en modo
// entrada la libera y su nivel lo dan los dispositivos de la placa o el pull.
// Las interrupciones se despachan de forma síncrona cuando cambia la red (en
// G1 pasarán a ejecutarse como contexto ISR que apropia al núcleo dueño).
#include <array>
#include <cstdio>
#include <memory>
#include <string>

#include "esp32-hal-gpio.h"
#include "esp32-hal-matrix.h"
#include "esp32-hal-periman.h"
#include "driver/gpio.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"

namespace {

struct Pin {
  std::unique_ptr<jwsim::Net> net;
  uint8_t mode = 0;           // modo Arduino (INPUT, OUTPUT, ...)
  bool output = false;
  bool out_level = false;
  int intr_type = 0;          // RISING/FALLING/CHANGE/ONLOW/ONHIGH
  bool intr_enabled = false;
  void (*isr)(void *) = nullptr;
  void *isr_arg = nullptr;
  bool isr_with_arg = false;
};

std::array<Pin, SOC_GPIO_PIN_COUNT> &pins() {
  static std::array<Pin, SOC_GPIO_PIN_COUNT> p = [] {
    std::array<Pin, SOC_GPIO_PIN_COUNT> a;
    for (int i = 0; i < SOC_GPIO_PIN_COUNT; ++i) {
      a[i].net = std::make_unique<jwsim::Net>("GPIO" + std::to_string(i), false);
    }
    return a;
  }();
  return p;
}

bool valid(int pin) { return pin >= 0 && pin < SOC_GPIO_PIN_COUNT; }

void trace_pin(int pin, bool level) {
  uint8_t rec[3] = {'G', static_cast<uint8_t>(pin), static_cast<uint8_t>(level)};
  jwsim_trace_bytes(rec, sizeof(rec));
}

void on_net_change(int pin, bool level) {
  Pin &p = pins()[pin];
  if (!p.isr || !p.intr_enabled) return;
  bool fire = false;
  switch (p.intr_type & 0x7) {
    case RISING: fire = level; break;
    case FALLING: fire = !level; break;
    case CHANGE: fire = true; break;
    case ONLOW: fire = !level; break;
    case ONHIGH: fire = level; break;
    default: break;
  }
  if (!fire) return;
  if (p.isr_with_arg) p.isr(p.isr_arg);
  else reinterpret_cast<void (*)()>(p.isr)();
}

void apply_mode(int pin, uint8_t mode) {
  Pin &p = pins()[pin];
  p.mode = mode;
  p.output = (mode & OUTPUT) == OUTPUT || (mode & 0x02);
  jwsim::Net &net = *p.net;
  if (mode & PULLUP) net.set_idle(true);
  else if (mode & PULLDOWN) net.set_idle(false);
  if (p.output) {
    net.drive(&p, p.out_level);
  } else {
    net.release(&p);
  }
}

bool gpio_bus_deinit(void *) { return true; }

} // namespace

namespace jwsim {
Net &gpio(int pin) {
  if (!valid(pin)) jwsim_fatal("GPIO%d inválido", pin);
  static bool hooked = false;
  if (!hooked) {
    hooked = true;
    for (int i = 0; i < SOC_GPIO_PIN_COUNT; ++i) {
      pins()[i].net->on_change([i](Net &, bool level) { on_net_change(i, level); });
    }
  }
  return *pins()[pin].net;
}
} // namespace jwsim

extern "C" {

void __pinMode(uint8_t pin, uint8_t mode) {
  if (!valid(pin)) {
    std::fprintf(stderr, "[jwsim] pinMode: IO %u inválido\n", pin);
    return;
  }
  jwsim::gpio(pin);   // asegura los manejadores de interrupción
  if (perimanGetPinBus(pin, ESP32_BUS_TYPE_GPIO) == nullptr) {
    perimanSetBusDeinit(ESP32_BUS_TYPE_GPIO, gpio_bus_deinit);
    perimanClearPinBus(pin);
    perimanSetPinBus(pin, ESP32_BUS_TYPE_GPIO, reinterpret_cast<void *>(static_cast<uintptr_t>(pin) + 1), -1, -1);
  }
  apply_mode(pin, mode);
  jwsim_cpu(jwsim_costs()->gpio_access);
}

void __digitalWrite(uint8_t pin, uint8_t val) {
  if (!valid(pin)) return;
  Pin &p = pins()[pin];
  const bool level = val != 0;
  if (p.out_level != level) trace_pin(pin, level);
  p.out_level = level;
  if (p.output) jwsim::gpio(pin).drive(&p, level);
  jwsim_cpu(jwsim_costs()->gpio_access);
}

int __digitalRead(uint8_t pin) {
  if (!valid(pin)) return 0;
  jwsim_cpu(jwsim_costs()->gpio_access);
  return jwsim::gpio(pin).level() ? HIGH : LOW;
}

void __attachInterruptFunctionalArg(uint8_t pin, void (*fn)(void *), void *arg, int intr_type, bool) {
  if (!valid(pin)) return;
  jwsim::gpio(pin);
  Pin &p = pins()[pin];
  p.isr = fn;
  p.isr_arg = arg;
  p.isr_with_arg = true;
  p.intr_type = intr_type;
  p.intr_enabled = true;
}

void __attachInterruptArg(uint8_t pin, void (*fn)(void *), void *arg, int intr_type) {
  __attachInterruptFunctionalArg(pin, fn, arg, intr_type, false);
}

void __attachInterrupt(uint8_t pin, void (*fn)(void), int intr_type) {
  if (!valid(pin)) return;
  __attachInterruptFunctionalArg(pin, reinterpret_cast<void (*)(void *)>(fn), nullptr, intr_type, false);
  pins()[pin].isr_with_arg = false;
}

void __detachInterrupt(uint8_t pin) {
  if (!valid(pin)) return;
  Pin &p = pins()[pin];
  p.isr = nullptr;
  p.isr_arg = nullptr;
  p.intr_enabled = false;
}

void enableInterrupt(uint8_t pin) {
  if (valid(pin)) pins()[pin].intr_enabled = true;
}
void disableInterrupt(uint8_t pin) {
  if (valid(pin)) pins()[pin].intr_enabled = false;
}

void pinMode(uint8_t pin, uint8_t mode) __attribute__((weak, alias("__pinMode")));
void digitalWrite(uint8_t pin, uint8_t val) __attribute__((weak, alias("__digitalWrite")));
int digitalRead(uint8_t pin) __attribute__((weak, alias("__digitalRead")));
void attachInterrupt(uint8_t pin, void (*)(void), int mode) __attribute__((weak, alias("__attachInterrupt")));
void attachInterruptArg(uint8_t pin, void (*)(void *), void *arg, int mode) __attribute__((weak, alias("__attachInterruptArg")));
void detachInterrupt(uint8_t pin) __attribute__((weak, alias("__detachInterrupt")));

int8_t digitalPinToTouchChannel(uint8_t) { return -1; }
int8_t digitalPinToAnalogChannel(uint8_t pin) {
  static const int8_t map[] = {36, 37, 38, 39, 32, 33, 34, 35};
  for (int8_t i = 0; i < 8; ++i) {
    if (map[i] == pin) return i;
  }
  return -1;
}
int8_t analogChannelToDigitalPin(uint8_t channel) {
  static const int8_t map[] = {36, 37, 38, 39, 32, 33, 34, 35};
  return channel < 8 ? map[channel] : -1;
}

// ---------------------------------------------------------------- matriz
void pinMatrixOutAttach(uint8_t, uint8_t, bool, bool) {}
void pinMatrixOutDetach(uint8_t, bool, bool) {}
void pinMatrixInAttach(uint8_t, uint8_t, bool) {}
void pinMatrixInDetach(uint8_t, bool, bool) {}

// ---------------------------------------------------------------- driver/gpio
esp_err_t gpio_config(const gpio_config_t *cfg) {
  for (int pin = 0; pin < SOC_GPIO_PIN_COUNT; ++pin) {
    if (!(cfg->pin_bit_mask & (1ULL << pin))) continue;
    uint8_t mode = 0;
    if (cfg->mode & GPIO_MODE_DEF_INPUT) mode |= INPUT;
    if (cfg->mode & GPIO_MODE_DEF_OUTPUT) mode |= OUTPUT;
    if (cfg->mode & GPIO_MODE_DEF_OD) mode |= OPEN_DRAIN;
    if (cfg->pull_up_en) mode |= PULLUP;
    if (cfg->pull_down_en) mode |= PULLDOWN;
    apply_mode(pin, mode);
  }
  return ESP_OK;
}

esp_err_t gpio_reset_pin(gpio_num_t pin) {
  if (!valid(pin)) return ESP_ERR_INVALID_ARG;
  apply_mode(pin, INPUT | PULLUP);
  return ESP_OK;
}

esp_err_t gpio_set_level(gpio_num_t pin, uint32_t level) {
  if (!valid(pin)) return ESP_ERR_INVALID_ARG;
  __digitalWrite(static_cast<uint8_t>(pin), level ? 1 : 0);
  return ESP_OK;
}

int gpio_get_level(gpio_num_t pin) { return valid(pin) ? (jwsim::gpio(pin).level() ? 1 : 0) : 0; }

esp_err_t gpio_set_direction(gpio_num_t pin, gpio_mode_t mode) {
  if (!valid(pin)) return ESP_ERR_INVALID_ARG;
  uint8_t m = 0;
  if (mode & GPIO_MODE_DEF_INPUT) m |= INPUT;
  if (mode & GPIO_MODE_DEF_OUTPUT) m |= OUTPUT;
  if (mode & GPIO_MODE_DEF_OD) m |= OPEN_DRAIN;
  m |= pins()[pin].mode & (PULLUP | PULLDOWN);
  jwsim::gpio(pin);
  apply_mode(pin, m);
  return ESP_OK;
}

esp_err_t gpio_set_pull_mode(gpio_num_t pin, gpio_pull_mode_t pull) {
  if (!valid(pin)) return ESP_ERR_INVALID_ARG;
  if (pull == GPIO_PULLUP_ONLY) jwsim::gpio(pin).set_idle(true);
  if (pull == GPIO_PULLDOWN_ONLY) jwsim::gpio(pin).set_idle(false);
  return ESP_OK;
}
esp_err_t gpio_pullup_en(gpio_num_t pin) { return gpio_set_pull_mode(pin, GPIO_PULLUP_ONLY); }
esp_err_t gpio_pullup_dis(gpio_num_t) { return ESP_OK; }
esp_err_t gpio_pulldown_en(gpio_num_t pin) { return gpio_set_pull_mode(pin, GPIO_PULLDOWN_ONLY); }
esp_err_t gpio_pulldown_dis(gpio_num_t) { return ESP_OK; }
esp_err_t gpio_set_intr_type(gpio_num_t pin, gpio_int_type_t t) {
  if (valid(pin)) pins()[pin].intr_type = t;
  return ESP_OK;
}
esp_err_t gpio_intr_enable(gpio_num_t pin) {
  enableInterrupt(static_cast<uint8_t>(pin));
  return ESP_OK;
}
esp_err_t gpio_intr_disable(gpio_num_t pin) {
  disableInterrupt(static_cast<uint8_t>(pin));
  return ESP_OK;
}
esp_err_t gpio_install_isr_service(int) { return ESP_OK; }
void gpio_uninstall_isr_service(void) {}
esp_err_t gpio_isr_handler_add(gpio_num_t pin, gpio_isr_t fn, void *arg) {
  if (!valid(pin)) return ESP_ERR_INVALID_ARG;
  jwsim::gpio(pin);
  Pin &p = pins()[pin];
  p.isr = fn;
  p.isr_arg = arg;
  p.isr_with_arg = true;
  p.intr_enabled = true;
  return ESP_OK;
}
esp_err_t gpio_isr_handler_remove(gpio_num_t pin) {
  __detachInterrupt(static_cast<uint8_t>(pin));
  return ESP_OK;
}
esp_err_t gpio_set_drive_capability(gpio_num_t, gpio_drive_cap_t) { return ESP_OK; }
esp_err_t gpio_wakeup_enable(gpio_num_t, gpio_int_type_t) { return ESP_OK; }
esp_err_t gpio_wakeup_disable(gpio_num_t) { return ESP_OK; }

} // extern "C"
