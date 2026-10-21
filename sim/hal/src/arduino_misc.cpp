// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Reemplaza esp32-hal-misc.c, esp32-hal-cpu.c, esp32-hal-psram.c y
// chip-debug-report.cpp: tiempo Arduino sobre el reloj virtual, arranque y
// utilidades de CPU.
#include <cstdio>
#include <cstring>

#include "Arduino.h"
#include "chip-debug-report.h"
#include "esp_timer.h"
#include "jwsim/engine.h"

extern "C" {

unsigned long micros() {
  jwsim_cpu(jwsim_costs()->millis_call);
  return static_cast<unsigned long>(static_cast<uint32_t>(jwsim_now() / JWSIM_NS_PER_US));
}

unsigned long millis() {
  jwsim_cpu(jwsim_costs()->millis_call);
  return static_cast<unsigned long>(static_cast<uint32_t>(jwsim_now() / JWSIM_NS_PER_MS));
}

void delay(uint32_t ms) { vTaskDelay(ms / portTICK_PERIOD_MS); }

// Espera activa: consume CPU del núcleo sin ceder (igual que en el ESP32).
void delayMicroseconds(uint32_t us) { jwsim_cpu(static_cast<jwsim_ns_t>(us) * JWSIM_NS_PER_US); }

void __yield() { jwsim_task_yield(); }
void yield() __attribute__((weak, alias("__yield")));

void enableLoopWDT() {}
void disableLoopWDT() {}
void feedLoopWDT() {}
void enableCore0WDT() {}
bool disableCore0WDT() { return true; }
void enableCore1WDT() {}
bool disableCore1WDT() { return true; }

BaseType_t xTaskCreateUniversal(TaskFunction_t fn, const char *const name, const uint32_t stack, void *const param,
                                UBaseType_t prio, TaskHandle_t *const created, const BaseType_t core) {
  return xTaskCreatePinnedToCore(fn, name, stack, param, prio, created, core >= 0 ? core : tskNO_AFFINITY);
}

void initVariant() {}
void init() {}
void initArduino() {
  init();
  initVariant();
}

bool verifyOta() { return true; }
bool verifyRollbackLater() { return false; }
bool testSPIRAM(void) { return false; }
float temperatureRead() { return 45.0f; }

const char *pathToFileName(const char *path) {
  const char *slash = std::strrchr(path, '/');
  const char *bslash = std::strrchr(path, '\\');
  const char *p = slash > bslash ? slash : bslash;
  return p ? p + 1 : path;
}

static arduino_panic_handler_t g_panic_handler = nullptr;
static void *g_panic_arg = nullptr;
void set_arduino_panic_handler(arduino_panic_handler_t h, void *arg) {
  g_panic_handler = h;
  g_panic_arg = arg;
}
arduino_panic_handler_t get_arduino_panic_handler(void) { return g_panic_handler; }
void *get_arduino_panic_handler_arg(void) { return g_panic_arg; }

#if !CONFIG_ESP32_PHY_AUTO_INIT
void arduino_phy_init() {}
#endif

// ------------------------------------------------------------------ CPU
static uint32_t g_cpu_mhz = CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ;
bool setCpuFrequencyMhz(uint32_t mhz) {
  if (mhz != 240 && mhz != 160 && mhz != 80 && mhz != 40 && mhz != 20 && mhz != 10) return false;
  g_cpu_mhz = mhz;
  return true;
}
uint32_t getCpuFrequencyMhz() { return g_cpu_mhz; }
uint32_t getXtalFrequencyMhz() { return CONFIG_XTAL_FREQ; }
uint32_t getApbFrequency() { return 80000000; }
const char *getSupportedCpuFrequencyMhz(uint8_t) { return "240, 160, 80, 40, 20, 10"; }
const char *getClockSourceName(uint8_t) { return "PLL"; }
bool addApbChangeCallback(void *, apb_change_cb_t) { return true; }
bool removeApbChangeCallback(void *, apb_change_cb_t) { return true; }

// ------------------------------------------------------------------ PSRAM
// El JWPLC Basic (ESP32-WROOM) no tiene PSRAM.
bool psramInit() { return false; }
bool psramAddToHeap() { return false; }
bool psramFound() { return false; }
void *ps_malloc(size_t) { return nullptr; }
void *ps_calloc(size_t, size_t) { return nullptr; }
void *ps_realloc(void *, size_t) { return nullptr; }

} // extern "C"

// ------------------------------------------------------------------ informes
void printBeforeSetupInfo(void) { std::printf("[jwsim] JWPLC Basic simulado (ESP32 @%u MHz)\n", getCpuFrequencyMhz()); }
void printAfterSetupInfo(void) {}
