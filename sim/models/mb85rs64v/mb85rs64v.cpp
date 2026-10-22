// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "jwsim/models/mb85rs64v.h"

#include "jwsim/models/persist.h"

namespace jwsim::models {

namespace {
constexpr uint8_t kId[4] = {0x04, 0x7F, 0x03, 0x02};  // Fujitsu, continuación, MB85RS64V
constexpr uint8_t kSrNonVolatile = MB85RS64V::SR_WPEN | MB85RS64V::SR_BP1 | MB85RS64V::SR_BP0;
} // namespace

MB85RS64V::MB85RS64V() = default;

void MB85RS64V::set_storage(const std::string &dir) {
  dir_ = dir;
  std::vector<uint8_t> data;
  if (read_file(join_path(dir_, "fram.bin"), data)) {
    for (size_t i = 0; i < kSize && i < data.size(); ++i) mem_[i] = data[i];
  }
  if (read_file(join_path(dir_, "fram-sr.bin"), data) && !data.empty()) sr_ = data[0] & kSrNonVolatile;
  dirty_ = false;
}

bool MB85RS64V::save() {
  if (dir_.empty() || !dirty_) return true;
  const uint8_t sr = sr_ & kSrNonVolatile;
  const bool ok = write_file_atomic(join_path(dir_, "fram.bin"), mem_.data(), kSize) &&
                  write_file_atomic(join_path(dir_, "fram-sr.bin"), &sr, 1);
  if (ok) dirty_ = false;
  return ok;
}

bool MB85RS64V::protected_addr(uint16_t addr) const {
  // Protección por bloques (BP1:BP0): 01 = cuarto superior, 10 = mitad
  // superior, 11 = todo.
  switch ((sr_ >> 2) & 3) {
    case 1: return addr >= 0x1800;
    case 2: return addr >= 0x1000;
    case 3: return true;
    default: return false;
  }
}

void MB85RS64V::spi_select(bool selected) {
  if (selected == selected_) return;
  selected_ = selected;
  phase_ = 0;
  // Al subir CS tras completar WRITE o WRSR se borra WEL (datasheet:
  // "WEL is reset after WRITE/WRSR").
  if (!selected && wrote_) sr_ &= static_cast<uint8_t>(~SR_WEL);
  wrote_ = false;
}

uint8_t MB85RS64V::spi_transfer(uint8_t mosi) {
  if (!selected_) return 0xFF;
  const int n = phase_++;
  if (n == 0) {
    opcode_ = mosi;
    switch (opcode_) {
      case WREN: sr_ |= SR_WEL; break;
      case WRDI: sr_ &= static_cast<uint8_t>(~SR_WEL); break;
      default: break;
    }
    return 0xFF;
  }
  switch (opcode_) {
    case RDSR:
      return sr_;
    case WRSR:
      if (n == 1) {
        wrote_ = true;
        // WRSR requiere WEL; con WPEN = 1 y /WP en bajo el registro está protegido.
        if ((sr_ & SR_WEL) && !((sr_ & SR_WPEN) && !wp_)) {
          sr_ = static_cast<uint8_t>((sr_ & ~kSrNonVolatile) | (mosi & kSrNonVolatile));
          dirty_ = true;
        }
      }
      return 0xFF;
    case RDID:
      return n <= 4 ? kId[n - 1] : 0x00;
    case READ:
    case WRITE:
      if (n == 1) {
        addr_ = static_cast<uint16_t>(mosi << 8);
        return 0xFF;
      }
      if (n == 2) {
        addr_ = static_cast<uint16_t>((addr_ | mosi) & (kSize - 1));  // 13 bits; los altos se ignoran
        return 0xFF;
      }
      if (opcode_ == READ) {
        const uint8_t v = mem_[addr_];
        addr_ = static_cast<uint16_t>((addr_ + 1) & (kSize - 1));  // tras la última dirección vuelve a 0
        return v;
      }
      wrote_ = true;
      if ((sr_ & SR_WEL) && !protected_addr(addr_)) {
        if (mem_[addr_] != mosi) dirty_ = true;
        mem_[addr_] = mosi;
      }
      addr_ = static_cast<uint16_t>((addr_ + 1) & (kSize - 1));
      return 0xFF;
    default:
      return 0xFF;  // opcode no válido: el chip no responde
  }
}

} // namespace jwsim::models
