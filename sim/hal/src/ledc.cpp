// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// LEDC (PWM) del ESP32 simulado: reemplaza esp32-hal-ledc.c y Tone.cpp.
//
// Cada pin con LEDC lleva un estado (frecuencia, resolución, ciclo). La red
// digital del GPIO refleja "salida activa" (ciclo > 0); los dispositivos de
// escena (zumbador, lámpara regulable, servo) leen el valor PWM con
// jwsim_pwm_get(). No se generan flancos a la frecuencia del PWM: el costo
// sería prohibitivo y ningún modelo de la placa lo necesita.
#include <array>
#include <cstdint>

#include "Arduino.h"
#include "esp32-hal-ledc.h"
#include "jwsim/devices.h"
#include "jwsim/engine.h"

namespace {

constexpr int kChannels = SOC_LEDC_CHANNEL_NUM * 2;   // grupos HS + LS del ESP32

struct Channel {
  bool used = false;
  uint8_t pin = 0;
  uint32_t freq = 0;
  uint8_t resolution = 0;
  uint32_t duty = 0;
  bool invert = false;
  void (*fade_cb)(void *) = nullptr;
  void *fade_arg = nullptr;
};

std::array<Channel, kChannels> g_ch;
ledc_clk_cfg_t g_clock = LEDC_AUTO_CLK;
uint8_t g_analog_resolution = 8;
uint32_t g_analog_freq = 1000;

Channel *by_pin(uint8_t pin) {
  for (auto &c : g_ch) {
    if (c.used && c.pin == pin) return &c;
  }
  return nullptr;
}

void apply(Channel &c) {
  const bool active = (c.duty != 0) != c.invert;
  jwsim::gpio(c.pin).drive(&c, active);
  uint8_t rec[10] = {'P', c.pin};
  for (int i = 0; i < 4; ++i) rec[2 + i] = static_cast<uint8_t>(c.freq >> (8 * i));
  for (int i = 0; i < 4; ++i) rec[6 + i] = static_cast<uint8_t>(c.duty >> (8 * i));
  jwsim_trace_bytes(rec, sizeof(rec));
}

bool attach(uint8_t pin, uint32_t freq, uint8_t resolution, int channel) {
  if (resolution == 0 || resolution > SOC_LEDC_TIMER_BIT_WIDTH) return false;
  if (Channel *old = by_pin(pin)) old->used = false;
  if (channel < 0) {
    for (int i = kChannels - 1; i >= 0; --i) {   // como el core: asigna desde el último
      if (!g_ch[i].used) {
        channel = i;
        break;
      }
    }
  }
  if (channel < 0 || channel >= kChannels || g_ch[channel].used) return false;
  g_ch[channel] = Channel{true, pin, freq, resolution, 0, false, nullptr, nullptr};
  apply(g_ch[channel]);
  jwsim_cpu(jwsim_costs()->hal_call);
  return true;
}

void fade_done(void *arg, jwsim_ns_t) {
  Channel &c = *static_cast<Channel *>(arg);
  if (c.fade_cb) jwsim_isr_raise(jwsim_current_core(), c.fade_cb, c.fade_arg);
}

bool fade(uint8_t pin, uint32_t, uint32_t target, int ms, void (*cb)(void *), void *arg) {
  Channel *c = by_pin(pin);
  if (!c) return false;
  // Modelo simplificado: el ciclo final se aplica al inicio y la
  // interrupción de fin de rampa llega a los `ms` milisegundos.
  c->duty = target;
  c->fade_cb = cb;
  c->fade_arg = arg;
  apply(*c);
  if (cb) jwsim_schedule_event(jwsim_now() + static_cast<jwsim_ns_t>(ms) * JWSIM_NS_PER_MS, fade_done, c);
  return true;
}

uint32_t note_freq(note_t note, uint8_t octave) {
  static const uint16_t base[NOTE_MAX] = {4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040, 7459, 7902};
  if (note >= NOTE_MAX || octave > 8) return 0;
  return static_cast<uint32_t>(base[note] / static_cast<double>(1u << (8 - octave)));
}

} // namespace

extern "C" {

// Valor PWM actual de un pin (para dispositivos de escena): frecuencia en Hz
// y ciclo en [0, 1]. Devuelve false si el pin no está en LEDC.
bool jwsim_pwm_get(uint8_t pin, uint32_t *freq, double *duty) {
  Channel *c = by_pin(pin);
  if (!c) return false;
  if (freq) *freq = c->freq;
  if (duty) *duty = static_cast<double>(c->duty) / static_cast<double>((1u << c->resolution));
  return true;
}

ledc_clk_cfg_t ledcGetClockSource(void) { return g_clock; }
bool ledcSetClockSource(ledc_clk_cfg_t source) {
  g_clock = source;
  return true;
}
bool ledcAttach(uint8_t pin, uint32_t freq, uint8_t resolution) { return attach(pin, freq, resolution, -1); }
bool ledcAttachChannel(uint8_t pin, uint32_t freq, uint8_t resolution, uint8_t channel) {
  return attach(pin, freq, resolution, channel);
}
bool ledcWrite(uint8_t pin, uint32_t duty) {
  Channel *c = by_pin(pin);
  if (!c) return false;
  const uint32_t max = 1u << c->resolution;
  c->duty = duty > max ? max : duty;
  apply(*c);
  jwsim_cpu(jwsim_costs()->hal_call);
  return true;
}
bool ledcWriteChannel(uint8_t channel, uint32_t duty) {
  return channel < kChannels && g_ch[channel].used ? ledcWrite(g_ch[channel].pin, duty) : false;
}
uint32_t ledcWriteTone(uint8_t pin, uint32_t freq) {
  Channel *c = by_pin(pin);
  if (!c) return 0;
  c->freq = freq;
  // Igual que el core: 50 % de ciclo con la frecuencia pedida, 0 = silencio.
  c->duty = freq ? (1u << c->resolution) / 2 : 0;
  apply(*c);
  return freq;
}
uint32_t ledcWriteNote(uint8_t pin, note_t note, uint8_t octave) { return ledcWriteTone(pin, note_freq(note, octave)); }
uint32_t ledcRead(uint8_t pin) {
  Channel *c = by_pin(pin);
  return c ? c->duty : 0;
}
uint32_t ledcReadFreq(uint8_t pin) {
  Channel *c = by_pin(pin);
  return c && c->duty ? c->freq : 0;
}
bool ledcDetach(uint8_t pin) {
  Channel *c = by_pin(pin);
  if (!c) return false;
  jwsim::gpio(pin).release(c);
  c->used = false;
  return true;
}
uint32_t ledcChangeFrequency(uint8_t pin, uint32_t freq, uint8_t resolution) {
  Channel *c = by_pin(pin);
  if (!c || resolution == 0 || resolution > SOC_LEDC_TIMER_BIT_WIDTH) return 0;
  c->freq = freq;
  c->resolution = resolution;
  apply(*c);
  return freq;
}
bool ledcOutputInvert(uint8_t pin, bool out_invert) {
  Channel *c = by_pin(pin);
  if (!c) return false;
  c->invert = out_invert;
  apply(*c);
  return true;
}
bool ledcFade(uint8_t pin, uint32_t start, uint32_t target, int ms) { return fade(pin, start, target, ms, nullptr, nullptr); }
bool ledcFadeWithInterrupt(uint8_t pin, uint32_t start, uint32_t target, int ms, void (*fn)(void)) {
  return fade(pin, start, target, ms, reinterpret_cast<void (*)(void *)>(fn), nullptr);
}
bool ledcFadeWithInterruptArg(uint8_t pin, uint32_t start, uint32_t target, int ms, void (*fn)(void *), void *arg) {
  return fade(pin, start, target, ms, fn, arg);
}

void analogWrite(uint8_t pin, int value) {
  if (!by_pin(pin) && !ledcAttach(pin, g_analog_freq, g_analog_resolution)) return;
  ledcWrite(pin, value < 0 ? 0 : static_cast<uint32_t>(value));
}
void analogWriteFrequency(uint8_t pin, uint32_t freq) {
  g_analog_freq = freq;
  if (by_pin(pin)) ledcChangeFrequency(pin, freq, by_pin(pin)->resolution);
}
void analogWriteResolution(uint8_t pin, uint8_t bits) {
  g_analog_resolution = bits;
  if (Channel *c = by_pin(pin)) ledcChangeFrequency(pin, c->freq, bits);
}

} // extern "C"

// ------------------------------------------------------------------ tone()
namespace {
uint8_t g_tone_channel = 0;
bool g_tone_channel_set = false;
int g_tone_pin = -1;

void tone_stop(void *arg, jwsim_ns_t) {
  const int pin = static_cast<int>(reinterpret_cast<intptr_t>(arg));
  if (pin == g_tone_pin) {
    ledcWriteTone(static_cast<uint8_t>(pin), 0);
  }
}
} // namespace

void setToneChannel(uint8_t channel) {
  g_tone_channel = channel;
  g_tone_channel_set = true;
}

void noTone(uint8_t pin) {
  if (g_tone_pin == pin) {
    ledcDetach(pin);
    g_tone_pin = -1;
  }
}

void tone(uint8_t pin, unsigned int frequency, unsigned long duration) {
  if (g_tone_pin != pin) {
    if (g_tone_pin >= 0) noTone(static_cast<uint8_t>(g_tone_pin));
    if (g_tone_channel_set) ledcAttachChannel(pin, frequency ? frequency : 1000, 10, g_tone_channel);
    else ledcAttach(pin, frequency ? frequency : 1000, 10);
    g_tone_pin = pin;
  }
  ledcWriteTone(pin, frequency);
  if (duration) {
    jwsim_schedule_event(jwsim_now() + static_cast<jwsim_ns_t>(duration) * JWSIM_NS_PER_MS, tone_stop,
                         reinterpret_cast<void *>(static_cast<intptr_t>(pin)));
  }
}
