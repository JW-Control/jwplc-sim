// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "jwsim/devices.h"

#include <cstring>

namespace jwsim {

namespace {
Board *g_board = nullptr;

// Duración de una transacción I2C a nivel de bit: START + (1+n) bytes de 9
// bits (8 datos + ACK) por cada fase + START repetido + STOP.
jwsim_ns_t i2c_duration(size_t wlen, size_t rlen, bool has_write_phase, uint32_t freq_hz) {
  if (freq_hz == 0) freq_hz = 100000;
  const uint64_t bit_ns = 1000000000ULL / freq_hz;
  uint64_t bits = 0;
  if (has_write_phase) bits += 1 + 9 * (1 + wlen);   // START + addr + datos
  if (rlen) bits += 1 + 9 * (1 + rlen);              // (Sr) + addr + datos
  bits += 1;                                         // STOP
  return bits * bit_ns;
}
} // namespace

Board &board() {
  if (!g_board) jwsim_fatal("no hay placa virtual registrada");
  return *g_board;
}

void set_board(Board *b) { g_board = b; }

void I2CBus::attach(uint8_t address, I2CTarget *target) { targets_.emplace_back(address, target); }

I2CResult I2CBus::transfer(uint8_t address, const uint8_t *wbuf, size_t wlen, uint8_t *rbuf, size_t rlen,
                           size_t *rx_count, uint32_t freq_hz, jwsim_ns_t *duration_ns) {
  I2CTarget *t = nullptr;
  for (auto &[a, dev] : targets_) {
    if (a == address) t = dev;
  }
  const bool write_phase = wlen > 0 || rlen == 0;
  I2CResult result = I2CResult::Ok;
  size_t got = 0;

  if (!t) {
    result = I2CResult::AddressNack;
  } else {
    if (write_phase) {
      if (!t->i2c_start(false)) {
        result = I2CResult::AddressNack;
      } else {
        for (size_t i = 0; i < wlen; ++i) {
          if (!t->i2c_write(wbuf[i])) {
            result = I2CResult::DataNack;
            break;
          }
        }
      }
    }
    if (result == I2CResult::Ok && rlen) {
      if (!t->i2c_start(true)) {
        result = I2CResult::AddressNack;
      } else {
        for (; got < rlen; ++got) rbuf[got] = t->i2c_read(got + 1 < rlen);
      }
    }
    t->i2c_stop();
  }
  if (rx_count) *rx_count = got;
  ++transactions;
  if (result != I2CResult::Ok) ++nacks;
  const jwsim_ns_t dur = i2c_duration(wlen, rlen, write_phase, freq_hz);
  busy_ns += dur;
  if (duration_ns) *duration_ns = dur;

  // Traza determinista de la transacción.
  uint8_t hdr[4] = {'I', address, static_cast<uint8_t>(result), static_cast<uint8_t>(wlen)};
  jwsim_trace_bytes(hdr, sizeof(hdr));
  if (wlen) jwsim_trace_bytes(wbuf, wlen);
  if (got) jwsim_trace_bytes(rbuf, got);
  for (auto &cb : observers_) cb(*this, address, wbuf, wlen, rbuf, got, result);
  return result;
}

void SPIBus::attach(Net &cs, SPITarget *target) {
  targets_.emplace_back(&cs, target);
  cs.on_change([target](Net &, bool level) { target->spi_select(!level); });
}

void SPIBus::name_chip(Net &cs, std::string chip, Net *dc) {
  chips_.push_back(std::make_unique<Chip>());
  Chip *c = chips_.back().get();
  c->cs = &cs;
  c->dc = dc;
  c->tr.chip = std::move(chip);
  cs.on_change([this, c](Net &, bool level) {
    if (!capture_) return;
    if (!level) {
      // Bajada: empieza una transacción; lo suelto anterior se entrega antes.
      flush_capture();
      c->tr.clear();
      c->tr.t_start = jwsim_now();
    } else {
      emit(c->tr);
    }
  });
  if (dc) {
    dc->on_change([this, c](Net &, bool level) {
      if (capture_ && !c->cs->level() && c->tr.total && c->tr.total < SPITransaction::kMaxBytes) {
        c->tr.dc.emplace_back(c->tr.total, level);
      }
    });
  }
}

void SPIBus::set_capture(bool on) {
  capture_ = on && observer_;
  for (auto &c : chips_) {
    c->tr.clear();
    c->tr.t_start = jwsim_now();
  }
  loose_.clear();
}

void SPIBus::flush_capture() { emit(loose_); }

void SPIBus::emit(SPITransaction &tr) {
  if (capture_ && tr.total) observer_(*this, tr);
  tr.clear();
}

uint8_t SPIBus::transfer(uint8_t mosi) {
  uint8_t miso = 0xFF;
  bool any = false;
  for (auto &[cs, dev] : targets_) {
    if (!cs->level()) {
      miso &= dev->spi_transfer(mosi);
      any = true;
    }
  }
  ++bytes;
  if (!any) ++unselected_bytes;
  if (capture_) {
    bool named = false;
    for (auto &c : chips_) {
      if (c->cs->level()) continue;
      if (!c->tr.total && c->dc) c->tr.dc.emplace_back(0, c->dc->level());
      c->tr.push(mosi, miso);
      named = true;
    }
    if (!named) {
      if (!loose_.total) {
        loose_.chip = "sin CS";
        loose_.t_start = jwsim_now();
      }
      loose_.push(mosi, miso);
    }
  }
  return miso;
}

} // namespace jwsim
