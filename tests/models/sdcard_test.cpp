// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tests del modelo de tarjeta microSD (SPI), sin firmware: una prueba por
// fila de sim/models/sdcard/MODEL.md (gate JWSIM_G4_SD_DATALOG). El "host"
// arma los comandos como sd_diskio.cpp y avanza el tiempo virtual con un
// planificador sin tareas.
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/engine.h"
#include "jwsim/models/sdcard.h"
#include "test_util.h"

using jwsim::Net;
using jwsim::SPIBus;
using jwsim::models::SdCard;

namespace {

void advance_us(uint64_t us) {
  jwsim_run_limits lim{jwsim_now() + us * JWSIM_NS_PER_US};
  jwsim_run(&lim);
}

struct Host {
  SPIBus bus{"VSPI"};
  Net cs{"CS", true};
  SdCard sd;
  explicit Host(uint32_t mib = SdCard::kDefaultMiB) : sd(mib) { bus.attach(cs, &sd); }

  void sel() { cs.drive(false); }
  void desel() { cs.drive(true); }
  uint8_t x(uint8_t b = 0xFF) { return bus.transfer(b); }
  // Comando con CRC7 (o 0x01 si bad_crc) y espera de R1 hasta 9 bytes.
  uint8_t cmd(uint8_t idx, uint32_t arg, bool bad_crc = false, int *ncr = nullptr) {
    uint8_t c[6] = {static_cast<uint8_t>(0x40 | idx), static_cast<uint8_t>(arg >> 24), static_cast<uint8_t>(arg >> 16),
                    static_cast<uint8_t>(arg >> 8), static_cast<uint8_t>(arg), 0};
    c[5] = bad_crc ? 0x01 : static_cast<uint8_t>(SdCard::crc7(c, 5) << 1 | 1);
    for (uint8_t b : c) x(b);
    for (int i = 0; i < 9; ++i) {
      const uint8_t r = x();
      if (!(r & 0x80)) {
        if (ncr) *ncr = i + 1;
        return r;
      }
    }
    return 0xFF;
  }
  uint8_t acmd(uint8_t idx, uint32_t arg) {
    cmd(55, 0);
    return cmd(idx, arg);
  }
  uint32_t r32() {
    uint32_t v = 0;
    for (int i = 0; i < 4; ++i) v = v << 8 | x();
    return v;
  }
  // Secuencia de sd_diskio: CMD0, CMD59(1), CMD8, CMD58, ACMD41(HCS) hasta 0.
  void init() {
    sel();
    CHECK_EQ(cmd(0, 0), 0x01);
    CHECK_EQ(cmd(59, 1), 0x01);
    CHECK_EQ(cmd(8, 0x1AA), 0x01);
    r32();
    CHECK_EQ(cmd(58, 0), 0x01);
    r32();
    int tries = 0;
    while (acmd(41, 0x40100000) == 0x01 && tries++ < 2000) advance_us(100);
  }
  // Espera el token de datos; devuelve los µs esperados (-1 si no llega).
  int wait_token(uint8_t token = 0xFE) {
    for (int us = 0; us < 10000; ++us) {
      if (x() == token) return us;
      advance_us(1);
    }
    return -1;
  }
  std::vector<uint8_t> read_data(size_t n, bool *crc_ok) {
    std::vector<uint8_t> d(n);
    for (auto &b : d) b = x();
    const uint16_t crc = static_cast<uint16_t>(x() << 8 | x());
    if (crc_ok) *crc_ok = crc == SdCard::crc16(d.data(), n);
    return d;
  }
  // Bloque de escritura con token y CRC16; devuelve la respuesta de datos.
  uint8_t write_data(uint8_t token, const uint8_t *d, bool bad_crc = false) {
    x(token);
    for (size_t i = 0; i < SdCard::kBlock; ++i) x(d[i]);
    const uint16_t crc = static_cast<uint16_t>(SdCard::crc16(d, SdCard::kBlock) ^ (bad_crc ? 1 : 0));
    x(static_cast<uint8_t>(crc >> 8));
    x(static_cast<uint8_t>(crc));
    return x() & 0x1F;
  }
  // µs con MISO en 0x00 (ocupada).
  int busy_us() {
    int us = 0;
    while (x() == 0x00 && us < 100000) {
      advance_us(1);
      ++us;
    }
    return us;
  }
};

std::vector<uint8_t> pattern(uint8_t seed) {
  std::vector<uint8_t> d(SdCard::kBlock);
  for (size_t i = 0; i < d.size(); ++i) d[i] = static_cast<uint8_t>(seed + i * 7);
  return d;
}

} // namespace

TEST(fila01_crc_vectores) {
  const uint8_t cmd0[5] = {0x40, 0, 0, 0, 0};
  CHECK_EQ(SdCard::crc7(cmd0, 5) << 1 | 1, 0x95);
  const uint8_t cmd8[5] = {0x48, 0, 0, 0x01, 0xAA};
  CHECK_EQ(SdCard::crc7(cmd8, 5) << 1 | 1, 0x87);
  std::vector<uint8_t> ff(512, 0xFF);
  CHECK_EQ(SdCard::crc16(ff.data(), ff.size()), 0x7FA1);
}

TEST(fila02_modo_sd_solo_cmd0) {
  Host h;
  h.sel();
  CHECK_EQ(h.cmd(8, 0x1AA), 0xFF);          // antes de CMD0 no responde
  CHECK_EQ(h.cmd(0, 0, true), 0xFF);        // CMD0 con CRC malo: sigue en modo SD
  int ncr = 0;
  CHECK_EQ(h.cmd(0, 0, false, &ncr), 0x01);
  CHECK_EQ(ncr, 2);                          // NCR = 1 byte, R1 en el segundo
}

TEST(fila03_cmd8_r7) {
  Host h;
  h.sel();
  h.cmd(0, 0);
  CHECK_EQ(h.cmd(8, 0x1AA), 0x01);
  CHECK_EQ(h.r32(), 0x000001AAu);
  CHECK_EQ(h.cmd(8, 0x1AA, true), 0x09);    // CMD8 siempre verifica CRC
}

TEST(fila04_acmd41_inicializacion) {
  Host h;
  h.sel();
  h.cmd(0, 0);
  h.cmd(8, 0x1AA);
  h.r32();
  CHECK_EQ(h.cmd(58, 0), 0x01);
  CHECK_EQ(h.r32(), 0x00FF8000u);            // sin bit 31 (ocupada)
  CHECK_EQ(h.acmd(41, 0x40100000), 0x01);
  const jwsim_ns_t t0 = jwsim_now();
  while (h.acmd(41, 0x40100000) == 0x01) advance_us(1000);
  const jwsim_ns_t took = jwsim_now() - t0;
  CHECK(took >= SdCard::kInitTime - JWSIM_NS_PER_MS && took <= SdCard::kInitTime + 2 * JWSIM_NS_PER_MS);
  CHECK_EQ(h.cmd(58, 0), 0x00);
  CHECK_EQ(h.r32(), 0xC0FF8000u);            // listo + CCS (SDHC)
}

TEST(fila05_sin_hcs_no_termina) {
  Host h;
  h.sel();
  h.cmd(0, 0);
  h.cmd(8, 0x1AA);
  h.r32();
  for (int i = 0; i < 30; ++i) {
    CHECK_EQ(h.acmd(41, 0x00100000), 0x01);
    advance_us(10000);
  }
}

TEST(fila06_comandos_ilegales_en_reposo) {
  Host h;
  h.sel();
  h.cmd(0, 0);
  CHECK_EQ(h.cmd(17, 0), 0x05);
  CHECK_EQ(h.cmd(9, 0), 0x05);
  CHECK_EQ(h.cmd(33, 0), 0x05);
}

TEST(fila07_crc_activado) {
  Host h;
  h.init();
  CHECK_EQ(h.cmd(13, 0, true), 0x08);
  CHECK_EQ(h.cmd(59, 0), 0x00);              // sin CRC: el byte de CRC se ignora
  CHECK_EQ(h.cmd(13, 0, true), 0x00);
}

TEST(fila08_csd_y_cid) {
  Host h(128);
  h.init();
  CHECK_EQ(h.cmd(9, 0), 0x00);
  CHECK(h.wait_token() >= 0);
  bool ok = false;
  auto csd = h.read_data(16, &ok);
  CHECK(ok);
  CHECK_EQ(csd[0] >> 6, 1);                   // CSD 2.0
  const uint32_t c_size = (static_cast<uint32_t>(csd[7] & 0x3F) << 16 | csd[8] << 8 | csd[9]) + 1;
  CHECK_EQ(c_size << 10, 128u * 2048);        // fórmula de sd_diskio
  CHECK_EQ(csd[15], static_cast<uint8_t>(SdCard::crc7(csd.data(), 15) << 1 | 1));
  CHECK_EQ(h.cmd(10, 0), 0x00);
  CHECK(h.wait_token() >= 0);
  auto cid = h.read_data(16, &ok);
  CHECK(ok);
  CHECK_EQ(cid[0], 0x4A);
}

TEST(fila09_lectura_simple) {
  Host h;
  h.init();
  auto d = pattern(3);
  h.sd.write_sector(5000, d.data());
  CHECK_EQ(h.cmd(17, 5000), 0x00);
  const int wait = h.wait_token();
  CHECK(wait >= 95 && wait <= 105);           // latencia de lectura ~100 µs
  bool ok = false;
  CHECK(h.read_data(512, &ok) == d);
  CHECK(ok);
}

TEST(fila10_escritura_simple_y_ocupado) {
  Host h;
  h.init();
  auto d = pattern(9);
  CHECK_EQ(h.cmd(24, 7000), 0x00);
  CHECK_EQ(h.write_data(0xFE, d.data()), 0x05);
  const int busy = h.busy_us();
  CHECK(busy >= 495 && busy <= 505);
  uint8_t back[512];
  h.sd.read_sector(7000, back);
  CHECK(std::memcmp(back, d.data(), 512) == 0);
  // CRC incorrecto (CRC activado): rechazado, no se escribe.
  auto e = pattern(1);
  CHECK_EQ(h.cmd(24, 7001), 0x00);
  CHECK_EQ(h.write_data(0xFE, e.data(), true), 0x0B);
  h.sd.read_sector(7001, back);
  CHECK(back[0] == 0 && back[100] == 0);
}

TEST(fila11_lectura_multiple_y_cmd12) {
  Host h;
  h.init();
  for (uint32_t i = 0; i < 4; ++i) h.sd.write_sector(100 + i, pattern(static_cast<uint8_t>(i)).data());
  CHECK_EQ(h.cmd(18, 100), 0x00);
  for (uint32_t i = 0; i < 3; ++i) {
    CHECK(h.wait_token() >= 0);
    bool ok = false;
    CHECK(h.read_data(512, &ok) == pattern(static_cast<uint8_t>(i)));
    CHECK(ok);
  }
  // CMD12 (7 bytes con el de relleno, como sd_diskio) → R1 y ocupado breve.
  uint8_t c[6] = {0x4C, 0, 0, 0, 0, 0};
  c[5] = static_cast<uint8_t>(SdCard::crc7(c, 5) << 1 | 1);
  for (uint8_t b : c) h.x(b);
  h.x();
  uint8_t r1 = 0xFF;
  for (int i = 0; i < 9 && (r1 & 0x80); ++i) r1 = h.x();
  CHECK_EQ(r1, 0x00);
  CHECK(h.busy_us() <= 12);
  CHECK_EQ(h.cmd(13, 0), 0x00);
}

TEST(fila12_escritura_multiple_y_acmd22) {
  Host h;
  h.init();
  CHECK_EQ(h.acmd(23, 3), 0x00);
  CHECK_EQ(h.cmd(25, 300), 0x00);
  for (uint8_t i = 0; i < 3; ++i) {
    auto d = pattern(static_cast<uint8_t>(40 + i));
    CHECK_EQ(h.write_data(0xFC, d.data()), 0x05);
    CHECK(h.busy_us() >= 495);
  }
  h.x(0xFD);   // token de parada
  CHECK(h.busy_us() <= 12);
  for (uint32_t i = 0; i < 3; ++i) {
    uint8_t back[512];
    h.sd.read_sector(300 + i, back);
    CHECK(std::memcmp(back, pattern(static_cast<uint8_t>(40 + i)).data(), 512) == 0);
  }
  CHECK_EQ(h.acmd(22, 0), 0x00);
  CHECK(h.wait_token() >= 0);
  bool ok = false;
  auto n = h.read_data(4, &ok);
  CHECK(ok);
  CHECK_EQ(n[3], 3);
}

TEST(fila13_direccion_fuera_de_rango) {
  Host h;
  h.init();
  CHECK_EQ(h.cmd(17, h.sd.sectors()), 0x40);
  CHECK_EQ(h.cmd(24, h.sd.sectors() + 10), 0x40);
}

TEST(fila14_extraccion) {
  Host h;
  h.init();
  h.sd.set_inserted(false);
  CHECK_EQ(h.cmd(13, 0), 0xFF);
  h.sd.set_inserted(true);
  CHECK_EQ(h.cmd(13, 0), 0xFF);              // apagada: hace falta CMD0
  CHECK_EQ(h.cmd(0, 0), 0x01);
}

TEST(fila15_formato_de_fabrica) {
  SdCard sd(64);
  uint8_t s[512];
  sd.read_sector(0, s);
  CHECK_EQ(s[446 + 4], 0x0C);
  CHECK_EQ(s[446 + 8] | s[446 + 9] << 8, 2048);
  CHECK(s[510] == 0x55 && s[511] == 0xAA);
  sd.read_sector(2048, s);
  CHECK(std::memcmp(s + 82, "FAT32   ", 8) == 0);
  CHECK_EQ(s[13], 1);                          // 512 B por clúster hasta 260 MiB
  const uint32_t fatsz = s[36] | s[37] << 8 | s[38] << 16 | static_cast<uint32_t>(s[39]) << 24;
  const uint32_t clusters = (64u * 2048 - 2048 - 32 - 2 * fatsz);
  CHECK(clusters >= 65525);                    // FAT32 válido
  sd.read_sector(2049, s);
  const uint32_t free_count = s[488] | s[489] << 8 | s[490] << 16 | static_cast<uint32_t>(s[491]) << 24;
  CHECK_EQ(free_count, clusters - 1);
  sd.read_sector(2048 + 32, s);
  CHECK(s[0] == 0xF8 && s[8] == 0xFF && s[11] == 0x0F);
}

TEST(fila16_persistencia) {
  const auto dir = std::filesystem::temp_directory_path() / "jwsim-sdcard-test";
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
  {
    SdCard sd;
    sd.set_storage(dir.string());
    sd.write_sector(9000, pattern(5).data());
    CHECK(sd.save());
  }
  {
    SdCard sd;
    sd.set_storage(dir.string());
    uint8_t back[512];
    sd.read_sector(9000, back);
    CHECK(std::memcmp(back, pattern(5).data(), 512) == 0);
    sd.read_sector(2048, back);
    CHECK(std::memcmp(back + 82, "FAT32   ", 8) == 0);
  }
  // Imagen cruda del usuario: se usa tal cual y se actualiza en su lugar.
  std::filesystem::remove(dir / "sd.bin");
  {
    std::vector<char> img(32u * 1024 * 1024, 0);
    img[1000 * 512] = 0x5A;
    std::ofstream(dir / "sd.img", std::ios::binary).write(img.data(), static_cast<std::streamsize>(img.size()));
  }
  {
    SdCard sd;
    sd.set_storage(dir.string());
    CHECK_EQ(sd.sectors(), 32u * 2048);
    uint8_t back[512];
    sd.read_sector(1000, back);
    CHECK_EQ(back[0], 0x5A);
    sd.write_sector(1001, pattern(6).data());
    CHECK(sd.save());
  }
  std::ifstream in(dir / "sd.img", std::ios::binary);
  std::vector<char> img((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  CHECK_EQ(img.size(), 32u * 1024 * 1024);
  CHECK(std::memcmp(img.data() + 1001 * 512, pattern(6).data(), 512) == 0);
  CHECK(!std::filesystem::exists(dir / "sd.bin"));
  in.close();
  std::filesystem::remove_all(dir);
}

int main() { return run_all_tests("SDCARD"); }
