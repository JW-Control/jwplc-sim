// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo de la FRAM SPI MB85RS64V (Fujitsu/RAMXEED, 64 Kbit = 8 KiB).
// Ver sim/models/mb85rs64v/MODEL.md.
#ifndef JWSIM_MODELS_MB85RS64V_H
#define JWSIM_MODELS_MB85RS64V_H

#include <array>
#include <cstdint>
#include <string>

#include "jwsim/devices.h"

namespace jwsim::models {

class MB85RS64V : public SPITarget {
 public:
  static constexpr size_t kSize = 8192;
  enum Opcode : uint8_t { WREN = 0x06, WRDI = 0x04, RDSR = 0x05, WRSR = 0x01, READ = 0x03, WRITE = 0x02, RDID = 0x9F };
  // Bits del registro de estado.
  static constexpr uint8_t SR_WEL = 0x02, SR_BP0 = 0x04, SR_BP1 = 0x08, SR_WPEN = 0x80;

  MB85RS64V();

  // Persistencia: contenido (fram.bin, 8192 bytes) y bits no volátiles del
  // registro de estado (fram-sr.bin, 1 byte). Sin ruta, la memoria es volátil
  // dentro del proceso y arranca en 0x00.
  void set_storage(const std::string &dir);
  bool save();  // escribe si hubo cambios desde el último save()

  // Pin /WP (activo en bajo). En JWPLC Basic se asume en alto (sin protección).
  void set_wp(bool level) { wp_ = level; }

  uint8_t peek(size_t addr) const { return mem_[addr % kSize]; }
  void poke(size_t addr, uint8_t v) { mem_[addr % kSize] = v; dirty_ = true; }
  uint8_t status() const { return sr_; }

  // SPITarget
  void spi_select(bool selected) override;
  uint8_t spi_transfer(uint8_t mosi) override;

 private:
  bool protected_addr(uint16_t addr) const;

  std::array<uint8_t, kSize> mem_{};
  uint8_t sr_ = 0;          // WEL arranca en 0; BP/WPEN se cargan del archivo
  bool wp_ = true;
  bool selected_ = false;
  int phase_ = 0;           // bytes recibidos en esta selección
  uint8_t opcode_ = 0;
  uint16_t addr_ = 0;
  bool wrote_ = false;      // la selección escribió memoria o estado
  bool dirty_ = false;
  std::string dir_;
};

} // namespace jwsim::models

#endif
