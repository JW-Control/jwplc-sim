// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo MB85RS64V (FRAM SPI), sin firmware: una prueba por fila
// de sim/models/mb85rs64v/MODEL.md (gate JWSIM_G4_FRAM_PERSIST).
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/models/mb85rs64v.h"
#include "test_util.h"

using jwsim::Net;
using jwsim::SPIBus;
using jwsim::models::MB85RS64V;

namespace {

struct Fixture {
  SPIBus bus{"VSPI"};
  Net cs{"CS", true};
  MB85RS64V fram;
  Fixture() { bus.attach(cs, &fram); }

  std::vector<uint8_t> xfer(std::vector<uint8_t> out) {
    cs.drive(false);
    std::vector<uint8_t> in;
    for (uint8_t b : out) in.push_back(bus.transfer(b));
    cs.drive(true);
    return in;
  }
  void write(uint16_t addr, std::vector<uint8_t> data) {
    xfer({MB85RS64V::WREN});
    std::vector<uint8_t> cmd = {MB85RS64V::WRITE, uint8_t(addr >> 8), uint8_t(addr)};
    cmd.insert(cmd.end(), data.begin(), data.end());
    xfer(cmd);
  }
  std::vector<uint8_t> read(uint16_t addr, size_t n) {
    std::vector<uint8_t> cmd = {MB85RS64V::READ, uint8_t(addr >> 8), uint8_t(addr)};
    cmd.resize(3 + n, 0);
    auto in = xfer(cmd);
    return {in.begin() + 3, in.end()};
  }
  uint8_t rdsr() { return xfer({MB85RS64V::RDSR, 0}).at(1); }
};

} // namespace

TEST(fila01_rdid) {
  Fixture f;
  auto in = f.xfer({MB85RS64V::RDID, 0, 0, 0, 0});
  CHECK_EQ(in[1], 0x04);
  CHECK_EQ(in[2], 0x7F);
  CHECK_EQ(in[3], 0x03);
  CHECK_EQ(in[4], 0x02);
}

TEST(fila02_escritura_requiere_wel) {
  Fixture f;
  f.xfer({MB85RS64V::WRITE, 0x00, 0x10, 0xAB});  // sin WREN
  CHECK_EQ(f.read(0x10, 1)[0], 0x00);
  f.write(0x10, {0xAB});
  CHECK_EQ(f.read(0x10, 1)[0], 0xAB);
}

TEST(fila03_wel_se_borra_al_terminar_write) {
  Fixture f;
  f.xfer({MB85RS64V::WREN});
  CHECK_EQ(f.rdsr() & MB85RS64V::SR_WEL, MB85RS64V::SR_WEL);
  f.xfer({MB85RS64V::WRITE, 0x00, 0x00, 0x01});
  CHECK_EQ(f.rdsr() & MB85RS64V::SR_WEL, 0);
  f.xfer({MB85RS64V::WREN});
  f.xfer({MB85RS64V::WRDI});
  CHECK_EQ(f.rdsr() & MB85RS64V::SR_WEL, 0);
}

TEST(fila04_autoincremento_y_vuelta) {
  Fixture f;
  f.write(0x1FFE, {1, 2, 3, 4});  // 0x1FFE, 0x1FFF, 0x0000, 0x0001
  CHECK_EQ(f.read(0x1FFE, 2)[1], 2);
  CHECK_EQ(f.read(0x0000, 2)[0], 3);
  CHECK_EQ(f.read(0x0000, 2)[1], 4);
  // Bits de dirección por encima de 13 se ignoran.
  CHECK_EQ(f.read(0xE000, 1)[0], 3);
}

TEST(fila05_proteccion_por_bloques) {
  Fixture f;
  f.xfer({MB85RS64V::WREN});
  f.xfer({MB85RS64V::WRSR, MB85RS64V::SR_BP0});  // cuarto superior
  CHECK_EQ(f.rdsr() & 0x0C, MB85RS64V::SR_BP0);
  f.write(0x1800, {0x55});
  f.write(0x17FF, {0x66});
  CHECK_EQ(f.read(0x1800, 1)[0], 0x00);
  CHECK_EQ(f.read(0x17FF, 1)[0], 0x66);
}

TEST(fila06_persistencia) {
  const auto dir = (std::filesystem::temp_directory_path() / "jwsim_fram_test").string();
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
  {
    Fixture f;
    f.fram.set_storage(dir);
    f.write(0x0040, {'J', 'W'});
    f.xfer({MB85RS64V::WREN});
    f.xfer({MB85RS64V::WRSR, MB85RS64V::SR_BP1});
    CHECK(f.fram.save());
  }
  {
    Fixture f;
    f.fram.set_storage(dir);
    CHECK_EQ(f.read(0x0040, 2)[1], 'W');
    // Bits no volátiles conservados; WEL arranca en 0.
    CHECK_EQ(f.rdsr(), MB85RS64V::SR_BP1);
  }
  std::filesystem::remove_all(dir);
}

int main() { return run_all_tests("MB85RS64V"); }
