// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// APIs del Arduino core ESP32 que el JWPLC Basic simulado todavía no ofrece.
// Fallan de forma explícita en tiempo de ejecución con un mensaje claro en vez
// de comportarse de forma silenciosa o inventada (gate G2 UNSUPPORTED_LIB_MSG).
#include "Arduino.h"
#include "esp32-hal-i2c-slave.h"
#include "jwsim/engine.h"

#define JWSIM_UNSUPPORTED(api) jwsim_fatal("%s no está soportado por JWPLC Sim (" #api ")", __func__)

extern "C" {

uint16_t analogRead(uint8_t) { JWSIM_UNSUPPORTED(ADC); }
uint32_t analogReadMilliVolts(uint8_t) { JWSIM_UNSUPPORTED(ADC); }
void analogReadResolution(uint8_t) { JWSIM_UNSUPPORTED(ADC); }
void analogSetAttenuation(adc_attenuation_t) { JWSIM_UNSUPPORTED(ADC); }
void analogSetPinAttenuation(uint8_t, adc_attenuation_t) { JWSIM_UNSUPPORTED(ADC); }
void analogSetWidth(uint8_t) { JWSIM_UNSUPPORTED(ADC); }
bool dacWrite(uint8_t, uint8_t) { JWSIM_UNSUPPORTED(DAC); }
bool dacDisable(uint8_t) { JWSIM_UNSUPPORTED(DAC); }

} // extern "C"


// I2C esclavo: el JWPLC Basic usa el bus I2C0 como maestro de sus periféricos.
extern "C" {
esp_err_t i2cSlaveAttachCallbacks(uint8_t, i2c_slave_request_cb_t, i2c_slave_receive_cb_t, void *) {
  JWSIM_UNSUPPORTED(I2C esclavo);
}
esp_err_t i2cSlaveInit(uint8_t, int, int, uint16_t, uint32_t, size_t, size_t) { JWSIM_UNSUPPORTED(I2C esclavo); }
esp_err_t i2cSlaveDeinit(uint8_t) { return ESP_OK; }
size_t i2cSlaveWrite(uint8_t, const uint8_t *, uint32_t, uint32_t) { JWSIM_UNSUPPORTED(I2C esclavo); }
}
