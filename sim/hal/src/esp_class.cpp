// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// EspClass (ESP.*) del ESP32 simulado: reemplaza Esp.cpp. Valores fijos y
// deterministas de un ESP32-D0WD (4 MB de flash, sin PSRAM).
#include "Esp.h"
#include "esp_arduino_version.h"
#include "esp_idf_version.h"
#include "esp_system.h"
#include "jwsim/engine.h"

extern "C" void jwsim_get_mac(uint8_t mac[6]);

EspClass ESP;

void EspClass::restart() { esp_restart(); }
uint32_t EspClass::getHeapSize() { return 320 * 1024; }
uint32_t EspClass::getFreeHeap() { return esp_get_free_heap_size(); }
uint32_t EspClass::getMinFreeHeap() { return esp_get_minimum_free_heap_size(); }
uint32_t EspClass::getMaxAllocHeap() { return 110 * 1024; }
uint32_t EspClass::getPsramSize() { return 0; }
uint32_t EspClass::getFreePsram() { return 0; }
uint32_t EspClass::getMinFreePsram() { return 0; }
uint32_t EspClass::getMaxAllocPsram() { return 0; }
uint16_t EspClass::getChipRevision() { return 301; }
const char *EspClass::getChipModel() { return "ESP32-D0WD-V3 (JWPLC Sim)"; }
uint8_t EspClass::getChipCores() { return JWSIM_NUM_CORES; }
const char *EspClass::getSdkVersion() { return esp_get_idf_version(); }
const char *EspClass::getCoreVersion() { return ESP_ARDUINO_VERSION_STR; }
void EspClass::deepSleep(uint64_t time_us) { esp_deep_sleep(time_us); }
uint32_t EspClass::getFlashChipSize() { return 4 * 1024 * 1024; }
uint32_t EspClass::getFlashChipSpeed() { return 40000000; }
FlashMode_t EspClass::getFlashChipMode() { return FM_DIO; }
uint32_t EspClass::getFlashFrequencyMHz() { return 40; }
uint8_t EspClass::getFlashSourceFrequencyMHz() { return 80; }
uint8_t EspClass::getFlashClockDivider() { return 2; }
uint32_t EspClass::magicFlashChipSize(uint8_t) { return getFlashChipSize(); }
uint32_t EspClass::magicFlashChipSpeed(uint8_t) { return getFlashChipSpeed(); }
FlashMode_t EspClass::magicFlashChipMode(uint8_t) { return FM_DIO; }
uint32_t EspClass::getSketchSize() { return 0; }
String EspClass::getSketchMD5() { return String(); }
uint32_t EspClass::getFreeSketchSpace() { return 0; }
bool EspClass::flashEraseSector(uint32_t) { return false; }
bool EspClass::flashWrite(uint32_t, uint32_t *, size_t) { return false; }
bool EspClass::flashRead(uint32_t, uint32_t *, size_t) { return false; }
bool EspClass::partitionEraseRange(const esp_partition_t *, uint32_t, size_t) { return false; }
bool EspClass::partitionWrite(const esp_partition_t *, uint32_t, uint32_t *, size_t) { return false; }
bool EspClass::partitionRead(const esp_partition_t *, uint32_t, uint32_t *, size_t) { return false; }

uint64_t EspClass::getEfuseMac() {
  uint8_t mac[6];
  jwsim_get_mac(mac);
  uint64_t v = 0;
  for (int i = 5; i >= 0; --i) v = (v << 8) | mac[i];   // mismo orden que esp_efuse_mac_get_default
  return v;
}
