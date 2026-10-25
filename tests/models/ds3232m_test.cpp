// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo DS3232M, sin firmware: una prueba por fila de
// sim/models/ds3232m/MODEL.md (gate JWSIM_G4_RTC_DS3232M). El tiempo virtual
// avanza con un planificador sin tareas (jwsim_run hasta un instante).
#include <cstdio>
#include <filesystem>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/engine.h"
#include "jwsim/models/ds3232m.h"
#include "test_util.h"

using jwsim::I2CBus;
using jwsim::I2CResult;
using jwsim::models::DS3232M;

namespace {

void advance_ms(int64_t ms) {
  jwsim_run_limits lim{jwsim_now() + ms * JWSIM_NS_PER_MS};
  jwsim_run(&lim);
}

struct Fixture {
  I2CBus bus{"I2C"};
  DS3232M rtc;
  Fixture() { bus.attach(DS3232M::kAddress, &rtc); }
  void write(std::vector<uint8_t> b) { bus.transfer(DS3232M::kAddress, b.data(), b.size(), nullptr, 0, nullptr, 400000, nullptr); }
  std::vector<uint8_t> read(uint8_t reg, size_t n) {
    std::vector<uint8_t> out(n);
    size_t got = 0;
    bus.transfer(DS3232M::kAddress, &reg, 1, out.data(), n, &got, 400000, nullptr);
    return out;
  }
};

// 2026-10-22 23:59:58 UTC
constexpr int64_t kT = 1792713598;

} // namespace

TEST(fila01_osf_y_valores_por) {
  Fixture f;
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0], 0x88);  // OSF y EN32kHz; sin banderas de alarma
  CHECK_EQ(f.read(DS3232M::CONTROL, 1)[0], 0x1C);
  auto t = f.read(0, 7);
  CHECK_EQ(t[4], 0x01);  // 01/01/00
  CHECK_EQ(t[5], 0x01);
  CHECK_EQ(t[6], 0x00);
}

TEST(fila02_hora_bcd_y_avance_con_tiempo_virtual) {
  Fixture f;
  f.rtc.set_time(kT);
  auto t = f.read(0, 7);
  CHECK_EQ(t[0], 0x58);
  CHECK_EQ(t[1], 0x59);
  CHECK_EQ(t[2], 0x23);
  CHECK_EQ(t[4], 0x22);
  CHECK_EQ(t[5], 0x10);
  CHECK_EQ(t[6], 0x26);
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_OSF, 0);
  advance_ms(2000);  // cambio de día
  t = f.read(0, 7);
  CHECK_EQ(t[0], 0x00);
  CHECK_EQ(t[2], 0x00);
  CHECK_EQ(t[4], 0x23);
}

TEST(fila03_escritura_de_hora_y_divisor) {
  Fixture f;
  advance_ms(700);
  // 2027-03-15 08:30:10 (registros 0..6; día de semana 2).
  f.write({0x00, 0x10, 0x30, 0x08, 0x02, 0x15, 0x03, 0x27});
  advance_ms(999);
  CHECK_EQ(f.read(0, 1)[0], 0x10);  // escribir los segundos reinicia el divisor
  advance_ms(1);
  CHECK_EQ(f.read(0, 1)[0], 0x11);
  CHECK_EQ(f.read(DS3232M::DAY, 1)[0], 0x02);
}

TEST(fila04_modo_12_horas) {
  Fixture f;
  f.rtc.set_time(kT);  // 23:59:58
  f.write({DS3232M::HOURS, 0x40 | 0x20 | 0x11});  // 11 PM en modo 12 h
  CHECK_EQ(f.read(DS3232M::HOURS, 1)[0], 0x40 | 0x20 | 0x11);
  advance_ms(2000);  // 12 AM
  CHECK_EQ(f.read(DS3232M::HOURS, 1)[0], 0x40 | 0x12);
}

TEST(fila05_buffers_de_lectura_coherentes) {
  Fixture f;
  f.rtc.set_time(kT + 1);  // 23:59:59
  // Lectura en dos partes dentro del mismo START: los valores no se mezclan.
  uint8_t reg = 0;
  uint8_t out[7];
  size_t got = 0;
  f.bus.transfer(DS3232M::kAddress, &reg, 1, out, 7, &got, 400000, nullptr);
  CHECK_EQ(out[0], 0x59);
  CHECK_EQ(out[2], 0x23);
}

TEST(fila06_alarma1_y_bandera) {
  Fixture f;
  f.rtc.set_time(kT);  // 23:59:58
  f.write({DS3232M::A1_SEC, 0x05, 0x80, 0x80, 0x80});  // segundos = 05
  advance_ms(5000);
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_A1F, 0);
  advance_ms(2000);  // 00:00:05
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_A1F, DS3232M::ST_A1F);
  f.write({DS3232M::STATUS, 0x00});  // solo se puede borrar
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_A1F, 0);
}

TEST(fila07_alarma2_por_minuto) {
  Fixture f;
  f.rtc.set_time(kT);
  f.write({DS3232M::A2_MIN, 0x80, 0x80, 0x80});  // una vez por minuto (a los 00 s)
  advance_ms(1000);
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_A2F, 0);
  advance_ms(1000);
  CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_A2F, DS3232M::ST_A2F);
}

TEST(fila08_temperatura) {
  Fixture f;
  f.rtc.set_temperature_quarters(-3);  // -0,75 °C
  auto t = f.read(DS3232M::TEMP_MSB, 2);
  CHECK_EQ(t[0], 0xFF);
  CHECK_EQ(t[1], 0x40);
}

TEST(fila09_sram_y_vuelta_del_puntero) {
  Fixture f;
  f.write({0xFE, 0xAA, 0xBB, 0x00});  // 0xFE, 0xFF y vuelve a 0x00 (segundos)
  auto s = f.read(0xFE, 2);
  CHECK_EQ(s[0], 0xAA);
  CHECK_EQ(s[1], 0xBB);
  CHECK_EQ(f.read(0, 1)[0], 0x00);
}

TEST(fila10_persistencia) {
  const auto dir = (std::filesystem::temp_directory_path() / "jwsim_rtc_test").string();
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
  {
    Fixture f;
    f.rtc.set_storage(dir);
    f.rtc.set_time(kT);
    f.write({0x20, 0x5A});  // SRAM
    advance_ms(3000);
    CHECK(f.rtc.save());
  }
  {
    Fixture f;
    f.rtc.set_storage(dir);
    CHECK_EQ(f.rtc.now_epoch(), kT + 3);
    CHECK_EQ(f.read(0x20, 1)[0], 0x5A);
    CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_OSF, 0);
  }
  std::filesystem::remove_all(dir);
}

TEST(fila12_sin_bateria) {
  const auto dir = (std::filesystem::temp_directory_path() / "jwsim_rtc_test_bat").string();
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
  {
    Fixture f;
    f.rtc.set_storage(dir);
    f.rtc.set_time(kT);
    f.write({0x20, 0x5A});
    CHECK(f.rtc.save());
  }
  {
    Fixture f;
    f.rtc.set_storage(dir);
    f.rtc.power_loss();
    CHECK_EQ(f.read(DS3232M::STATUS, 1)[0], 0x88);  // OSF: hora no válida
    CHECK_EQ(f.rtc.now_epoch(), 946684800);           // 2000-01-01 00:00:00
    CHECK_EQ(f.read(0x20, 1)[0], 0x00);               // SRAM perdida
    advance_ms(2000);
    CHECK_EQ(f.rtc.now_epoch(), 946684802);           // con alimentación sigue contando
    CHECK(f.rtc.save());
  }
  {
    Fixture f;
    f.rtc.set_storage(dir);
    CHECK_EQ(f.read(DS3232M::STATUS, 1)[0] & DS3232M::ST_OSF, DS3232M::ST_OSF);
  }
  std::filesystem::remove_all(dir);
}

int main() { return run_all_tests("DS3232M"); }
