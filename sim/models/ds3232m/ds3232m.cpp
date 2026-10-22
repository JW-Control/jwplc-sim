// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
#include "jwsim/models/ds3232m.h"

#include <cstring>

#include "jwsim/engine.h"
#include "jwsim/models/persist.h"

namespace jwsim::models {

namespace {

constexpr int64_t kNsPerS = 1000000000LL;
uint8_t bcd(int v) { return static_cast<uint8_t>(((v / 10) << 4) | (v % 10)); }
int unbcd(uint8_t v) { return (v >> 4) * 10 + (v & 0x0F); }
int64_t floor_div(int64_t a, int64_t b) { return a / b - ((a % b != 0) && ((a < 0) != (b < 0))); }

// Fecha civil ↔ días desde 1970-01-01 (algoritmo de H. Hinnant).
int64_t days_from_civil(int y, int m, int d) {
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const int64_t yoe = y - era * 400;
  const int64_t doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const int64_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}
void civil_from_days(int64_t z, int &y, int &m, int &d) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const int64_t doe = z - era * 146097;
  const int64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const int64_t mp = (5 * doy + 2) / 153;
  d = static_cast<int>(doy - (153 * mp + 2) / 5 + 1);
  m = static_cast<int>(mp < 10 ? mp + 3 : mp - 9);
  y = static_cast<int>(yoe + era * 400 + (m <= 2));
}

struct Fields {
  int sec, min, hour, date, month, year;
};

Fields fields_of(int64_t epoch) {
  Fields f{};
  const int64_t days = floor_div(epoch, 86400);
  const int64_t secs = epoch - days * 86400;
  f.hour = static_cast<int>(secs / 3600);
  f.min = static_cast<int>(secs / 60 % 60);
  f.sec = static_cast<int>(secs % 60);
  civil_from_days(days, f.year, f.month, f.date);
  return f;
}

int64_t epoch_of(const Fields &f) {
  return days_from_civil(f.year, f.month, f.date) * 86400 + f.hour * 3600 + f.min * 60 + f.sec;
}

// Hora de un registro de horas (12/24 h) a 0..23.
int hour_of(uint8_t v) {
  if (v & 0x40) {
    int h = (((v >> 4) & 1) * 10) + (v & 0x0F);  // 1..12
    const bool pm = v & 0x20;
    if (h == 12) h = 0;
    return pm ? h + 12 : h;
  }
  return unbcd(v & 0x3F);
}

} // namespace

DS3232M::DS3232M() {
  regs_[CONTROL] = 0x1C;           // INTCN = 1, alarmas deshabilitadas
  regs_[STATUS] = ST_OSF | 0x08;   // OSF = 1 (recién alimentado), EN32kHz = 1; A1F = A2F = 0
  last_alarm_check_ = base_epoch_;
}

int64_t DS3232M::now_epoch() const { return base_epoch_ + floor_div(jwsim_now() - base_t_, kNsPerS); }

int DS3232M::dow_at(int64_t epoch) const {
  const int64_t days = floor_div(epoch, 86400);
  return static_cast<int>(((dow_base_ - 1 + (days - dow_day_)) % 7 + 7) % 7) + 1;
}

void DS3232M::rebase(int64_t epoch) {
  // El contador de día de semana conserva su valor al cambiar la hora.
  dow_base_ = dow_at(now_epoch());
  dow_day_ = floor_div(epoch, 86400);
  base_epoch_ = epoch;
  base_t_ = jwsim_now();
  last_alarm_check_ = epoch;
}

void DS3232M::set_time(int64_t epoch) {
  rebase(epoch);
  // Hora puesta por el simulador: día de semana coherente con la fecha
  // (1 = domingo, como JW_RTC) y OSF = 0.
  dow_base_ = static_cast<int>(((dow_day_ + 4) % 7 + 7) % 7) + 1;
  regs_[STATUS] &= static_cast<uint8_t>(~ST_OSF);
  dirty_ = true;
}

void DS3232M::latch_time() {
  const int64_t now = now_epoch();
  const Fields f = fields_of(now);
  latched_[0] = bcd(f.sec);
  latched_[1] = bcd(f.min);
  if (h12_) {
    int h = f.hour % 12;
    if (h == 0) h = 12;
    latched_[2] = static_cast<uint8_t>(0x40 | (f.hour >= 12 ? 0x20 : 0) | bcd(h));
  } else {
    latched_[2] = bcd(f.hour);
  }
  latched_[3] = static_cast<uint8_t>(dow_at(now));
  latched_[4] = bcd(f.date);
  latched_[5] = static_cast<uint8_t>((f.year >= 2100 ? 0x80 : 0) | bcd(f.month));
  latched_[6] = bcd(f.year % 100);
}

void DS3232M::check_alarms() {
  const int64_t now = now_epoch();
  if (now <= last_alarm_check_) return;
  const int64_t from = last_alarm_check_ + 1;
  last_alarm_check_ = now;
  auto match_day = [&](uint8_t dayreg, int64_t t, const Fields &f) {
    return (dayreg & 0x40) ? (dayreg & 0x0F) == dow_at(t) : unbcd(dayreg & 0x3F) == f.date;
  };
  // Alarma 1: máscara A1M4..A1M1.
  const int m1 = ((regs_[A1_SEC] >> 7) & 1) | (((regs_[A1_MIN] >> 7) & 1) << 1) | (((regs_[A1_HOUR] >> 7) & 1) << 2) |
                 (((regs_[A1_DAY] >> 7) & 1) << 3);
  auto a1 = [&](int64_t t) {
    const Fields f = fields_of(t);
    if (m1 == 0xF) return true;
    if (unbcd(regs_[A1_SEC] & 0x7F) != f.sec) return false;
    if (m1 == 0xE) return true;
    if (unbcd(regs_[A1_MIN] & 0x7F) != f.min) return false;
    if (m1 == 0xC) return true;
    if (hour_of(regs_[A1_HOUR] & 0x7F) != f.hour) return false;
    if (m1 == 0x8) return true;
    return m1 == 0 && match_day(regs_[A1_DAY], t, f);
  };
  // Alarma 2: máscara A2M4..A2M2 (siempre a los 00 segundos).
  const int m2 = ((regs_[A2_MIN] >> 7) & 1) | (((regs_[A2_HOUR] >> 7) & 1) << 1) | (((regs_[A2_DAY] >> 7) & 1) << 2);
  auto a2 = [&](int64_t t) {
    const Fields f = fields_of(t);
    if (f.sec != 0) return false;
    if (m2 == 0x7) return true;
    if (unbcd(regs_[A2_MIN] & 0x7F) != f.min) return false;
    if (m2 == 0x6) return true;
    if (hour_of(regs_[A2_HOUR] & 0x7F) != f.hour) return false;
    if (m2 == 0x4) return true;
    return m2 == 0 && match_day(regs_[A2_DAY], t, f);
  };
  // Más de 32 días sin consultar: toda alarma coincidió al menos una vez.
  if (now - from > 32LL * 86400) {
    regs_[STATUS] |= ST_A1F | ST_A2F;
    return;
  }
  // Candidatos minuto a minuto: el segundo de A1 (o cualquiera) y el 00 de A2.
  for (int64_t minute = floor_div(from, 60); minute <= floor_div(now, 60); ++minute) {
    const int64_t m0 = minute * 60;
    if (!(regs_[STATUS] & ST_A1F)) {
      if (m1 == 0xF) {
        regs_[STATUS] |= ST_A1F;
      } else {
        const int64_t t = m0 + unbcd(regs_[A1_SEC] & 0x7F);
        if (t >= from && t <= now && a1(t)) regs_[STATUS] |= ST_A1F;
      }
    }
    if (!(regs_[STATUS] & ST_A2F) && m0 >= from && m0 <= now && a2(m0)) regs_[STATUS] |= ST_A2F;
  }
}

uint8_t DS3232M::reg(uint8_t r) const {
  auto *self = const_cast<DS3232M *>(this);
  if (r <= YEAR) {
    self->latch_time();
    return latched_[r];
  }
  if (r == STATUS) self->check_alarms();
  if (r == TEMP_MSB) return static_cast<uint8_t>(temp_q_ >> 2);
  if (r == TEMP_LSB) return static_cast<uint8_t>((temp_q_ & 3) << 6);
  return regs_[r];
}

void DS3232M::write_reg(uint8_t r, uint8_t v) {
  dirty_ = true;
  if (r == DAY) {
    dow_base_ = (v & 0x07) ? (v & 0x07) : 1;
    dow_day_ = floor_div(now_epoch(), 86400);
    return;
  }
  if (r <= YEAR) {
    // Escribir la hora: el resto de los campos sigue el valor actual;
    // escribir los segundos reinicia el divisor (el próximo segundo llega en 1 s).
    Fields f = fields_of(now_epoch());
    switch (r) {
      case SECONDS: f.sec = unbcd(v & 0x7F); break;
      case MINUTES: f.min = unbcd(v & 0x7F); break;
      case HOURS:
        h12_ = v & 0x40;
        f.hour = hour_of(v);
        break;
      case DATE: f.date = unbcd(v & 0x3F); break;
      case MONTH:
        f.month = unbcd(v & 0x1F);
        f.year = 2000 + (f.year % 100) + ((v & 0x80) ? 100 : 0);
        break;
      case YEAR: f.year = (f.year >= 2100 ? 2100 : 2000) + unbcd(v); break;
      default: break;
    }
    const int64_t keep_frac = r == SECONDS ? 0 : (jwsim_now() - base_t_) % kNsPerS;
    rebase(epoch_of(f));
    base_t_ -= keep_frac;
    return;
  }
  switch (r) {
    case CONTROL:
      regs_[CONTROL] = static_cast<uint8_t>(v & ~0x20);  // CONV: la conversión termina al instante
      break;
    case STATUS:
      // OSF, A2F y A1F solo se pueden borrar; el resto se escribe.
      check_alarms();
      regs_[STATUS] = static_cast<uint8_t>((regs_[STATUS] & v & (ST_OSF | ST_A2F | ST_A1F)) | (v & 0x78));
      break;
    case TEMP_MSB:
    case TEMP_LSB:
    case TEST:
      break;  // solo lectura / reservado
    default:
      regs_[r] = v;
      if (r >= A1_SEC && r <= A2_DAY) last_alarm_check_ = now_epoch();
      break;
  }
}

bool DS3232M::i2c_start(bool read) {
  if (read) latch_time();
  else have_ptr_ = false;
  return true;
}

bool DS3232M::i2c_write(uint8_t byte) {
  if (!have_ptr_) {
    ptr_ = byte;
    have_ptr_ = true;
    latch_time();
    return true;
  }
  write_reg(ptr_, byte);
  ++ptr_;  // tras 0xFF vuelve a 0x00
  return true;
}

uint8_t DS3232M::i2c_read(bool) {
  const uint8_t v = ptr_ <= YEAR ? latched_[ptr_] : reg(ptr_);
  ++ptr_;
  if (ptr_ == 0) latch_time();  // al volver a 0 se actualizan los buffers
  return v;
}

void DS3232M::i2c_stop() {}

// ------------------------------------------------------------ persistencia
// rtc.bin: "JWRT", versión 1, hora (int64 s), día de semana (1..7), modo
// 12 h y los 256 registros (alarmas, control, estado, aging, SRAM).
void DS3232M::set_storage(const std::string &dir) {
  dir_ = dir;
  std::vector<uint8_t> d;
  if (!read_file(join_path(dir, "rtc.bin"), d) || d.size() < 4 + 1 + 8 + 2 + 256 || std::memcmp(d.data(), "JWRT", 4) != 0) return;
  int64_t epoch = 0;
  std::memcpy(&epoch, d.data() + 5, 8);
  h12_ = d[14] != 0;
  std::memcpy(regs_.data(), d.data() + 15, 256);
  rebase(epoch);
  dow_base_ = (d[13] >= 1 && d[13] <= 7) ? d[13] : 1;
  dow_day_ = floor_div(epoch, 86400);
}

bool DS3232M::save() {
  if (dir_.empty()) return true;
  std::vector<uint8_t> d(4 + 1 + 8 + 2 + 256);
  std::memcpy(d.data(), "JWRT", 4);
  d[4] = 1;
  const int64_t epoch = now_epoch();
  std::memcpy(d.data() + 5, &epoch, 8);
  d[13] = static_cast<uint8_t>(dow_at(epoch));
  d[14] = h12_ ? 1 : 0;
  std::memcpy(d.data() + 15, regs_.data(), 256);
  dirty_ = false;
  return write_file_atomic(join_path(dir_, "rtc.bin"), d.data(), d.size());
}

} // namespace jwsim::models
