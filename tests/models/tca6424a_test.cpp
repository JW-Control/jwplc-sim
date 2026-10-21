// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo TCA6424A, sin firmware: una prueba por fila de
// sim/models/tca6424a/MODEL.md (gate JWSIM_G1_TCA6424A_MODEL).
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/models/tca6424a.h"
#include "test_util.h"

using jwsim::I2CBus;
using jwsim::I2CResult;
using jwsim::models::TCA6424A;

namespace {

struct Fixture {
  I2CBus bus{"I2C"};
  TCA6424A tca{"U1", 0x22};
  Fixture() { bus.attach(0x22, &tca); }

  I2CResult write(std::vector<uint8_t> bytes) {
    return bus.transfer(0x22, bytes.data(), bytes.size(), nullptr, 0, nullptr, 100000, nullptr);
  }
  std::vector<uint8_t> read(uint8_t cmd, size_t n) {
    std::vector<uint8_t> out(n);
    size_t got = 0;
    bus.transfer(0x22, &cmd, 1, out.data(), n, &got, 100000, nullptr);
    out.resize(got);
    return out;
  }
  uint8_t read1(uint8_t cmd) { return read(cmd, 1).at(0); }
};

} // namespace

TEST(fila01_direccion) {
  Fixture f;
  uint8_t cmd = 0;
  CHECK(f.bus.transfer(0x22, &cmd, 1, nullptr, 0, nullptr, 100000, nullptr) == I2CResult::Ok);
  CHECK(f.bus.transfer(0x23, &cmd, 1, nullptr, 0, nullptr, 100000, nullptr) == I2CResult::AddressNack);
  TCA6424A high{"U2", 0x23};
  f.bus.attach(0x23, &high);
  CHECK(f.bus.transfer(0x23, &cmd, 1, nullptr, 0, nullptr, 100000, nullptr) == I2CResult::Ok);
}

TEST(fila02_03_comando_y_mapa) {
  Fixture f;
  f.write({0x04, 0x12});
  f.write({0x05, 0x34});
  f.write({0x06, 0x56});
  f.write({0x08, 0x01});
  f.write({0x0D, 0x0F});
  CHECK_EQ(f.read1(0x04), 0x12);
  CHECK_EQ(f.read1(0x05), 0x34);
  CHECK_EQ(f.read1(0x06), 0x56);
  CHECK_EQ(f.read1(0x08), 0x01);
  CHECK_EQ(f.read1(0x0D), 0x0F);
  CHECK_EQ(f.tca.reg(0x0C), 0xFF);
}

TEST(fila04_valores_por) {
  Fixture f;
  for (uint8_t r : {0x04, 0x05, 0x06}) CHECK_EQ(f.tca.reg(r), 0xFF);
  for (uint8_t r : {0x08, 0x09, 0x0A}) CHECK_EQ(f.tca.reg(r), 0x00);
  for (uint8_t r : {0x0C, 0x0D, 0x0E}) CHECK_EQ(f.tca.reg(r), 0xFF);
  // Todo entrada tras POR: ningún pin se maneja.
  for (int i = 0; i < 24; ++i) CHECK(!f.tca.pin(i).driven());
}

TEST(fila05_input_refleja_pines_entrada_y_salida) {
  Fixture f;
  f.tca.pin(0).drive(true);    // P00 entrada manejada desde fuera
  f.tca.pin(1).drive(false);
  f.tca.pin(2).set_idle(false);
  CHECK_EQ(f.read1(0x00) & 0x07, 0x01);
  // P10 como salida en alto: el Input Port 1 lo refleja.
  f.write({0x05, 0x01});
  f.write({0x0D, 0xFE});
  CHECK(f.tca.pin(8).level());
  CHECK_EQ(f.read1(0x01) & 0x01, 0x01);
  f.write({0x05, 0x00});
  CHECK_EQ(f.read1(0x01) & 0x01, 0x00);
}

TEST(fila06_input_solo_lectura) {
  Fixture f;
  for (int i = 0; i < 8; ++i) f.tca.pin(i).drive(false);
  f.write({0x00, 0xFF});
  CHECK_EQ(f.read1(0x00), 0x00);
}

TEST(fila07_polaridad_entradas_y_salidas) {
  Fixture f;
  for (int i = 0; i < 8; ++i) f.tca.pin(i).drive(false);
  f.write({0x08, 0x81});
  CHECK_EQ(f.read1(0x00), 0x81);
  // Salida P10 en alto con polaridad invertida: se lee 0.
  f.write({0x05, 0x01});
  f.write({0x0D, 0xFE});
  f.write({0x09, 0x01});
  CHECK_EQ(f.read1(0x01) & 0x01, 0x00);
  // La polaridad no cambia el nivel eléctrico del pin.
  CHECK(f.tca.pin(8).level());
}

TEST(fila08_configuracion) {
  Fixture f;
  f.write({0x04, 0xA5});
  CHECK(!f.tca.pin(0).driven());
  f.write({0x0C, 0x00});
  for (int b = 0; b < 8; ++b) {
    CHECK(f.tca.pin(b).driven());
    CHECK_EQ(f.tca.pin(b).level(), ((0xA5 >> b) & 1) != 0);
  }
  f.write({0x0C, 0xFF});
  CHECK(!f.tca.pin(0).driven());
}

TEST(fila09_auto_incremento) {
  Fixture f;
  // Escritura con AI: Output0, Output1, Output2 y vuelve a Output0.
  f.write({0x84, 0x11, 0x22, 0x33, 0x44});
  CHECK_EQ(f.tca.reg(0x04), 0x44);
  CHECK_EQ(f.tca.reg(0x05), 0x22);
  CHECK_EQ(f.tca.reg(0x06), 0x33);
  // Lectura con AI desde Output1: 1, 2, 0 (salta la dirección reservada x3).
  auto r = f.read(0x85, 3);
  CHECK_EQ(r.size(), 3u);
  CHECK_EQ(r[0], 0x22);
  CHECK_EQ(r[1], 0x33);
  CHECK_EQ(r[2], 0x44);
}

TEST(fila10_sin_auto_incremento) {
  Fixture f;
  f.write({0x04, 0x11, 0x22, 0x33});
  CHECK_EQ(f.tca.reg(0x04), 0x33);
  CHECK_EQ(f.tca.reg(0x05), 0xFF);
  auto r = f.read(0x04, 3);
  CHECK_EQ(r[0], 0x33);
  CHECK_EQ(r[1], 0x33);
  CHECK_EQ(r[2], 0x33);
}

TEST(fila11_interrupcion) {
  Fixture f;
  for (int i = 0; i < 8; ++i) f.tca.pin(i).drive(false);
  f.read1(0x00);
  CHECK(f.tca.int_n().level());          // sin interrupción
  f.tca.pin(3).drive(true);              // flanco en una entrada
  CHECK(!f.tca.int_n().level());
  f.tca.pin(3).drive(false);             // vuelve al valor original
  CHECK(f.tca.int_n().level());
  f.tca.pin(3).drive(true);
  CHECK(!f.tca.int_n().level());
  f.read1(0x01);                         // leer otro puerto no la borra
  CHECK(!f.tca.int_n().level());
  f.read1(0x00);                         // leer el puerto que la generó sí
  CHECK(f.tca.int_n().level());
  // Un pin de salida no genera interrupción.
  f.write({0x0D, 0x00});
  f.write({0x05, 0xFF});
  f.write({0x05, 0x00});
  CHECK(f.tca.int_n().level());
}

TEST(fila11_interrupcion_falsa_salida_a_entrada) {
  Fixture f;
  f.tca.pin(8).set_idle(true);
  f.read1(0x01);                         // snapshot: P10 = 1 (entrada en reposo)
  f.write({0x05, 0x00});
  f.write({0x0D, 0xFE});                 // P10 salida en 0
  CHECK(f.tca.int_n().level());          // salida: no interrumpe
  f.tca.pin(8).set_idle(false);          // la placa deja la línea en 0
  f.write({0x0D, 0xFF});                 // vuelve a entrada con nivel != snapshot
  CHECK(!f.tca.int_n().level());
}

TEST(fila12_reset) {
  Fixture f;
  f.write({0x04, 0x00});
  f.write({0x0C, 0x00});
  f.tca.reset_n().drive(false);
  uint8_t cmd = 0x04;
  CHECK(f.bus.transfer(0x22, &cmd, 1, nullptr, 0, nullptr, 100000, nullptr) == I2CResult::AddressNack);
  f.tca.reset_n().drive(true);
  CHECK_EQ(f.tca.reg(0x04), 0xFF);
  CHECK_EQ(f.tca.reg(0x0C), 0xFF);
  CHECK(!f.tca.pin(0).driven());
}

TEST(fila13_sin_pullups_internos) {
  Fixture f;
  f.tca.pin(5).set_idle(false);
  CHECK_EQ(f.read1(0x00) & 0x20, 0x00);
  f.tca.pin(5).set_idle(true);
  CHECK_EQ(f.read1(0x00) & 0x20, 0x20);
}

TEST(fila14_duracion_i2c) {
  Fixture f;
  uint8_t cmd = 0x00, rd = 0;
  jwsim_ns_t d = 0;
  // readReg8 a 100 kHz: START + 2 bytes (9 bits) + Sr + 2 bytes + STOP = 39 bits.
  f.bus.transfer(0x22, &cmd, 1, &rd, 1, nullptr, 100000, &d);
  CHECK_EQ(d, 39u * 10000u);
  f.bus.transfer(0x22, &cmd, 1, &rd, 1, nullptr, 400000, &d);
  CHECK_EQ(d, 39u * 2500u);
}

int main() { return run_all_tests("tca6424a"); }
