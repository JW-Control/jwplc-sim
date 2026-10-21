// APIs del Arduino core ESP32 que el JWPLC Basic simulado todavía no ofrece.
// Fallan de forma explícita en tiempo de ejecución con un mensaje claro en vez
// de comportarse de forma silenciosa o inventada (gate G2 UNSUPPORTED_LIB_MSG).
#include "Arduino.h"
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
void analogWrite(uint8_t, int) { JWSIM_UNSUPPORTED(LEDC / PWM); }
void analogWriteFrequency(uint8_t, uint32_t) { JWSIM_UNSUPPORTED(LEDC / PWM); }
void analogWriteResolution(uint8_t, uint8_t) { JWSIM_UNSUPPORTED(LEDC / PWM); }

} // extern "C"

void tone(uint8_t, unsigned int, unsigned long) { JWSIM_UNSUPPORTED(LEDC / tone); }
void noTone(uint8_t) { JWSIM_UNSUPPORTED(LEDC / tone); }
void setToneChannel(uint8_t) { JWSIM_UNSUPPORTED(LEDC / tone); }
