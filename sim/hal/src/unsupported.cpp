// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// APIs del Arduino core ESP32 que el JWPLC Basic simulado todavía no ofrece.
// Fallan de forma explícita en tiempo de ejecución con un mensaje claro en vez
// de comportarse de forma silenciosa o inventada (gate G2 UNSUPPORTED_LIB_MSG).
#include "Arduino.h"
#include "esp32-hal-i2c-slave.h"
#include "jwsim/engine.h"

// Mensaje: API, familia y plan (el gate que la soportará o que no está en el
// plan), como pide JWSIM_G2_UNSUPPORTED_LIB_MSG.
#define JWSIM_NO_PLAN "No está en el plan de gates G0–G10."
#define JWSIM_UNSUPPORTED(api, plan) jwsim_fatal("%s no está soportado por JWPLC Sim (" api "). " plan, __func__)
#define JWSIM_ADC_PLAN "El ADC del ESP32 no se simula. " JWSIM_NO_PLAN
#define JWSIM_DAC_PLAN "El DAC del ESP32 no se simula. " JWSIM_NO_PLAN
#define JWSIM_I2C_SLAVE_PLAN "El JWPLC Basic usa I2C0 como maestro de sus periféricos. " JWSIM_NO_PLAN

extern "C" {

uint16_t analogRead(uint8_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
uint32_t analogReadMilliVolts(uint8_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
void analogReadResolution(uint8_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
void analogSetAttenuation(adc_attenuation_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
void analogSetPinAttenuation(uint8_t, adc_attenuation_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
void analogSetWidth(uint8_t) { JWSIM_UNSUPPORTED("ADC", JWSIM_ADC_PLAN); }
bool dacWrite(uint8_t, uint8_t) { JWSIM_UNSUPPORTED("DAC", JWSIM_DAC_PLAN); }
bool dacDisable(uint8_t) { JWSIM_UNSUPPORTED("DAC", JWSIM_DAC_PLAN); }

} // extern "C"


// I2C esclavo: el JWPLC Basic usa el bus I2C0 como maestro de sus periféricos.
extern "C" {
esp_err_t i2cSlaveAttachCallbacks(uint8_t, i2c_slave_request_cb_t, i2c_slave_receive_cb_t, void *) {
  JWSIM_UNSUPPORTED("I2C esclavo", JWSIM_I2C_SLAVE_PLAN);
}
esp_err_t i2cSlaveInit(uint8_t, int, int, uint16_t, uint32_t, size_t, size_t) { JWSIM_UNSUPPORTED("I2C esclavo", JWSIM_I2C_SLAVE_PLAN); }
esp_err_t i2cSlaveDeinit(uint8_t) { return ESP_OK; }
size_t i2cSlaveWrite(uint8_t, const uint8_t *, uint32_t, uint32_t) { JWSIM_UNSUPPORTED("I2C esclavo", JWSIM_I2C_SLAVE_PLAN); }
}
