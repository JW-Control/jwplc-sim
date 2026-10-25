// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo del RTC I2C DS3232M (Maxim/Analog Devices): hora/fecha BCD,
// alarmas, control/estado, aging, temperatura y 236 bytes de SRAM con
// batería. Ver sim/models/ds3232m/MODEL.md.
#ifndef JWSIM_MODELS_DS3232M_H
#define JWSIM_MODELS_DS3232M_H

#include <array>
#include <cstdint>
#include <string>

#include "jwsim/devices.h"

namespace jwsim::models {

class DS3232M : public I2CTarget {
 public:
  static constexpr uint8_t kAddress = 0x68;
  enum Reg : uint8_t {
    SECONDS = 0x00, MINUTES, HOURS, DAY, DATE, MONTH, YEAR,
    A1_SEC = 0x07, A1_MIN, A1_HOUR, A1_DAY, A2_MIN = 0x0B, A2_HOUR, A2_DAY,
    CONTROL = 0x0E, STATUS = 0x0F, AGING = 0x10, TEMP_MSB = 0x11, TEMP_LSB = 0x12, TEST = 0x13, SRAM = 0x14,
  };
  static constexpr uint8_t ST_OSF = 0x80, ST_BSY = 0x04, ST_A2F = 0x02, ST_A1F = 0x01;

  DS3232M();

  // Hora de arranque. Sin llamar: la del archivo de estado o, sin él, un
  // RTC recién alimentado (2000-01-01 00:00:00, OSF = 1: hora no válida).
  // `epoch` en segundos desde 1970 (UTC); la hora fijada deja OSF = 0.
  void set_time(int64_t epoch);
  int64_t now_epoch() const;  // hora actual del RTC (segundos desde 1970)
  // Falla de batería (G9): al alimentar, el chip no conservó nada, como uno
  // nuevo (2000-01-01 00:00:00, OSF = 1, SRAM y registros en cero). Se llama
  // después de set_storage; save() deja ese estado en rtc.bin.
  void power_loss();

  void set_storage(const std::string &dir);
  bool save();

  void set_temperature_quarters(int16_t q) { temp_q_ = q; }  // 0,25 °C
  uint8_t reg(uint8_t r) const;  // valor como lo leería el maestro ahora

  // I2CTarget
  bool i2c_start(bool read) override;
  bool i2c_write(uint8_t byte) override;
  uint8_t i2c_read(bool ack) override;
  void i2c_stop() override;

 private:
  void latch_time();
  void write_reg(uint8_t r, uint8_t v);
  void check_alarms();
  void rebase(int64_t epoch);
  int dow_at(int64_t epoch) const;

  std::array<uint8_t, 256> regs_{};  // alarmas, control, estado, aging, SRAM
  // Hora: segundos desde 1970 en el instante virtual base_t_ (inicio del
  // segundo: escribir los segundos reinicia la cadena del divisor).
  int64_t base_epoch_ = 946684800;  // 2000-01-01 00:00:00
  jwsim_ns_t base_t_ = 0;
  // Día de semana: contador propio del chip (avanza a medianoche; escribir
  // la fecha no lo cambia). Valor dow_base_ en el día dow_day_.
  int dow_base_ = 7;                // 2000-01-01 fue sábado (1 = domingo)
  int64_t dow_day_ = 10957;
  bool h12_ = false;                // modo 12 h (bit 6 de HOURS)
  std::array<uint8_t, 7> latched_{};
  int64_t last_alarm_check_ = 0;
  int16_t temp_q_ = 100;            // 25,00 °C
  uint8_t ptr_ = 0;
  bool have_ptr_ = false;
  bool dirty_ = false;
  std::string dir_;
};

} // namespace jwsim::models

#endif
