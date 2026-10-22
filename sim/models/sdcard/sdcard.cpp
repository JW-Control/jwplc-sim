// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Tarjeta microSD en modo SPI. Ver MODEL.md (comandos, respuestas, tokens,
// CRC, tiempos y formato de fábrica).
#include "jwsim/models/sdcard.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "jwsim/models/persist.h"

namespace jwsim::models {
namespace {

constexpr uint8_t kTokenSingle = 0xFE;     // bloque de datos (lectura y CMD24)
constexpr uint8_t kTokenMulti = 0xFC;      // bloque de CMD25
constexpr uint8_t kTokenStop = 0xFD;       // fin de CMD25
constexpr uint8_t kDataAccepted = 0x05;    // xxx0 010 1
constexpr uint8_t kDataCrcError = 0x0B;    // xxx0 101 1
constexpr uint8_t kDataWriteError = 0x0D;  // xxx0 110 1
constexpr uint8_t R1_IDLE = 0x01, R1_ILLEGAL = 0x04, R1_CRC = 0x08, R1_PARAM = 0x40;
constexpr jwsim_ns_t kRegisterLatency = 10 * JWSIM_NS_PER_US;   // CSD/CID/ACMD22

void put16(uint8_t *p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v);
  p[1] = static_cast<uint8_t>(v >> 8);
}
void put32(uint8_t *p, uint32_t v) {
  for (int i = 0; i < 4; ++i) p[i] = static_cast<uint8_t>(v >> (8 * i));
}

bool all_zero(const uint8_t *p) {
  for (size_t i = 0; i < SdCard::kBlock; ++i) {
    if (p[i]) return false;
  }
  return true;
}

} // namespace

SdCard::SdCard(uint32_t mib) : sectors_(mib * 2048u) {
  format_fat32();
  dirty_.clear();
  power_on_reset();
}

uint8_t SdCard::crc7(const uint8_t *p, size_t n) {
  uint8_t crc = 0;
  for (size_t i = 0; i < n; ++i) {
    uint8_t b = p[i];
    for (int k = 0; k < 8; ++k) {
      crc <<= 1;
      if ((b ^ crc) & 0x80) crc ^= 0x09;
      b <<= 1;
    }
  }
  return crc & 0x7F;
}

uint16_t SdCard::crc16(const uint8_t *p, size_t n) {
  uint16_t crc = 0;
  for (size_t i = 0; i < n; ++i) {
    crc ^= static_cast<uint16_t>(p[i]) << 8;
    for (int k = 0; k < 8; ++k) crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
  }
  return crc;
}

void SdCard::power_on_reset() {
  spi_mode_ = false;
  idle_ = true;
  crc_on_ = false;
  app_cmd_ = false;
  init_start_ = 0;
  cmd_len_ = 0;
  out_.clear();
  phase_ = Phase::Idle;
  data_ = Data::None;
  multi_ = false;
}

void SdCard::set_inserted(bool inserted) {
  if (inserted == inserted_) return;
  inserted_ = inserted;
  power_on_reset();
}

// ------------------------------------------------------------------ sectores
void SdCard::read_sector(uint32_t lba, uint8_t *out) const {
  auto it = blocks_.find(lba);
  if (it == blocks_.end()) std::memset(out, 0, kBlock);
  else std::memcpy(out, it->second.data(), kBlock);
}

void SdCard::write_sector(uint32_t lba, const uint8_t *in) {
  if (lba >= sectors_) return;
  if (all_zero(in)) blocks_.erase(lba);
  else std::memcpy(blocks_[lba].data(), in, kBlock);
  dirty_.insert(lba);
}

std::vector<uint8_t> SdCard::image() const {
  std::vector<uint8_t> img(static_cast<size_t>(sectors_) * kBlock, 0);
  for (const auto &[lba, b] : blocks_) std::memcpy(img.data() + static_cast<size_t>(lba) * kBlock, b.data(), kBlock);
  return img;
}

// ------------------------------------------------------------------ persistencia
// sd.bin: "JWSD", u32 versión 1, u32 sectores, u32 n, n × (u32 lba, 512 bytes)
// en orden de lba (solo sectores no nulos).
void SdCard::set_storage(const std::string &dir) {
  dir_ = dir;
  raw_image_ = false;
  std::vector<uint8_t> data;
  if (read_file(join_path(dir_, "sd.img"), data) && data.size() >= kBlock) {
    raw_image_ = true;
    sectors_ = static_cast<uint32_t>(data.size() / kBlock);
    blocks_.clear();
    for (uint32_t lba = 0; lba < sectors_; ++lba) {
      const uint8_t *p = data.data() + static_cast<size_t>(lba) * kBlock;
      if (!all_zero(p)) std::memcpy(blocks_[lba].data(), p, kBlock);
    }
    dirty_.clear();
    return;
  }
  if (read_file(join_path(dir_, "sd.bin"), data)) {
    StateReader r(data.data(), data.size());
    char magic[4];
    r.bytes(magic, 4);
    if (r.ok() && std::memcmp(magic, "JWSD", 4) == 0 && r.u32() == 1) {
      sectors_ = r.u32();
      const uint32_t n = r.u32();
      blocks_.clear();
      for (uint32_t i = 0; i < n && r.ok(); ++i) {
        const uint32_t lba = r.u32();
        r.bytes(blocks_[lba].data(), kBlock);
      }
      if (r.ok()) {
        dirty_.clear();
        return;
      }
    }
    std::fprintf(stderr, "[jwsim] sd.bin inválido: se usa una tarjeta nueva\n");
  }
  // Tarjeta nueva (formateada de fábrica): se guarda en el próximo save().
  blocks_.clear();
  format_fat32();
  all_dirty_ = true;
}

bool SdCard::save() {
  if (dir_.empty() || (dirty_.empty() && !all_dirty_)) return true;
  bool ok = true;
  if (raw_image_) {
    // Imagen cruda del usuario: solo los sectores que cambiaron.
    FILE *f = std::fopen(join_path(dir_, "sd.img").c_str(), "r+b");
    if (!f) return false;
    uint8_t buf[kBlock];
    for (uint32_t lba : dirty_) {
      read_sector(lba, buf);
      ok = ok && std::fseek(f, static_cast<long>(lba) * static_cast<long>(kBlock), SEEK_SET) == 0 &&
           std::fwrite(buf, 1, kBlock, f) == kBlock;
    }
    ok = (std::fclose(f) == 0) && ok;
  } else {
    StateWriter w;
    w.bytes("JWSD", 4);
    w.u32(1);
    w.u32(sectors_);
    w.u32(static_cast<uint32_t>(blocks_.size()));
    for (const auto &[lba, b] : blocks_) {
      w.u32(lba);
      w.bytes(b.data(), kBlock);
    }
    ok = write_file_atomic(join_path(dir_, "sd.bin"), w.data().data(), w.data().size());
  }
  if (ok) {
    dirty_.clear();
    all_dirty_ = false;
  }
  return ok;
}

// ------------------------------------------------------------------ formato
// Como una tarjeta nueva: MBR con una partición FAT32 (tipo 0x0C) alineada a
// 1 MiB; clúster de 512 B hasta 260 MiB, 4 KiB hasta 8 GiB, luego 16/32 KiB
// (tamaños de clúster de FAT32 de Windows).
void SdCard::format_fat32() {
  const uint32_t part = 2048;
  const uint32_t size = sectors_ - part;
  const uint32_t mib = sectors_ / 2048;
  const uint32_t spc = mib <= 260 ? 1 : mib <= 8192 ? 8 : mib <= 16384 ? 16 : 32;
  const uint32_t rsvd = 32;
  uint32_t fatsz = 1, clusters = 0;
  for (;;) {
    clusters = (size - rsvd - 2 * fatsz) / spc;
    const uint32_t need = ((clusters + 2) * 4 + kBlock - 1) / kBlock;
    if (need <= fatsz) break;
    fatsz = need;
  }
  uint8_t s[kBlock];

  std::memset(s, 0, kBlock);   // MBR
  uint8_t *pe = s + 446;
  pe[0] = 0x00;
  pe[1] = 0xFE; pe[2] = 0xFF; pe[3] = 0xFF;   // CHS: solo LBA
  pe[4] = 0x0C;                                // FAT32 LBA
  pe[5] = 0xFE; pe[6] = 0xFF; pe[7] = 0xFF;
  put32(pe + 8, part);
  put32(pe + 12, size);
  s[510] = 0x55;
  s[511] = 0xAA;
  write_sector(0, s);

  std::memset(s, 0, kBlock);   // sector de arranque FAT32
  const uint8_t jump[3] = {0xEB, 0x58, 0x90};
  std::memcpy(s, jump, 3);
  std::memcpy(s + 3, "MSDOS5.0", 8);
  put16(s + 11, kBlock);
  s[13] = static_cast<uint8_t>(spc);
  put16(s + 14, static_cast<uint16_t>(rsvd));
  s[16] = 2;
  s[21] = 0xF8;
  put16(s + 24, 63);
  put16(s + 26, 255);
  put32(s + 28, part);
  put32(s + 32, size);
  put32(s + 36, fatsz);
  put32(s + 44, 2);            // clúster raíz
  put16(s + 48, 1);            // FSInfo
  put16(s + 50, 6);            // copia del arranque
  s[64] = 0x80;
  s[66] = 0x29;
  put32(s + 67, 0x4A575344);   // número de serie del volumen
  std::memcpy(s + 71, "NO NAME    ", 11);
  std::memcpy(s + 82, "FAT32   ", 8);
  s[510] = 0x55;
  s[511] = 0xAA;
  write_sector(part, s);
  write_sector(part + 6, s);

  std::memset(s, 0, kBlock);   // FSInfo
  put32(s, 0x41615252);
  put32(s + 484, 0x61417272);
  put32(s + 488, clusters - 1);   // libres (el raíz ocupa uno)
  put32(s + 492, 3);
  put32(s + 508, 0xAA550000);
  write_sector(part + 1, s);
  write_sector(part + 7, s);

  std::memset(s, 0, kBlock);   // FAT 1 y 2: medio, reservado, raíz = fin de cadena
  put32(s, 0x0FFFFFF8);
  put32(s + 4, 0x0FFFFFFF);
  put32(s + 8, 0x0FFFFFFF);
  write_sector(part + rsvd, s);
  write_sector(part + rsvd + fatsz, s);
}

// ------------------------------------------------------------------ SPI
void SdCard::spi_select(bool selected) {
  selected_ = selected;
  if (selected) return;
  // Al soltar el CS se aborta lo que estaba a medias; la programación de un
  // bloque (Busy) sigue su curso.
  cmd_len_ = 0;
  out_.clear();
  if (phase_ != Phase::Busy) phase_ = Phase::Idle;
}

void SdCard::respond_r1(uint8_t r1) {
  out_.push_back(0xFF);   // NCR = 1 byte
  out_.push_back(r1);
}

void SdCard::queue_block(const uint8_t *data, size_t n) {
  out_.push_back(kTokenSingle);
  out_.insert(out_.end(), data, data + n);
  const uint16_t crc = crc16(data, n);
  out_.push_back(static_cast<uint8_t>(crc >> 8));
  out_.push_back(static_cast<uint8_t>(crc));
}

void SdCard::start_read(Data what, uint32_t lba, bool multi) {
  data_ = what;
  lba_ = lba;
  multi_ = multi;
  phase_ = Phase::ReadWait;
  until_ = jwsim_now() + (what == Data::Block ? kReadLatency : kRegisterLatency);
}

void SdCard::command(const uint8_t *c) {
  const uint8_t idx = c[0] & 0x3F;
  static const bool trace = std::getenv("JWSIM_SD_TRACE") != nullptr;
  if (trace) std::fprintf(stderr, "[sd] t=%.3f %sCMD%u %02x%02x%02x%02x crc=%02x spi=%d idle=%d\n", jwsim_now() / 1e6, app_cmd_ ? "A" : "", idx, c[1], c[2], c[3], c[4], c[5], spi_mode_, idle_);
  const uint32_t arg = static_cast<uint32_t>(c[1]) << 24 | static_cast<uint32_t>(c[2]) << 16 |
                       static_cast<uint32_t>(c[3]) << 8 | c[4];
  // En modo SD solo CMD0 (con CS en bajo y CRC válido) pasa a modo SPI.
  if (!spi_mode_ && idx != 0) return;
  const bool crc_ok = static_cast<uint8_t>((crc7(c, 5) << 1) | 1) == c[5];
  if ((crc_on_ || idx == 0 || idx == 8) && !crc_ok) {
    if (spi_mode_) respond_r1(r1_base() | R1_CRC);
    return;
  }
  const bool acmd = app_cmd_;
  app_cmd_ = false;
  const uint8_t base = r1_base();
  auto illegal = [&] { respond_r1(base | R1_ILLEGAL); };

  if (acmd) {
    switch (idx) {
      case 41: {   // SD_SEND_OP_COND
        const jwsim_ns_t now = jwsim_now();
        if (!init_start_) init_start_ = now;
        // SDHC: sin HCS la tarjeta nunca termina de inicializar.
        if ((arg & (1u << 30)) && now - init_start_ >= kInitTime) idle_ = false;
        respond_r1(r1_base());
        return;
      }
      case 42:     // SET_CLR_CARD_DETECT
      case 23:     // SET_WR_BLK_ERASE_COUNT
        if (idle_) return illegal();
        respond_r1(base);
        return;
      case 22:     // SEND_NUM_WR_BLOCKS
        if (idle_) return illegal();
        respond_r1(base);
        start_read(Data::NumWr, 0, false);
        return;
      default: break;   // como comando normal
    }
  }
  switch (idx) {
    case 0:   // GO_IDLE_STATE
      power_on_reset();
      spi_mode_ = true;
      respond_r1(R1_IDLE);
      return;
    case 8:   // SEND_IF_COND: R7 con eco del patrón y del voltaje aceptado
      respond_r1(base);
      out_.insert(out_.end(), {0x00, 0x00, static_cast<uint8_t>(c[3] & 0x0F), c[4]});
      return;
    case 58: {   // READ_OCR: 2,7–3,6 V; bit 31 listo; bit 30 CCS (SDHC)
      uint32_t ocr = 0x00FF8000;
      if (!idle_) ocr |= 0xC0000000u;
      respond_r1(base);
      out_.insert(out_.end(), {static_cast<uint8_t>(ocr >> 24), static_cast<uint8_t>(ocr >> 16),
                               static_cast<uint8_t>(ocr >> 8), static_cast<uint8_t>(ocr)});
      return;
    }
    case 59:  // CRC_ON_OFF
      crc_on_ = arg & 1;
      respond_r1(base);
      return;
    case 55:  // APP_CMD
      app_cmd_ = true;
      respond_r1(base);
      return;
    case 13:  // SEND_STATUS: R2
      respond_r1(base);
      out_.push_back(0x00);
      return;
    case 9:
    case 10:  // SEND_CSD / SEND_CID
      if (idle_) return illegal();
      respond_r1(base);
      start_read(idx == 9 ? Data::Csd : Data::Cid, 0, false);
      return;
    case 16:  // SET_BLOCKLEN: en SDHC el bloque es siempre de 512
      if (idle_) return illegal();
      respond_r1(base);
      return;
    case 17:
    case 18:  // READ_SINGLE_BLOCK / READ_MULTIPLE_BLOCK (dirección por bloque)
      if (idle_) return illegal();
      if (arg >= sectors_) return respond_r1(base | R1_PARAM);
      respond_r1(base);
      start_read(Data::Block, arg, idx == 18);
      return;
    case 12:  // STOP_TRANSMISSION: byte de relleno, R1b
      out_.clear();
      out_.push_back(0xFF);
      out_.push_back(base);
      multi_ = false;
      phase_ = Phase::Busy;
      busy_next_ = Phase::Idle;
      until_ = jwsim_now() + kStopBusy;
      return;
    case 24:
    case 25:  // WRITE_BLOCK / WRITE_MULTIPLE_BLOCK
      if (idle_) return illegal();
      if (arg >= sectors_) return respond_r1(base | R1_PARAM);
      respond_r1(base);
      lba_ = arg;
      multi_ = idx == 25;
      written_ = 0;
      phase_ = Phase::WriteToken;
      return;
    default:
      illegal();
      return;
  }
}

void SdCard::finish_write_block() {
  const uint16_t got = static_cast<uint16_t>(wbuf_[kBlock] << 8 | wbuf_[kBlock + 1]);
  if (crc_on_ && got != crc16(wbuf_.data(), kBlock)) {
    out_.push_back(kDataCrcError);
    phase_ = multi_ ? Phase::WriteToken : Phase::Idle;
    return;
  }
  if (lba_ >= sectors_) {
    out_.push_back(kDataWriteError);
    phase_ = multi_ ? Phase::WriteToken : Phase::Idle;
    return;
  }
  write_sector(lba_, wbuf_.data());
  ++written_;
  ++lba_;
  out_.push_back(kDataAccepted);
  phase_ = Phase::Busy;
  busy_next_ = multi_ ? Phase::WriteToken : Phase::Idle;
  until_ = jwsim_now() + kWriteBusy;
}

uint8_t SdCard::spi_transfer(uint8_t mosi) {
  if (!inserted_ || !selected_) return 0xFF;
  const jwsim_ns_t now = jwsim_now();

  // MISO: respuestas pendientes, luego el estado.
  uint8_t miso = 0xFF;
  if (!out_.empty()) {
    miso = out_.front();
    out_.pop_front();
  } else if (phase_ == Phase::Busy) {
    if (now < until_) miso = 0x00;
    else phase_ = busy_next_;
  } else if (phase_ == Phase::ReadWait && now >= until_) {
    uint8_t buf[kBlock];
    switch (data_) {
      case Data::Block:
        read_sector(lba_, buf);
        queue_block(buf, kBlock);
        break;
      case Data::Csd: {
        // CSD versión 2.0 (SDHC): C_SIZE = sectores / 1024 − 1.
        const uint32_t c_size = sectors_ / 1024 - 1;
        uint8_t csd[16] = {0x40, 0x0E, 0x00, 0x32, 0x5B, 0x59, 0x00, static_cast<uint8_t>((c_size >> 16) & 0x3F),
                           static_cast<uint8_t>(c_size >> 8), static_cast<uint8_t>(c_size), 0x7F, 0x80, 0x0A, 0x40, 0x00, 0};
        csd[15] = static_cast<uint8_t>(crc7(csd, 15) << 1 | 1);
        queue_block(csd, 16);
        break;
      }
      case Data::Cid: {
        // MID 0x4A, OID "JW", PNM "JWSIM", PRV 1.0, PSN, MDT 2026-10.
        uint8_t cid[16] = {0x4A, 'J', 'W', 'J', 'W', 'S', 'I', 'M', 0x10, 0x4A, 0x57, 0x53, 0x44, 0x01, 0xAA, 0};
        cid[15] = static_cast<uint8_t>(crc7(cid, 15) << 1 | 1);
        queue_block(cid, 16);
        break;
      }
      case Data::NumWr: {
        const uint8_t n[4] = {static_cast<uint8_t>(written_ >> 24), static_cast<uint8_t>(written_ >> 16),
                              static_cast<uint8_t>(written_ >> 8), static_cast<uint8_t>(written_)};
        queue_block(n, 4);
        break;
      }
      case Data::None: break;
    }
    miso = out_.front();
    out_.pop_front();
    if (data_ == Data::Block && multi_ && lba_ + 1 < sectors_) {
      ++lba_;   // el siguiente bloque sigue sin latencia hasta CMD12
      until_ = now;
    } else {
      phase_ = Phase::Idle;
    }
  }

  // MOSI.
  switch (phase_) {
    case Phase::WriteToken:
      if (mosi == (multi_ ? kTokenMulti : kTokenSingle)) {
        phase_ = Phase::WriteData;
        wbuf_.clear();
      } else if (multi_ && mosi == kTokenStop) {
        phase_ = Phase::Busy;
        busy_next_ = Phase::Idle;
        until_ = now + kStopBusy;
        multi_ = false;
      }
      return miso;
    case Phase::WriteData:
      wbuf_.push_back(mosi);
      if (wbuf_.size() == kBlock + 2) finish_write_block();
      return miso;
    case Phase::Busy:
      return miso;
    default: break;
  }
  if (cmd_len_ == 0) {
    if ((mosi & 0xC0) == 0x40) cmd_[cmd_len_++] = mosi;
  } else {
    cmd_[cmd_len_++] = mosi;
    if (cmd_len_ == 6) {
      cmd_len_ = 0;
      command(cmd_);
    }
  }
  return miso;
}

} // namespace jwsim::models
