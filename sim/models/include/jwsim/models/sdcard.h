// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tarjeta microSD en modo SPI (SDHC, bloques de 512 bytes) sobre una imagen
// de disco. Ver sim/models/sdcard/MODEL.md.
#ifndef JWSIM_MODELS_SDCARD_H
#define JWSIM_MODELS_SDCARD_H

#include <array>
#include <cstdint>
#include <deque>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "jwsim/devices.h"
#include "jwsim/engine.h"

namespace jwsim::models {

class SdCard : public SPITarget {
 public:
  static constexpr size_t kBlock = 512;
  static constexpr uint32_t kDefaultMiB = 64;

  // Parámetros de tiempo del modelo (MODEL.md §Tiempos).
  static constexpr jwsim_ns_t kInitTime = 100 * JWSIM_NS_PER_MS;   // ACMD41 ocupado desde el primero
  static constexpr jwsim_ns_t kReadLatency = 100 * JWSIM_NS_PER_US; // hasta el token de datos
  static constexpr jwsim_ns_t kWriteBusy = 500 * JWSIM_NS_PER_US;   // programación de un bloque
  static constexpr jwsim_ns_t kStopBusy = 10 * JWSIM_NS_PER_US;     // R1b de CMD12 / token de parada

  explicit SdCard(uint32_t mib = kDefaultMiB);

  // Inserción: sin tarjeta no responde (MISO en reposo) y al insertarla
  // arranca apagada (hace falta CMD0 de nuevo).
  void set_inserted(bool inserted);
  bool inserted() const { return inserted_; }

  // Persistencia: "sd.img" (imagen cruda, si existe: se usa tal cual y se
  // escribe en su lugar) o "sd.bin" (solo los sectores no nulos). Sin
  // ninguno, la tarjeta nueva viene formateada FAT32 como de fábrica.
  void set_storage(const std::string &dir);
  bool save();
  // Imagen cruda completa (para exportar o comparar).
  std::vector<uint8_t> image() const;

  uint32_t sectors() const { return sectors_; }
  void read_sector(uint32_t lba, uint8_t *out) const;
  void write_sector(uint32_t lba, const uint8_t *in);

  // SPITarget
  void spi_select(bool selected) override;
  uint8_t spi_transfer(uint8_t mosi) override;

  static uint8_t crc7(const uint8_t *p, size_t n);
  static uint16_t crc16(const uint8_t *p, size_t n);

 private:
  enum class Phase { Idle, ReadWait, WriteToken, WriteData, Busy };
  enum class Data { None, Block, Csd, Cid, NumWr };

  void power_on_reset();
  void command(const uint8_t *cmd);
  void respond_r1(uint8_t r1);
  void queue_block(const uint8_t *data, size_t n);
  void start_read(Data what, uint32_t lba, bool multi);
  void finish_write_block();
  uint8_t r1_base() const { return idle_ ? 0x01 : 0x00; }
  void format_fat32();

  uint32_t sectors_;
  std::map<uint32_t, std::array<uint8_t, kBlock>> blocks_;   // solo sectores no nulos
  std::set<uint32_t> dirty_;
  bool all_dirty_ = false;
  std::string dir_;
  bool raw_image_ = false;

  bool inserted_ = true;
  bool selected_ = false;
  bool spi_mode_ = false;      // tras CMD0 con CS en bajo
  bool idle_ = true;
  bool crc_on_ = false;
  bool app_cmd_ = false;
  jwsim_ns_t init_start_ = 0;  // primer ACMD41 (0 = todavía no)

  uint8_t cmd_[6]{};
  int cmd_len_ = 0;
  std::deque<uint8_t> out_;
  Phase phase_ = Phase::Idle;
  Phase busy_next_ = Phase::Idle;   // fase al terminar Busy
  jwsim_ns_t until_ = 0;       // fin de la espera (ReadWait/Busy)
  Data data_ = Data::None;
  uint32_t lba_ = 0;
  bool multi_ = false;
  // Escritura.
  std::vector<uint8_t> wbuf_;
  uint32_t written_ = 0;       // bloques bien escritos en el último CMD25
};

} // namespace jwsim::models

#endif
